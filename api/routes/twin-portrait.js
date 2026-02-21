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

const router = express.Router();

/**
 * GET /api/twin/portrait
 * Returns the complete twin portrait data for the Soul Signature page.
 */
router.get('/portrait', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const userName = req.user.name || req.user.email || 'This person';

  try {
    // 9 parallel queries — fail-safe, each returns null/[] on error
    const [
      twinSummary,
      reflections,
      insights,
      memoryStats,
      goals,
      platformData,
      personalityScores,
      connectedPlatforms,
      firstMemory,
    ] = await Promise.all([
      // 1. Twin summary with domain breakdowns
      getTwinSummaryWithDomains(userId, userName).catch(err => {
        console.warn('[Portrait] Twin summary failed:', err.message);
        return null;
      }),

      // 2. Top reflections from expert personas
      supabaseAdmin
        .from('user_memories')
        .select('id, content, importance_score, metadata, created_at')
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .not('metadata->expert', 'is', null)
        .order('importance_score', { ascending: false })
        .limit(15)
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

      // 8. Connected platforms
      supabaseAdmin
        .from('platform_connections')
        .select('platform, status, last_sync_at')
        .eq('user_id', userId)
        .eq('status', 'connected')
        .then(({ data }) => data || [])
        .catch(() => []),

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
    ]);

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
      },
    });
  } catch (err) {
    console.error('[Portrait] Error:', err);
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
    .limit(30);

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
    if (platforms[source].recentObservations.length < 3) {
      platforms[source].recentObservations.push(mem.content);
    }
  }

  return platforms;
}

export default router;
