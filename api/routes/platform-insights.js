/**
 * Platform Insights API Routes
 *
 * Provides conversational twin reflections for each connected platform.
 * These are NOT stats dashboards - they're introspective observations
 * from your digital twin about what it has noticed.
 *
 * Endpoints:
 * GET  /api/insights/:platform              - Get reflection + patterns + history
 * POST /api/insights/:platform/refresh      - Force regenerate reflection
 * POST /api/insights/proactive/:id/engage   - Mark a proactive insight as engaged
 * GET  /api/insights/proactive/engagement-stats - Engagement stats (last 30 days)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import platformReflectionService from '../services/platformReflectionService.js';
import { supabaseAdmin } from '../services/database.js';
import { seedPatternFromInsight } from '../services/twinPatternService.js';
import { get as redisGet, set as redisSet } from '../services/redisClient.js';

const router = express.Router();

// Redis cache key for insights summary
const SUMMARY_CACHE_KEY = (userId) => `insights_summary:${userId}`;
const SUMMARY_CACHE_TTL = 14400; // 4 hours in seconds

// Wrap a promise with a hard timeout — returns a timeout error if it exceeds the deadline
const INSIGHTS_TIMEOUT_MS = 20_000;
function withTimeout(promise, ms = INSIGHTS_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Insights request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Valid platforms
const VALID_PLATFORMS = ['spotify', 'calendar', 'youtube', 'web', 'discord', 'linkedin'];

// Map URL platform names to database platform names
// Calendar is stored as 'google_calendar' in platform_connections
const PLATFORM_DB_NAMES = {
  'calendar': 'google_calendar',
  'gmail': 'google_gmail',
};

/**
 * GET /api/insights/all
 * Get reflections for all connected platforms at once
 * Useful for dashboard preview
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/all/summary', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  console.log(`[Insights API] GET /all/summary for user ${userId}`);

  try {
    // 1. Check Redis cache first — instant response
    const cached = await redisGet(SUMMARY_CACHE_KEY(userId));
    if (cached) {
      console.log(`[Insights API] Cache HIT for summary, user ${userId}`);
      return res.json({
        success: true,
        summary: cached,
        cached: true
      });
    }

    // 2. Cache miss — return "generating" immediately, don't block
    console.log(`[Insights API] Cache MISS for summary, user ${userId} — generating in background`);
    res.json({
      success: true,
      summary: {
        spotify: { connected: false },
        calendar: { connected: false },
        youtube: { connected: false },
        web: { connected: false }
      },
      generating: true
    });

    // 3. Fire background generation (non-blocking — response already sent)
    generateAndCacheSummary(userId).catch(err =>
      console.error(`[Insights API] Background summary generation failed for ${userId}:`, err.message)
    );
  } catch (error) {
    console.error(`[Insights API] Summary error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights summary',
      message: error.message
    });
  }
});

/**
 * Generate insights summary for all platforms and cache in Redis.
 * Called from the route handler (background) and from cron jobs (pre-warm).
 */
export async function generateAndCacheSummary(userId) {
  const platforms = ['spotify', 'calendar', 'youtube', 'web'];

  const results = await Promise.allSettled(
    platforms.map(p => withTimeout(platformReflectionService.getReflections(userId, p)))
  );

  const makeSummary = (result) =>
    result.status === 'fulfilled' && result.value.success
      ? { connected: true, preview: result.value.reflection?.text?.substring(0, 100) + '...' }
      : { connected: false };

  const summary = Object.fromEntries(
    platforms.map((p, i) => [p, makeSummary(results[i])])
  );

  // Cache result — longer TTL when we have data, shorter for empty to prevent miss storms
  const hasData = Object.values(summary).some(s => s.connected);
  const ttl = hasData ? SUMMARY_CACHE_TTL : 300; // 4h for real data, 5min for empty
  await redisSet(SUMMARY_CACHE_KEY(userId), summary, ttl);
  console.log(`[Insights API] Cached summary for user ${userId} (TTL: ${ttl}s, hasData: ${hasData})`);

  return summary;
}

