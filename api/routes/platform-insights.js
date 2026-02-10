/**
 * Platform Insights API Routes
 *
 * Provides conversational twin reflections for each connected platform.
 * These are NOT stats dashboards - they're introspective observations
 * from your digital twin about what it has noticed.
 *
 * Endpoints:
 * GET  /api/insights/:platform        - Get reflection + patterns + history
 * POST /api/insights/:platform/refresh - Force regenerate reflection
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
const VALID_PLATFORMS = ['spotify', 'whoop', 'calendar', 'youtube', 'twitch', 'web'];

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
    if (supabase) {
      const { data: connection } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

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
      platformReflectionService.getReflections(userId, 'whoop'),
      platformReflectionService.getReflections(userId, 'calendar'),
      platformReflectionService.getReflections(userId, 'youtube'),
      platformReflectionService.getReflections(userId, 'twitch'),
      platformReflectionService.getReflections(userId, 'web')
    ]);

    const makeSummary = (result) =>
      result.status === 'fulfilled' && result.value.success
        ? { connected: true, preview: result.value.reflection?.text?.substring(0, 100) + '...' }
        : { connected: false };

    const summary = {
      spotify: makeSummary(results[0]),
      whoop: makeSummary(results[1]),
      calendar: makeSummary(results[2]),
      youtube: makeSummary(results[3]),
      twitch: makeSummary(results[4]),
      web: makeSummary(results[5])
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

export default router;
