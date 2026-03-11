/**
 * Identity Context Service
 * ========================
 * Infers who the user actually IS from their existing memory stream —
 * life stage, cultural orientation, career salience, approximate age.
 *
 * No new API calls. Pure signal extraction from already-stored memories.
 * Cached 4h in Redis (matches twin summary TTL). In-memory fallback when Redis unavailable.
 *
 * Output shape:
 *   {
 *     lifeStage:            'student' | 'early_adult' | 'young_professional' | 'mid_career' | 'senior' | 'unknown'
 *     culturalOrientation:  'individualist' | 'collectivist' | 'mixed' | 'unknown'
 *     careerSalience:       'high' | 'medium' | 'low' | 'unknown'
 *     approximateAge:       number | null
 *     promptFragment:       string   // ready-to-inject 1-liner for expert prompts
 *     twinVoiceHint:        string   // short hint injected into twin voice section
 *     confidence:           number   // 0-1
 *     inferredAt:           string   // ISO timestamp
 *   }
 *
 * Usage:
 *   import { inferIdentityContext } from './identityContextService.js';
 *   const ctx = await inferIdentityContext(userId);
 *   // ctx.promptFragment → inject into reflection prompt preamble
 *   // ctx.twinVoiceHint → inject into twin chat additional context
 */

import { retrieveMemories, addMemory } from './memoryStreamService.js';
import { complete } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { get as redisGet, set as redisSet, del as redisDel, CACHE_TTL, CACHE_KEYS } from './redisClient.js';

const CACHE_TTL_MS = CACHE_TTL.IDENTITY_CONTEXT * 1000; // 4 hours in ms (matches twin summary TTL)
const CACHE_TTL_S = CACHE_TTL.IDENTITY_CONTEXT;          // 4 hours in seconds (for Redis)

// In-memory fallback cache: used when Redis is unavailable
const identityFallbackCache = new Map();

/**
 * Infer identity context for a user from their memory stream.
 * Cached 4h in Redis. Non-blocking when stored fact exists.
 *
 * @param {string} userId
 * @returns {Promise<object>} Identity context object
 */