/**
 * GET /api/insights/proactive/engagement-stats
 * Returns engagement breakdown by category and urgency for the last 30 days.
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/proactive/engagement-stats', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('category, urgency, engaged, delivered')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    console.error('[Insights] engagement-stats error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }

  const stats = { total: data?.length || 0, engaged: 0, byCategory: {}, byUrgency: {} };
  for (const row of (data || [])) {
    if (row.engaged) stats.engaged++;

    if (!stats.byCategory[row.category]) {
      stats.byCategory[row.category] = { total: 0, engaged: 0 };
    }
    stats.byCategory[row.category].total++;
    if (row.engaged) stats.byCategory[row.category].engaged++;

    if (!stats.byUrgency[row.urgency]) {
      stats.byUrgency[row.urgency] = { total: 0, engaged: 0 };
    }
    stats.byUrgency[row.urgency].total++;
    if (row.engaged) stats.byUrgency[row.urgency].engaged++;
  }

  res.json({ success: true, data: stats });
});

/**
 * GET /api/insights/proactive
 * Returns proactive insights for the authenticated user.
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/proactive', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const includeDelivered = req.query.include_delivered === 'true';

    const query = supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, created_at, delivered, engaged')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeDelivered) {
      query.eq('delivered', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Insights] GET /proactive error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Sort by urgency (high > medium > low), then by recency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const sorted = (data || []).sort((a, b) => {
      const urgDiff = (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
      if (urgDiff !== 0) return urgDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json({ success: true, insights: sorted });
  } catch (error) {
    console.error('[Insights] GET /proactive error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch proactive insights' });
  }
});

/**
 * GET /api/insights/:platform
 * Get conversational reflections for a specific platform
 */
router.get('/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  console.log(`🪞 [Insights API] GET /${platform} for user ${userId}`);

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `Invalid platform: ${platform}. Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    });
  }

  try {
    // Pre-check: verify platform is actually connected before calling reflection service
    // Map URL platform name to DB name (e.g. 'calendar' -> 'google_calendar')
    const dbPlatformName = PLATFORM_DB_NAMES[platform] || platform;

    const { data: connection, error: connErr } = await supabaseAdmin
      .from('platform_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', dbPlatformName)
      .single();
    if (connErr && connErr.code !== 'PGRST116') console.error('[PlatformInsights] Connection fetch error:', connErr.message);

    if (!connection) {
      return res.json({
        success: true,
        platform,
        reflection: `You haven't connected ${platform} yet. Connect it to get personalized insights!`,
        notConnected: true
      });
    }

    const result = await withTimeout(platformReflectionService.getReflections(userId, platform));

    if (!result.success) {
      // Return a graceful response instead of 400 for downstream failures
      return res.json({
        success: true,
        platform,
        reflection: result.error || `Unable to generate ${platform} insights right now. Try again later.`,
        fallback: true
      });
    }

    res.json(result);
  } catch (error) {
    console.error(`[Insights API] Error:`, error);
    const isTimeout = error.message?.includes('timed out');
    res.json({
      success: true,
      platform,
      reflection: isTimeout
        ? `Your ${platform} insights are taking longer than expected. Try refreshing in a moment.`
        : `Unable to generate ${platform} insights right now. Try again later.`,
      fallback: true
    });
  }
});

/**
 * POST /api/insights/:platform/refresh
 * Force regenerate a reflection (ignore cache)
 */
router.post('/:platform/refresh', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  console.log(`🪞 [Insights API] POST /${platform}/refresh for user ${userId}`);

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `Invalid platform: ${platform}. Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    });
  }

  try {
    const result = await withTimeout(platformReflectionService.refreshReflection(userId, platform));

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error(`❌ [Insights API] Refresh error:`, error);
    const isTimeout = error.message?.includes('timed out');
    res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout ? 'Reflection generation timed out' : 'Failed to refresh reflection',
      message: error.message
    });
  }
});

/**
 * POST /api/insights/proactive/:id/engage
 * Mark a proactive insight as engaged (user tapped/expanded it).
 * Only the owning user can mark their own insight.
 */
router.post('/proactive/:id/engage', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('proactive_insights')
    .update({ engaged: true, engaged_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // security: user can only engage their own insights

  if (error) {
    console.error('[Insights] engage error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true });

  // Non-blocking: seed an EWC++ topic_affinity pattern from the engaged insight
  // so the twin learns which topics the user finds interesting over time
  supabaseAdmin
    .from('proactive_insights')
    .select('content, category')
    .eq('id', id)
    .single()
    .then(({ data }) => {
      if (!data?.content) return;
      const patternName = data.category || 'engaged_insight';
      seedPatternFromInsight(userId, patternName, data.content)
        .catch(err => console.warn('[Insights] Pattern seed failed:', err.message));
    })
    .catch(() => {});
});

export default router;
