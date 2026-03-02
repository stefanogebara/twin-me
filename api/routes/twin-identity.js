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
      console.warn('[TwinIdentity] profile fetch error (non-fatal):', error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.warn('[TwinIdentity] profile fetch threw (non-fatal):', err.message);
    return null;
  }
}

/**
 * Fetch up to 3 reflections per expert from user_memories.
 * Returns a map: { [expertKey]: string[] }
 */
async function fetchExpertReflections(userId) {
  const result = {};

  await Promise.all(
    EXPERT_KEYS.map(async (expertKey) => {
      try {
        const { data, error } = await supabaseAdmin
          .from('user_memories')
          .select('content')
          .eq('user_id', userId)
          .eq('memory_type', 'reflection')
          .contains('metadata', { expert: expertKey })
          .order('importance_score', { ascending: false })
          .limit(3);

        if (error) {
          console.warn(`[TwinIdentity] reflection fetch for ${expertKey} failed (non-fatal):`, error.message);
          result[expertKey] = [];
          return;
        }
        result[expertKey] = (data ?? []).map((m) => m.content);
      } catch (err) {
        console.warn(`[TwinIdentity] reflection fetch for ${expertKey} threw (non-fatal):`, err.message);
        result[expertKey] = [];
      }
    })
  );

  return result;
}

/**
 * Fetch the latest twin_summaries row for this user.
 * Returns null if not found.
 */
async function fetchTwinSummary(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_summaries')
      .select('summary, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[TwinIdentity] twin_summaries fetch error (non-fatal):', error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.warn('[TwinIdentity] twin_summaries fetch threw (non-fatal):', err.message);
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

  // Run all data fetches in parallel for maximum throughput
  const [identity, profile, expertInsights, summaryRow] = await Promise.all([
    inferIdentityContext(userId).catch((err) => {
      console.warn('[TwinIdentity] inferIdentityContext failed (non-fatal):', err.message);
      return null;
    }),
    fetchProfile(userId),
    fetchExpertReflections(userId),
    fetchTwinSummary(userId),
  ]);

  return res.json({
    success: true,
    data: {
      identity: identity ?? null,
      profile: profile ?? null,
      expertInsights: expertInsights ?? {},
      summary: summaryRow?.summary ?? null,
      summaryUpdatedAt: summaryRow?.updated_at ?? null,
    },
  });
});

export default router;
