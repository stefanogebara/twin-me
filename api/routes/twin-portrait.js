/**
 * Twin Portrait API
 * =================
 * Single endpoint that aggregates all data the Soul Signature page needs.
 * Follows the same parallel-fetch pattern as twinContextBuilder.js.
 *
 * GET /portrait - Returns the full twin portrait for the authenticated user
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getTwinSummaryWithDomains } from '../services/twinSummaryService.js';
import { getMemoryStats } from '../services/memoryStreamService.js';
import { getUserGoals } from '../services/goalTrackingService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinPortrait');

const router = express.Router();

/**
 * GET /api/twin/portrait
 * Returns the complete twin portrait data for the Soul Signature page.
 */
router.get('/portrait', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  // Fetch actual display name from users table (JWT only carries id + email)
  const userName = await _getUserDisplayName(userId, req.user.email);

  try {
    // 10 parallel queries — fail-safe, each returns null/[] on error
    const [
      twinSummary,
      rawReflections,
      insights,
      memoryStats,
      goals,
      platformData,
      personalityScores,
      connectedPlatforms,
      firstMemory,
      soulSignature,    // NEW
    ] = await Promise.all([
      // 1. Twin summary with domain breakdowns
      getTwinSummaryWithDomains(userId, userName).catch(err => {
        log.warn('Twin summary failed:', err.message);
        return null;
      }),

      // 2. Top reflections from expert personas — fetch enough to guarantee
      //    coverage across all 5 experts, then distribute evenly (top 3 per expert)
      supabaseAdmin
        .from('user_memories')
        .select('id, content, importance_score, metadata, created_at')
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .not('metadata->expert', 'is', null)
        .order('importance_score', { ascending: false })
        .limit(50)
        .then(({ data }) => data || [])
        .catch(() => []),

      // 3. Recent proactive insights (last 7 days)
      supabaseAdmin
        .from('proactive_insights')
        .select('id, insight, urgency, category, created_at, delivered')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
        .then(({ data }) => data || [])
        .catch(() => []),

      // 4. Memory stats
      getMemoryStats(userId).catch(() => ({ total: 0, byType: {} })),

      // 5. User goals (active + completed recently)
      getUserGoals(userId, ['active', 'suggested', 'completed']).catch(() => []),

      // 6. Live platform data summary (latest from user_memories)
      _getLatestPlatformSummary(userId).catch(() => null),

      // 7. Personality scores
      supabaseAdmin
        .from('personality_scores')
        .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, archetype_code, analyzed_platforms, source_type')
        .eq('user_id', userId)
        .single()
        .then(({ data }) => data || null)
        .catch(() => null),

      // 8. Connected platforms — check both platform_connections AND nango_connection_mappings
      //    Match connectors/status logic: connected_at NOT NULL = connected
      Promise.all([
        supabaseAdmin
          .from('platform_connections')
          .select('platform, status, last_sync_at, connected_at')
          .eq('user_id', userId)
          .not('connected_at', 'is', null)
          .then(({ data }) => data || [])
          .catch(() => []),
        supabaseAdmin
          .from('nango_connection_mappings')
          .select('platform, status, connected_at, last_synced_at')
          .eq('user_id', userId)
          .not('connected_at', 'is', null)
          .then(({ data }) => data || [])
          .catch(() => []),
      ]).then(([pcRows, nangoRows]) => {
        // Merge: use platform_connections as primary, supplement with nango entries
        const seen = new Set(pcRows.map(r => r.platform));
        const nangoExtras = nangoRows
          .filter(r => !seen.has(r.platform))
          .map(r => ({
            platform: r.platform,
            status: 'connected',
            last_sync_at: r.last_synced_at || r.connected_at,
          }));
        return [...pcRows, ...nangoExtras];
      }),

      // 9. First memory date (twin age)
      supabaseAdmin
        .from('user_memories')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
        .then(({ data }) => data?.created_at || null)
        .catch(() => null),

      // 10. Soul signature archetype (from instant-signature onboarding step)
      supabaseAdmin
        .from('soul_signatures')
        .select('archetype_name, archetype_subtitle, narrative, defining_traits, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => data || null)
        .catch(() => null),
    ]);

    // Distribute reflections evenly across experts (top 3 per expert)
    const reflections = _distributeReflectionsByExpert(rawReflections, 3);

    res.json({
      success: true,
      portrait: {
        twinSummary,
        reflections,
        insights,
        memoryStats,
        goals,
        platformData,
        personalityScores,
        connectedPlatforms,
        firstMemoryAt: firstMemory,
        soulSignature,    // NEW
      },
    });
  } catch (err) {
    log.error('Error:', err);
    res.status(500).json({ success: false, error: 'Failed to load portrait' });
  }
});

/**
 * Get a summary of latest platform data from recent observations.
 * Pulls structured data from the most recent platform_data memories.
 */
async function _getLatestPlatformSummary(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata, created_at')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'observation'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data || data.length === 0) return null;

  const platforms = {};
  for (const mem of data) {
    const source = mem.metadata?.source || mem.metadata?.platform || 'unknown';
    if (!platforms[source]) {
      platforms[source] = {
        latestAt: mem.created_at,
        recentObservations: [],
      };
    }
    // Deduplicate: skip if this exact content string is already present
    const observations = platforms[source].recentObservations;
    if (observations.length < 3 && !observations.includes(mem.content)) {
      observations.push(mem.content);
    }
  }

  return platforms;
}

/**
 * Fetch the user's display name from the users table.
 * Falls back to email prefix, then 'This person'.
 */
async function _getUserDisplayName(userId, fallbackEmail) {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    if (data?.first_name) {
      const parts = [data.first_name, data.last_name].filter(Boolean);
      return parts.join(' ');
    }
  } catch {
    // Fall through to fallback
  }

  // Use the part before @ as a reasonable fallback
  if (fallbackEmail) {
    return fallbackEmail.split('@')[0];
  }

  return 'This person';
}

/**
 * Distribute reflections evenly across experts.
 * Takes the top N reflections per expert, then merges and sorts by importance.
 * This ensures every expert (including lifestyle_analyst) is represented
 * even if their reflections have lower importance scores.
 *
 * @param {Array} rawReflections - All fetched reflections (sorted by importance desc)
 * @param {number} perExpert - Maximum reflections to keep per expert
 * @returns {Array} Balanced reflections sorted by importance desc
 */
function _distributeReflectionsByExpert(rawReflections, perExpert = 3) {
  const byExpert = {};

  for (const reflection of rawReflections) {
    const expert = reflection.metadata?.expert || 'unknown';
    if (!byExpert[expert]) {
      byExpert[expert] = [];
    }
    if (byExpert[expert].length < perExpert) {
      byExpert[expert].push(reflection);
    }
  }

  // Merge all selected reflections and sort by importance desc
  const distributed = Object.values(byExpert).flat();
  distributed.sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0));

  return distributed;
}

export default router;
