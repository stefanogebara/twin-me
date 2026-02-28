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
import { createClient } from '@supabase/supabase-js';
import { authenticateUser } from '../middleware/auth.js';
import platformReflectionService from '../services/platformReflectionService.js';

const router = express.Router();

// Supabase client for connection checks
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Valid platforms
const VALID_PLATFORMS = ['spotify', 'calendar', 'youtube', 'web', 'discord', 'linkedin'];

// Map URL platform names to database platform names
// Calendar is stored as 'google_calendar' in platform_connections
const PLATFORM_DB_NAMES = {
  'calendar': 'google_calendar',
  'gmail': 'google_gmail',
};

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

    if (supabase) {
      const { data: connection, error: connErr } = await supabase
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
    }

    const result = await platformReflectionService.getReflections(userId, platform);

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
    res.status(500).json({
      success: false,
      error: 'Failed to get platform insights',
      message: error.message
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
    const result = await platformReflectionService.refreshReflection(userId, platform);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error(`❌ [Insights API] Refresh error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh reflection',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/all
 * Get reflections for all connected platforms at once
 * Useful for dashboard preview
 */
router.get('/all/summary', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  console.log(`🪞 [Insights API] GET /all/summary for user ${userId}`);

  try {
    const results = await Promise.allSettled([
      platformReflectionService.getReflections(userId, 'spotify'),
      platformReflectionService.getReflections(userId, 'calendar'),
      platformReflectionService.getReflections(userId, 'youtube'),
      platformReflectionService.getReflections(userId, 'web')
    ]);

    const makeSummary = (result) =>
      result.status === 'fulfilled' && result.value.success
        ? { connected: true, preview: result.value.reflection?.text?.substring(0, 100) + '...' }
        : { connected: false };

    const summary = {
      spotify: makeSummary(results[0]),
      calendar: makeSummary(results[1]),
      youtube: makeSummary(results[2]),
      web: makeSummary(results[3])
    };

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error(`❌ [Insights API] Summary error:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights summary',
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

  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  const { error } = await supabase
    .from('proactive_insights')
    .update({ engaged: true, engaged_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // security: user can only engage their own insights

  if (error) {
    console.error('[Insights] engage error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true });
});

/**
 * GET /api/insights/proactive/engagement-stats
 * Returns engagement breakdown by category and urgency for the last 30 days.
 */
router.get('/proactive/engagement-stats', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
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

export default router;