export async function inferIdentityContext(userId) {
  // 1. Check Redis cache first (survives cold starts)
  try {
    const redisCached = await redisGet(CACHE_KEYS.identityContext(userId));
    if (redisCached) {
      console.log(`[IdentityContext] Redis cache HIT for ${userId}`);
      return redisCached;
    }
  } catch { /* Redis unavailable — fall through */ }

  // 1b. Fallback: in-memory cache (for when Redis is down)
  const fallback = identityFallbackCache.get(userId);
  if (fallback && Date.now() - fallback.timestamp < CACHE_TTL_MS) {
    return fallback.data;
  }

  // 2. Check DB for recently-stored identity fact (avoid re-inference on server restart)
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data: existingFact } = await supabaseAdmin
      .from('user_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'fact')
      .filter('metadata->>source', 'eq', 'identity_inference')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingFact && existingFact.length > 0) {
      const parsed = parseStoredIdentityFact(existingFact[0].content);
      if (parsed) {
        // Populate Redis + in-memory fallback
        _setIdentityCache(userId, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[IdentityContext] DB cache check failed (non-fatal):', err.message);
  }

  // 3. Gather signals from memory stream in parallel
  let signals;
  try {
    signals = await gatherSignals(userId);
  } catch (err) {
    console.warn('[IdentityContext] Signal gathering failed:', err.message);
    return defaultIdentityContext();
  }

  if (!signals.hasEnoughData) {
    console.log('[IdentityContext] Insufficient signals, returning unknown context');
    return defaultIdentityContext();
  }

  // 4. Run LLM inference (Mistral Small — cheap structured extraction)
  let identityContext;
  try {
    identityContext = await runIdentityInference(signals);
  } catch (err) {
    console.warn('[IdentityContext] LLM inference failed:', err.message);
    return defaultIdentityContext();
  }

  // 5. Store as importance=8 fact memory (non-blocking) so it persists across server restarts
  storeIdentityFact(userId, identityContext).catch(err =>
    console.warn('[IdentityContext] Failed to store fact:', err.message)
  );

  // 6. Cache in Redis + in-memory fallback
  _setIdentityCache(userId, identityContext);

  console.log(`[IdentityContext] Inferred for ${userId}: lifeStage=${identityContext.lifeStage}, career=${identityContext.careerSalience}, age≈${identityContext.approximateAge}`);
  return identityContext;
}

// ────────────────────────────────────────────────────────────────────────────
// Signal Gathering
// ────────────────────────────────────────────────────────────────────────────

async function gatherSignals(userId) {
  // Parallel retrieval across identity-relevant domains
  const [musicMemories, calendarMemories, careerMemories, contentMemories, socialMemories] = await Promise.all([
    retrieveMemories(userId, 'music listening era decade artist genre vintage nostalgia classic contemporary', 8, 'reflection'),
    retrieveMemories(userId, 'calendar meetings work schedule professional time management busy dense', 8, 'reflection'),
    retrieveMemories(userId, 'linkedin career job title professional skills ambition growth work identity', 8, 'reflection'),
    retrieveMemories(userId, 'youtube learning educational content hobbies interests creative curiosity study', 6, 'reflection'),
    retrieveMemories(userId, 'discord community online social server interests identity', 6, 'reflection'),
  ]);

  const totalMemories = musicMemories.length + calendarMemories.length + careerMemories.length + contentMemories.length + socialMemories.length;

  return {
    hasEnoughData: totalMemories >= 5,
    musicSignals: musicMemories.map(m => m.content.substring(0, 250)).join('\n'),
    calendarSignals: calendarMemories.map(m => m.content.substring(0, 250)).join('\n'),
    careerSignals: careerMemories.map(m => m.content.substring(0, 250)).join('\n'),
    contentSignals: contentMemories.map(m => m.content.substring(0, 250)).join('\n'),
    socialSignals: socialMemories.map(m => m.content.substring(0, 250)).join('\n'),
    totalMemories,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// LLM Inference
// ────────────────────────────────────────────────────────────────────────────

async function runIdentityInference(signals) {
  const prompt = buildInferencePrompt(signals);

  const result = await complete({
    tier: 'extraction',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 300,
    temperature: 0,
    serviceName: 'identity-inference',
  });

  const raw = (result.content || '').trim();
  return parseInferenceResponse(raw);
}

function buildInferencePrompt(signals) {
  const sections = [];

  if (signals.musicSignals) {
    sections.push(`Music patterns:\n${signals.musicSignals}`);
  }
  if (signals.calendarSignals) {
    sections.push(`Schedule/work patterns:\n${signals.calendarSignals}`);
  }
  if (signals.careerSignals) {
    sections.push(`Career/professional signals:\n${signals.careerSignals}`);
  }
  if (signals.contentSignals) {
    sections.push(`Content/learning interests:\n${signals.contentSignals}`);
  }
  if (signals.socialSignals) {
    sections.push(`Social/community patterns:\n${signals.socialSignals}`);
  }

  return `Based on these behavioral patterns, infer this person's identity context.

${sections.join('\n\n')}

Respond with ONLY this JSON (no markdown, no explanation):
{
  "lifeStage": "student|early_adult|young_professional|mid_career|senior|unknown",
  "culturalOrientation": "individualist|collectivist|mixed|unknown",
  "careerSalience": "high|medium|low|unknown",
  "approximateAge": <number or null>,
  "confidence": <0.0-1.0>
}

Guidelines:
- lifeStage: student = still in education, early_adult = 20-26 exploring, young_professional = 24-35 career-building, mid_career = 35+ established
- careerSalience: high = career is central identity, medium = career is one of several priorities, low = career is just a means
- approximateAge: infer from music era preferences (listening to 90s nostalgia → likely 30s, 2010s → 20s), content maturity, career stage signals. null if genuinely unclear.
- culturalOrientation: individualist = individual achievement focus, collectivist = family/community/group focus
- confidence: how certain you are, given available evidence`;
}

function parseInferenceResponse(raw) {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    const lifeStage = validateEnum(parsed.lifeStage, ['student', 'early_adult', 'young_professional', 'mid_career', 'senior', 'unknown'], 'unknown');
    const culturalOrientation = validateEnum(parsed.culturalOrientation, ['individualist', 'collectivist', 'mixed', 'unknown'], 'unknown');
    const careerSalience = validateEnum(parsed.careerSalience, ['high', 'medium', 'low', 'unknown'], 'unknown');
    const approximateAge = typeof parsed.approximateAge === 'number' ? Math.round(parsed.approximateAge) : null;
    const confidence = typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;

    const identityContext = {
      lifeStage,
      culturalOrientation,
      careerSalience,
      approximateAge,
      confidence,
      promptFragment: buildPromptFragment({ lifeStage, culturalOrientation, careerSalience, approximateAge }),
      twinVoiceHint: buildTwinVoiceHint({ lifeStage, culturalOrientation, careerSalience, approximateAge }),
      inferredAt: new Date().toISOString(),
    };

    return identityContext;
  } catch (err) {
    console.warn('[IdentityContext] Failed to parse LLM response:', err.message, '| raw:', raw.substring(0, 200));
    return defaultIdentityContext();
  }
}

function validateEnum(value, validValues, fallback) {
  return validValues.includes(value) ? value : fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt Fragment Builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a concise 1-2 sentence context block for injection into expert reflection prompts.
 * This tells the expert HOW to frame their observations for this specific person.
 */
function buildPromptFragment({ lifeStage, culturalOrientation, careerSalience, approximateAge }) {
  const parts = [];

  // Age / life stage
  const stageLabel = {
    student: 'in their student years',
    early_adult: 'in early adulthood (likely early-to-mid 20s)',
    young_professional: 'in a career-building phase (likely mid-20s to mid-30s)',
    mid_career: 'in a mid-career phase (likely late 30s to 40s+)',
    senior: 'in their senior years',
    unknown: null,
  }[lifeStage];

  if (stageLabel) {
    const ageSuffix = approximateAge ? ` (~${approximateAge}s)` : '';
    parts.push(`This person appears to be ${stageLabel}${ageSuffix}.`);
  } else if (approximateAge) {
    parts.push(`This person appears to be approximately ${approximateAge} years old.`);
  }

  // Career salience
  const careerLabel = {
    high: 'Career and professional identity are central to how they see themselves.',
    medium: 'Career is one of several competing priorities in their life.',
    low: 'Work appears to be a means to an end rather than a core identity.',
    unknown: null,
  }[careerSalience];
  if (careerLabel) parts.push(careerLabel);

  // Cultural orientation
  const cultureLabel = {
    individualist: 'Their patterns skew individualist: personal achievement, autonomy, and self-development.',
    collectivist: 'Their patterns skew collectivist: community, relationships, and group belonging.',
    mixed: 'Their patterns show a mixed orientation: individual ambition alongside strong community ties.',
    unknown: null,
  }[culturalOrientation];
  if (cultureLabel) parts.push(cultureLabel);

  if (parts.length === 0) return '';

  parts.push('Frame your observations accordingly — avoid framing that doesn\'t fit their life stage or values.');

  return `[IDENTITY CONTEXT]\n${parts.join(' ')}`;
}

/**
 * Build a short hint for injection into twin chat (conditions voice tone).
 */
function buildTwinVoiceHint({ lifeStage, culturalOrientation, careerSalience, approximateAge }) {
  const hints = [];

  if (careerSalience === 'high') {
    hints.push('They care a lot about career and growth — weave in work/ambition framing naturally.');
  } else if (careerSalience === 'low') {
    hints.push('Work is not their primary identity — avoid over-referencing career.');
  }

  if (lifeStage === 'student' || lifeStage === 'early_adult') {
    hints.push('They\'re still figuring things out — curiosity and exploration framing fits better than settled wisdom.');
  } else if (lifeStage === 'mid_career' || lifeStage === 'senior') {
    hints.push('They have a track record — acknowledge their experience and depth, not just potential.');
  }

  if (culturalOrientation === 'collectivist') {
    hints.push('Reference relationships and community naturally; don\'t frame everything as individual achievement.');
  }

  if (!hints.length) return '';
  return `Identity framing: ${hints.join(' ')}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Storage + Serialization
// ────────────────────────────────────────────────────────────────────────────

async function storeIdentityFact(userId, identityContext) {
  // Build a human-readable fact string (also used as the DB cache)
  const factContent = serializeIdentityContext(identityContext);

  await addMemory(userId, factContent, 'fact', { source: 'identity_inference' }, {
    importanceScore: 8,
    skipImportance: true,
  });

  console.log(`[IdentityContext] Stored identity fact for ${userId}`);
}

function serializeIdentityContext(ctx) {
  const parts = ['Inferred identity context:'];
  if (ctx.lifeStage !== 'unknown') parts.push(`life stage = ${ctx.lifeStage}`);
  if (ctx.approximateAge) parts.push(`approximate age = ~${ctx.approximateAge}`);
  if (ctx.careerSalience !== 'unknown') parts.push(`career salience = ${ctx.careerSalience}`);
  if (ctx.culturalOrientation !== 'unknown') parts.push(`cultural orientation = ${ctx.culturalOrientation}`);
  parts.push(`(confidence ${(ctx.confidence * 100).toFixed(0)}%, inferred ${new Date(ctx.inferredAt).toDateString()})`);

  // Also embed the prompt fragment so parseStoredIdentityFact can recover it
  return `${parts.join(', ')}. ||promptFragment:${ctx.promptFragment}||twinVoiceHint:${ctx.twinVoiceHint}||`;
}

function parseStoredIdentityFact(content) {
  try {
    const pfMatch = content.match(/\|\|promptFragment:(.*?)\|\|twinVoiceHint:(.*?)\|\|/s);
    if (!pfMatch) return null;

    // Parse the structured part
    const lifeStageMatch = content.match(/life stage = (\w+)/);
    const ageMatch = content.match(/approximate age = ~(\d+)/);
    const careerMatch = content.match(/career salience = (\w+)/);
    const cultureMatch = content.match(/cultural orientation = (\w+)/);
    const confMatch = content.match(/confidence (\d+)%/);

    return {
      lifeStage: lifeStageMatch?.[1] || 'unknown',
      approximateAge: ageMatch ? parseInt(ageMatch[1]) : null,
      careerSalience: careerMatch?.[1] || 'unknown',
      culturalOrientation: cultureMatch?.[1] || 'unknown',
      confidence: confMatch ? parseInt(confMatch[1]) / 100 : 0.5,
      promptFragment: pfMatch[1].trim(),
      twinVoiceHint: pfMatch[2].trim(),
      inferredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function defaultIdentityContext() {
  return {
    lifeStage: 'unknown',
    culturalOrientation: 'unknown',
    careerSalience: 'unknown',
    approximateAge: null,
    confidence: 0,
    promptFragment: '',
    twinVoiceHint: '',
    inferredAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Cache Helpers (Redis + in-memory fallback)
// ────────────────────────────────────────────────────────────────────────────

async function _setIdentityCache(userId, data) {
  // Redis (primary — survives cold starts)
  try {
    await redisSet(CACHE_KEYS.identityContext(userId), data, CACHE_TTL_S);
  } catch { /* Redis unavailable */ }
  // In-memory fallback
  identityFallbackCache.set(userId, { data, timestamp: Date.now() });
}

/**
 * Invalidate the cache for a user (call when significant new data arrives).
 * @param {string} userId
 */
export async function invalidateIdentityCache(userId) {
  try {
    await redisDel(CACHE_KEYS.identityContext(userId));
  } catch { /* Redis unavailable */ }
  identityFallbackCache.delete(userId);
}
