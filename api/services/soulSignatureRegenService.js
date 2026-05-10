/**
 * Soul Signature Auto-Regeneration
 *
 * Audit 2026-05-09 D-H2: the soul_signatures row is set during onboarding
 * (instant card from profile enrichment + Q&A) and never refreshes as the
 * memory stream grows. Test user had signature.updated_at 50 days stale
 * with 18,506 new memories ingested since — archetype frozen at first-day
 * state while the twin's understanding of the user kept evolving.
 *
 * This service regenerates the archetype card from the live memory stream,
 * weighted toward reflections (the LLM-distilled personality observations)
 * and recent facts. Reuses the same JSON contract as
 * onboarding-soul-signature.js so the upsert shape is identical.
 *
 * Trigger policy lives in cron-soul-signature-regen.js — this module is
 * pure (regenerate one user) and idempotent.
 */

import { complete, TIER_CHAT } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { getSoulSignature, upsertSoulSignature } from './soulSignatureService.js';
import { createLogger } from './logger.js';

const log = createLogger('SoulSignatureRegen');

const REFLECTIONS_LIMIT = 25;
const FACTS_LIMIT = 20;
const OBSERVATIONS_LIMIT = 10;

/**
 * Pull the highest-signal recent memories for a user to feed the regen prompt.
 * Prioritises reflections (LLM-distilled insights) and facts (extracted from
 * conversation) over raw platform_data, which is denser but lower-information.
 */
async function gatherRegenContext(userId) {
  const [reflectionsRes, factsRes, observationsRes] = await Promise.all([
    supabaseAdmin
      .from('user_memories')
      .select('content, importance_score, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(REFLECTIONS_LIMIT),
    supabaseAdmin
      .from('user_memories')
      .select('content, importance_score, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .order('importance_score', { ascending: false })
      .limit(FACTS_LIMIT),
    supabaseAdmin
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .order('created_at', { ascending: false })
      .limit(OBSERVATIONS_LIMIT),
  ]);

  const reflections = (reflectionsRes.data || []).map(m => `- ${m.content}`).join('\n');
  const facts = (factsRes.data || []).map(m => `- ${m.content}`).join('\n');
  const observations = (observationsRes.data || [])
    .map(m => {
      const platform = m.metadata?.platform || m.metadata?.source || 'unknown';
      return `- [${platform}] ${m.content.slice(0, 220)}`;
    })
    .join('\n');

  return { reflections, facts, observations };
}

/**
 * Regenerate the soul-signature archetype card for one user.
 *
 * Reads the live memory stream, runs one Claude call to produce the
 * archetype JSON, then upserts via the shared accessor (which invalidates
 * the in-process cache + sets updated_at server-side).
 *
 * Idempotent: safe to call multiple times. Does NOT enforce trigger policy
 * — that's the cron's job.
 *
 * @param {string} userId
 * @returns {Promise<{ ok: true, archetypeName: string, changedFromPrevious: boolean } | { ok: false, reason: string }>}
 */
export async function regenerateSoulSignature(userId) {
  if (!userId) return { ok: false, reason: 'no_user_id' };

  // Pull existing signature for continuity reference + change-detection
  const existing = await getSoulSignature(userId);
  const previousArchetype = existing?.archetype_name || null;

  const { reflections, facts, observations } = await gatherRegenContext(userId);

  // Refuse to regen if the memory stream is too thin — better to keep the
  // onboarding-derived signature than to overwrite it with a low-confidence
  // re-derivation. The cron also gates on this, but defense-in-depth: if
  // someone calls this directly, we still fail-soft.
  if (!reflections && !facts && observations.split('\n').length < 5) {
    return { ok: false, reason: 'insufficient_memory_signal' };
  }

  const systemPrompt = `You are refreshing a user's Soul Signature — a personality archetype card on TwinMe.

The signature was last set ${previousArchetype ? `with archetype "${previousArchetype}"` : 'during onboarding'}. Memory stream has accumulated since. Re-derive the archetype from the live data below, allowing it to evolve if the evidence warrants but preserving continuity when the user's core hasn't materially changed.

REFLECTIONS (LLM-distilled observations of personality, ordered by importance):
${reflections || '(none yet)'}

FACTS extracted from conversations:
${facts || '(none yet)'}

RECENT PLATFORM ACTIVITY:
${observations || '(none yet)'}

Generate an archetype that feels like the user looking in a mirror today. Specific and evocative, never generic.

BAD: "The Ambitious Leader", "The Creative Mind", "The Hard Worker"
GOOD: "The Midnight Architect", "The Curious Wanderer", "The Pattern Whisperer"

Respond in this exact JSON format:
{
  "archetype_name": "The [Evocative Name]",
  "core_traits": [
    {"trait": "Trait Name", "source": "Brief evidence from their memories"},
    {"trait": "Trait Name", "source": "Brief evidence from their memories"},
    {"trait": "Trait Name", "source": "Brief evidence from their memories"}
  ],
  "signature_quote": "A 1-sentence poetic description of who they are now",
  "first_impression": "A 2-3 sentence warm, personal paragraph about what makes them unique, grounded in the live memory stream"
}`;

  let signature;
  try {
    const result = await complete({
      tier: TIER_CHAT,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Refresh my soul signature from the memory stream.' }],
      maxTokens: 512,
      temperature: 0.8,
      userId,
      serviceName: 'soul-signature-regen',
    });
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Regen LLM returned no JSON block', { userId });
      return { ok: false, reason: 'llm_no_json' };
    }
    signature = JSON.parse(jsonMatch[0]);
  } catch (err) {
    log.warn('Regen LLM call failed', { userId, error: err?.message });
    return { ok: false, reason: 'llm_failed' };
  }

  if (!signature?.archetype_name) {
    return { ok: false, reason: 'llm_no_archetype' };
  }

  const upsertResult = await upsertSoulSignature(userId, {
    archetype_name: signature.archetype_name,
    archetype_subtitle: signature.signature_quote,
    narrative: signature.first_impression,
    defining_traits: signature.core_traits,
  });

  if (!upsertResult.ok) {
    log.warn('Regen upsert failed', { userId, error: upsertResult.error?.message });
    return { ok: false, reason: 'upsert_failed' };
  }

  const changedFromPrevious = previousArchetype && previousArchetype !== signature.archetype_name;
  log.info('Soul signature regenerated', {
    userId,
    previousArchetype,
    newArchetype: signature.archetype_name,
    changedFromPrevious,
  });

  return {
    ok: true,
    archetypeName: signature.archetype_name,
    changedFromPrevious: Boolean(changedFromPrevious),
  };
}

export default { regenerateSoulSignature };
