/**
 * Twin Identity API
 * =================
 * GET /api/twin/identity
 *
 * Returns a composite "Who You Are" payload:
 * - identity context (life stage, career salience, cultural orientation)
 * - soul_signature_profile (archetype, uniqueness markers, music signature, core values, summary)
 * - expert reflections: top 3 per expert persona
 * - twin_summaries: the latest synthesized summary for this user
 *
 * All DB fetches are nullable — any single failure degrades gracefully.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { inferIdentityContext } from '../services/identityContextService.js';
import { supabaseAdmin } from '../services/database.js';
import { get as cacheGet, set as cacheSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinIdentity');

const router = express.Router();

const EXPERT_KEYS = [
  'personality_psychologist',
  'lifestyle_analyst',
  'cultural_identity',
  'social_dynamics',
  'motivation_analyst',
];

/**
 * Fetch the soul_signature_profile row for this user.
 * Returns null if the row doesn't exist or the query fails.
 */
async function fetchProfile(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('soul_signature_profile')
      .select('archetype, uniqueness_markers, music_signature, core_values, personality_summary')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      log.warn('profile fetch error (non-fatal):', error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    log.warn('profile fetch threw (non-fatal):', err.message);
    return null;
  }
}

/**
 * Fetch up to 3 reflections per expert from user_memories.
 * Returns a map: { [expertKey]: string[] }
 */
async function fetchExpertReflections(userId) {
  const result = {};
  for (const key of EXPERT_KEYS) result[key] = [];

  try {
    // Single query for all experts (replaces 5 parallel queries)
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('content, metadata')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .in('metadata->>expert', EXPERT_KEYS)
      .order('importance_score', { ascending: false })
      .limit(25);

    if (error) {
      log.warn('expert reflections fetch failed (non-fatal):', error.message);
      return result;
    }

    // Group by expert, take top 3 per expert
    for (const row of (data ?? [])) {
      const expert = row.metadata?.expert;
      if (expert && result[expert] && result[expert].length < 3) {
        result[expert].push(row.content);
      }
    }
  } catch (err) {
    log.warn('expert reflections fetch threw (non-fatal):', err.message);
  }

  return result;
}

/**
 * Fetch the onboarding calibration data (archetype from deep interview).
 * Returns null if not found.
 */
async function fetchCalibration(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('onboarding_calibration')
      .select('archetype_hint, personality_summary')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      log.warn('calibration fetch error (non-fatal):', error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    log.warn('calibration fetch threw (non-fatal):', err.message);
    return null;
  }
}

/**
 * Fetch the latest twin_summaries row for this user.
 * Returns null if not found.
 */
async function fetchTwinSummary(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_summaries')
      .select('summary, generated_at')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log.warn('twin_summaries fetch error (non-fatal):', error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    log.warn('twin_summaries fetch threw (non-fatal):', err.message);
    return null;
  }
}

/**
 * GET /api/twin/identity
 *
 * Returns {
 *   success: true,
 *   data: {
 *     identity,          // identityContextService output (lifeStage, careerSalience, etc.)
 *     profile,           // soul_signature_profile row (nullable)
 *     expertInsights,    // { [expertKey]: string[] }
 *     summary,           // twin_summaries.summary (nullable)
 *     summaryUpdatedAt,  // twin_summaries.updated_at (nullable)
 *   }
 * }
 */
router.get('/identity', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `identity:${userId}`;

  // Check cache first (5 min TTL — identity data changes slowly)
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  // Split fast DB queries from potentially slow identity inference.
  // DB queries (~500ms total) run in parallel; identity inference uses cache-only
  // and triggers background refresh if stale — never blocks the response.
  const identityCacheKey = `identity_ctx:${userId}`;
  const [cachedIdentity, profile, expertInsights, summaryRow, calibration] = await Promise.all([
    // Only use cached identity context — never block on LLM inference
    cacheGet(identityCacheKey),
    fetchProfile(userId),
    fetchExpertReflections(userId),
    fetchTwinSummary(userId),
    fetchCalibration(userId),
  ]);

  // If no cached identity, trigger background inference (fire-and-forget)
  let identity = cachedIdentity;
  if (!identity) {
    inferIdentityContext(userId)
      .then(ctx => {
        if (ctx) {
          cacheSet(identityCacheKey, ctx, 14400).catch(() => {}); // 4h TTL
          // Also refresh the full response cache so next request is fast
          cacheSet(cacheKey, null, 0).catch(() => {}); // invalidate stale full cache
        }
      })
      .catch(err => log.warn('Background identity inference failed:', err.message));
  }

  // Merge interview archetype into profile if soul_signature_profile has none
  const mergedProfile = { ...(profile ?? {}) };
  if (!mergedProfile.archetype && calibration?.archetype_hint) {
    mergedProfile.archetype = calibration.archetype_hint;
  }
  if (!mergedProfile.personality_summary && calibration?.personality_summary) {
    mergedProfile.personality_summary = calibration.personality_summary;
  }

  const data = {
    identity: identity ?? null,
    profile: mergedProfile,
    expertInsights: expertInsights ?? {},
    summary: summaryRow?.summary ?? null,
    summaryUpdatedAt: summaryRow?.generated_at ?? null,
  };

  // Cache for 5 minutes (identity changes slowly)
  cacheSet(cacheKey, data, 300).catch(() => {});

  return res.json({ success: true, data });
});

export default router;
