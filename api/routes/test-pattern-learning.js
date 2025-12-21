/**
 * Test Pattern Learning Routes
 * Manual trigger endpoints to test pattern learning without waiting for cron jobs
 *
 * Endpoints:
 * - GET /api/test-pattern-learning/trigger/:userId - Trigger for specific user
 * - GET /api/test-pattern-learning/trigger-all - Trigger for all users with pending feedback
 * - GET /api/test-pattern-learning/metrics/:userId - Get learning metrics for a user
 * - GET /api/test-pattern-learning/status - Check service status and database connectivity
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import patternLearningService, { PatternLearningService } from '../services/patternLearningService.js';

const router = express.Router();

// Initialize Supabase for status checks
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/test-pattern-learning/trigger/:userId
 * Manually trigger pattern learning for a specific user
 */
router.get('/trigger/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 [TestPatternLearning] Manual trigger for user ${userId}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const startTime = Date.now();
    const result = await patternLearningService.processUserFeedback(userId);
    const duration = Date.now() - startTime;

    console.log(`✅ [TestPatternLearning] Completed in ${duration}ms`);
    console.log(`   - Processed: ${result.processed || 0} feedback items`);
    console.log(`   - Insights generated: ${result.insightsGenerated || 0}`);
    console.log(`${'='.repeat(60)}\n`);

    res.json({
      success: true,
      userId,
      duration: `${duration}ms`,
      result
    });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/trigger-all
 * Trigger pattern learning for all users with pending feedback
 */
router.get('/trigger-all', async (req, res) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 [TestPatternLearning] Manual trigger for ALL users`);
  console.log(`${'='.repeat(60)}`);

  try {
    const startTime = Date.now();
    const results = await PatternLearningService.runForAllUsers();
    const duration = Date.now() - startTime;

    const successCount = results?.filter(r => r.success)?.length || 0;
    const totalProcessed = results?.reduce((sum, r) => sum + (r.processed || 0), 0) || 0;
    const totalInsights = results?.reduce((sum, r) => sum + (r.insightsGenerated || 0), 0) || 0;

    console.log(`✅ [TestPatternLearning] Batch complete in ${duration}ms`);
    console.log(`   - Users processed: ${results?.length || 0}`);
    console.log(`   - Successful: ${successCount}`);
    console.log(`   - Total feedback items: ${totalProcessed}`);
    console.log(`   - Total insights generated: ${totalInsights}`);
    console.log(`${'='.repeat(60)}\n`);

    res.json({
      success: true,
      duration: `${duration}ms`,
      usersProcessed: results?.length || 0,
      successCount,
      totalFeedbackProcessed: totalProcessed,
      totalInsightsGenerated: totalInsights,
      results
    });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/metrics/:userId
 * Get learning metrics for a user
 */
router.get('/metrics/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`📊 [TestPatternLearning] Getting metrics for user ${userId}`);

  try {
    const metrics = await patternLearningService.getUserLearningMetrics(userId);

    console.log(`✅ [TestPatternLearning] Metrics retrieved:`);
    console.log(`   - Total feedback: ${metrics?.totalFeedbackGiven || 0}`);
    console.log(`   - Positive rate: ${metrics?.positiveRate || 0}%`);
    console.log(`   - Active insights: ${metrics?.activeInsights || 0}`);

    res.json({ success: true, userId, metrics });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Metrics error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/status
 * Check service status and database connectivity
 */
router.get('/status', async (req, res) => {
  console.log(`🔍 [TestPatternLearning] Status check requested`);

  try {
    // Count unprocessed feedback
    const { count: pendingFeedback, error: feedbackError } = await supabase
      .from('recommendation_feedback')
      .select('*', { count: 'exact', head: true })
      .is('processed_at', null);

    if (feedbackError) {
      console.error(`❌ [TestPatternLearning] Feedback query error:`, feedbackError);
    }

    // Count generated insights
    const { count: totalInsights, error: insightsError } = await supabase
      .from('generated_insights')
      .select('*', { count: 'exact', head: true });

    if (insightsError) {
      console.error(`❌ [TestPatternLearning] Insights query error:`, insightsError);
    }

    // Count active (non-expired) insights
    const { count: activeInsights, error: activeError } = await supabase
      .from('generated_insights')
      .select('*', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());

    if (activeError) {
      console.error(`❌ [TestPatternLearning] Active insights query error:`, activeError);
    }

    // Get unique users with pending feedback
    const { data: usersWithPending, error: usersError } = await supabase
      .from('recommendation_feedback')
      .select('user_id')
      .is('processed_at', null);

    const uniqueUsers = usersWithPending
      ? [...new Set(usersWithPending.map(u => u.user_id))].length
      : 0;

    const status = {
      service: 'PatternLearningService',
      status: 'ready',
      database: {
        connected: !feedbackError && !insightsError,
        error: feedbackError?.message || insightsError?.message || null
      },
      stats: {
        pendingFeedback: pendingFeedback || 0,
        usersWithPendingFeedback: uniqueUsers,
        totalInsightsGenerated: totalInsights || 0,
        activeInsights: activeInsights || 0
      },
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [TestPatternLearning] Status:`);
    console.log(`   - Database: ${status.database.connected ? 'connected' : 'error'}`);
    console.log(`   - Pending feedback: ${status.stats.pendingFeedback}`);
    console.log(`   - Users waiting: ${status.stats.usersWithPendingFeedback}`);
    console.log(`   - Total insights: ${status.stats.totalInsightsGenerated}`);

    res.json(status);
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Status error:`, error);
    res.status(500).json({
      service: 'PatternLearningService',
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/test-pattern-learning/feedback/:userId
 * Get all feedback for a user (for debugging)
 */
router.get('/feedback/:userId', async (req, res) => {
  const { userId } = req.params;
  const { processed = 'all' } = req.query;

  console.log(`📋 [TestPatternLearning] Getting feedback for user ${userId} (filter: ${processed})`);

  try {
    let query = supabase
      .from('recommendation_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (processed === 'pending') {
      query = query.is('processed_at', null);
    } else if (processed === 'processed') {
      query = query.not('processed_at', 'is', null);
    }

    const { data: feedback, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    console.log(`✅ [TestPatternLearning] Found ${feedback?.length || 0} feedback items`);

    res.json({
      success: true,
      userId,
      filter: processed,
      count: feedback?.length || 0,
      feedback
    });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Feedback query error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/insights/:userId
 * Get generated insights for a user (for debugging)
 */
router.get('/insights/:userId', async (req, res) => {
  const { userId } = req.params;
  const { active = 'true' } = req.query;

  console.log(`💡 [TestPatternLearning] Getting insights for user ${userId} (active only: ${active})`);

  try {
    let query = supabase
      .from('generated_insights')
      .select('*')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false });

    if (active === 'true') {
      query = query.gt('expires_at', new Date().toISOString());
    }

    const { data: insights, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    console.log(`✅ [TestPatternLearning] Found ${insights?.length || 0} insights`);

    res.json({
      success: true,
      userId,
      activeOnly: active === 'true',
      count: insights?.length || 0,
      insights
    });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Insights query error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
