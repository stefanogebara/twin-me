/**
 * Activity Scoring API Routes
 *
 * Endpoints for calculating and retrieving platform activity scores.
 * Prevents false insights from inactive platforms.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { calculateAllPlatformScores } from '../services/activityScorer.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/activity/calculate
 * Calculate activity scores for all user platforms
 */
router.post('/calculate', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  console.log(`📊 [Activity API] Calculating scores for user ${userId}`);

  try {
    // Calculate scores for all platforms
    const scores = await calculateAllPlatformScores(userId, supabaseAdmin);

    // Update platform_connections with new scores
    for (const scoreData of scores) {
      const { error: updateError } = await supabaseAdmin
        .from('platform_connections')
        .update({
          activity_score: scoreData.score,
          activity_level: scoreData.level,
          activity_label: scoreData.label,
          activity_metrics: scoreData.metrics,
          content_volume: Math.round(Object.values(scoreData.metrics).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)),
          activity_calculated_at: new Date().toISOString()
        })
        .eq('id', scoreData.connection_id);

      if (updateError) {
        console.error(`❌ Error updating ${scoreData.platform}:`, JSON.stringify(updateError, null, 2));
      }

      // Save to history for trend tracking
      await supabaseAdmin
        .from('platform_activity_history')
        .insert({
          user_id: userId,
          platform: scoreData.platform,
          activity_score: scoreData.score,
          activity_level: scoreData.level,
          activity_label: scoreData.label,
          metrics_snapshot: scoreData.metrics,
          content_volume: Object.values(scoreData.metrics).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
        });
    }

    console.log(`✅ [Activity API] Updated ${scores.length} platform scores`);

    res.json({
      success: true,
      scores,
      summary: {
        total_platforms: scores.length,
        active_platforms: scores.filter(s => ['active', 'power_user'].includes(s.level)).length,
        inactive_platforms: scores.filter(s => ['none', 'minimal'].includes(s.level)).length,
        by_level: {
          power_user: scores.filter(s => s.level === 'power_user').map(s => s.platform),
          active: scores.filter(s => s.level === 'active').map(s => s.platform),
          moderate: scores.filter(s => s.level === 'moderate').map(s => s.platform),
          minimal: scores.filter(s => s.level === 'minimal').map(s => s.platform),
          none: scores.filter(s => s.level === 'none').map(s => s.platform)
        }
      }
    });

  } catch (error) {
    console.error('❌ [Activity API] Error:', error);
    res.status(500).json({
      error: 'Failed to calculate activity scores',
      message: error.message
    });
  }
});

/**
 * GET /api/activity/scores
 * Get current activity scores for user platforms
 */
router.get('/scores', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('platform_connections')
      .select('platform, activity_score, activity_level, activity_label, activity_metrics, content_volume, activity_calculated_at, last_sync')
      .eq('user_id', userId)
      .order('activity_score', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      platforms: data,
      summary: {
        total: data.length,
        active: data.filter(p => ['active', 'power_user'].includes(p.activity_level)).length,
        inactive: data.filter(p => ['none', 'minimal'].includes(p.activity_level)).length,
        needs_calculation: data.filter(p => !p.activity_calculated_at).length
      }
    });

  } catch (error) {
    console.error('❌ [Activity API] Error fetching scores:', error);
    res.status(500).json({
      error: 'Failed to fetch activity scores',
      message: error.message
    });
  }
});

/**
 * GET /api/activity/history/:platform
 * Get activity score history for a specific platform
 */
router.get('/history/:platform', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { platform } = req.params;
  const { days = 90 } = req.query;

  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data, error } = await supabaseAdmin
      .from('platform_activity_history')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .gte('measured_at', cutoffDate.toISOString())
      .order('measured_at', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      platform,
      history: data,
      trend: calculateTrend(data)
    });

  } catch (error) {
    console.error('❌ [Activity API] Error fetching history:', error);
    res.status(500).json({
      error: 'Failed to fetch activity history',
      message: error.message
    });
  }
});

/**
 * POST /api/activity/recalculate-all
 * Admin endpoint to recalculate all users' activity scores
 */
router.post('/recalculate-all', authenticateUser, async (req, res) => {
  // TODO: Add admin check middleware

  try {
    // Get all users with platform connections
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id');

    if (usersError) throw usersError;

    const results = [];

    for (const user of users) {
      try {
        const scores = await calculateAllPlatformScores(user.id, supabaseAdmin);

        // Update database
        for (const scoreData of scores) {
          await supabaseAdmin
            .from('platform_connections')
            .update({
              activity_score: scoreData.score,
              activity_level: scoreData.level,
              activity_label: scoreData.label,
              activity_metrics: scoreData.metrics,
              activity_calculated_at: new Date().toISOString()
            })
            .eq('id', scoreData.connection_id);
        }

        results.push({
          user_id: user.id,
          success: true,
          platforms_updated: scores.length
        });

      } catch (userError) {
        results.push({
          user_id: user.id,
          success: false,
          error: userError.message
        });
      }
    }

    res.json({
      success: true,
      total_users: users.length,
      results
    });

  } catch (error) {
    console.error('❌ [Activity API] Recalculation error:', error);
    res.status(500).json({
      error: 'Failed to recalculate all scores',
      message: error.message
    });
  }
});

/**
 * Helper: Calculate trend from history data
 */
function calculateTrend(history) {
  if (history.length < 2) {
    return { trend: 'insufficient_data', direction: null };
  }

  const recent = history.slice(-5); // Last 5 measurements
  const older = history.slice(0, 5); // First 5 measurements

  const recentAvg = recent.reduce((sum, h) => sum + h.activity_score, 0) / recent.length;
  const olderAvg = older.reduce((sum, h) => sum + h.activity_score, 0) / older.length;

  const change = recentAvg - olderAvg;

  if (Math.abs(change) < 5) {
    return { trend: 'stable', direction: 'neutral', change: change.toFixed(1) };
  } else if (change > 0) {
    return { trend: 'increasing', direction: 'up', change: change.toFixed(1) };
  } else {
    return { trend: 'decreasing', direction: 'down', change: change.toFixed(1) };
  }
}

export default router;
