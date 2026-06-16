/**
 * Revelations — the "what your twin sees about you" PULL surface (2026-06-16)
 * ==========================================================================
 * The proactive-insight Editor answers one question: "should the twin INTERRUPT
 * you with this in chat?" For a sustained pattern ("Claude is where your mind
 * settles", "you're building Squad") the honest answer is no — don't nag. So the
 * Editor (correctly) holds those back from the chat feed.
 *
 * But this is the opposite context: a surface the user OPENS to look at their
 * own patterns. Here you WANT to show them — they came to see. So this endpoint
 * computes the first-party self-revelations DIRECTLY (the same gather/compute
 * primitives as the generators) WITHOUT the interrupt-gate, and caches the
 * result so a page load isn't an LLM call every time.
 *
 * First-party only: everything here runs on data we own (browser extension),
 * no third-party API to connect. Privacy: the user's own activity, reflected
 * only to them.
 */
import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import {
  gatherBrowsingDwell, computeAttentionGravity, buildAttentionGravityCandidate,
} from '../services/attentionGravity.js';
import {
  gatherWebContent, buildThemeCorpus, buildThemePrompt,
} from '../services/curiositySignature.js';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Revelations');
const router = express.Router();

const CACHE_TTL_MS = 12 * 3600_000; // recompute at most twice a day
// Both platform and data_type on user_platform_data have fixed CHECK allowlists,
// so we can't invent '_internal'/'revelations_cache'. Park the cache under
// ALLOWED values (platform 'web', type 'settings') with a distinct source_url:
// it passes both constraints and never collides with real browsing rows (the
// gathers filter data_type to extension_page_visit/extension_search_query).
const CACHE = { platform: 'web', data_type: 'settings', source_url: 'revelations:cache' };

async function readCache(userId) {
  const { data } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', CACHE.platform)
    .eq('data_type', CACHE.data_type)
    .eq('source_url', CACHE.source_url)
    .maybeSingle();
  if (!data?.raw_data) return null;
  const age = Date.now() - new Date(data.extracted_at).getTime();
  return age <= CACHE_TTL_MS ? data.raw_data : null;
}

async function writeCache(userId, payload) {
  await supabaseAdmin.from('user_platform_data').upsert({
    user_id: userId,
    platform: CACHE.platform,
    data_type: CACHE.data_type,
    source_url: CACHE.source_url,
    raw_data: payload,
    extracted_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform,data_type,source_url' });
}

// ── revelation computers (no Editor gate) ────────────────────────────────────
async function computeAttention(userId) {
  const events = await gatherBrowsingDwell(userId);
  const body = buildAttentionGravityCandidate(computeAttentionGravity(events));
  return body ? { kind: 'attention_gravity', title: 'Where your attention pools', body, source: 'web' } : null;
}

async function computeCuriosity(userId) {
  const { rawSearches, rawPages } = await gatherWebContent(userId);
  const corpus = buildThemeCorpus(rawSearches, rawPages);
  if (!corpus) return null;
  const r = await complete({
    tier: TIER_ANALYSIS,
    messages: [{ role: 'user', content: buildThemePrompt(corpus) }],
    maxTokens: 140,
    temperature: 0.5,
    userId,
    serviceName: 'revelations-curiosity',
  });
  const body = (r.content || '').trim().replace(/^["']|["']$/g, '');
  return (body && !/^none\.?$/i.test(body))
    ? { kind: 'curiosity_signature', title: "What you're chasing", body, source: 'web' }
    : null;
}

// ── GET /api/revelations ─────────────────────────────────────────────────────
router.get('/', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    if (req.query.refresh !== 'true') {
      const cached = await readCache(userId);
      if (cached) return res.json({ success: true, data: cached });
    }

    // Independent — one failing computer must not sink the other.
    const [attention, curiosity] = await Promise.all([
      computeAttention(userId).catch((e) => { log.warn('attention failed', { error: e.message }); return null; }),
      computeCuriosity(userId).catch((e) => { log.warn('curiosity failed', { error: e.message }); return null; }),
    ]);

    const payload = {
      revelations: [attention, curiosity].filter(Boolean),
      generatedAt: new Date().toISOString(),
    };
    await writeCache(userId, payload).catch((e) => log.warn('cache write failed', { error: e.message }));
    return res.json({ success: true, data: payload });
  } catch (error) {
    log.error('revelations failed', { userId, error: error.message });
    return res.status(500).json({ success: false, error: 'Failed to load revelations' });
  }
});

export default router;
