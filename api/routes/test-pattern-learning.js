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
import { authenticateUser } from '../middleware/auth.js';
import patternLearningService, { PatternLearningService } from '../services/patternLearningService.js';
import patternLearningBridge from '../services/patternLearningBridge.js';
import learnedTriggerGenerator from '../services/learnedTriggerGenerator.js';

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
router.get('/trigger/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
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
router.get('/metrics/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
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
router.get('/feedback/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
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
router.get('/insights/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
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

// ============================================================================
// 6-LAYER PATTERN LEARNING PIPELINE TEST ENDPOINTS
// ============================================================================

/**
 * POST /api/test-pattern-learning/sync/:userId
 * Sync platform data to pattern learning raw events
 */
router.post('/sync/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
  const { platforms = ['spotify', 'calendar', 'whoop'], days = 90 } = req.body;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 [TestPatternLearning] Syncing platform data for user ${userId}`);
  console.log(`   Platforms: ${platforms.join(', ')}`);
  console.log(`   Days: ${days}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const results = {};
    for (const platform of platforms) {
      const result = await patternLearningBridge.syncExistingPlatformData(userId, platform, days);
      results[platform] = result;
      console.log(`   ${platform}: ${result.synced || 0} events synced`);
    }

    console.log(`✅ [TestPatternLearning] Sync complete`);
    res.json({ success: true, userId, results });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Sync error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/run-pipeline/:userId
 * Run the full 6-layer pattern learning pipeline
 */
router.get('/run-pipeline/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
  const { syncFirst = 'false' } = req.query;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧠 [TestPatternLearning] Running FULL PIPELINE for user ${userId}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const startTime = Date.now();

    // Optional: Sync platform data first
    let syncResults = null;
    if (syncFirst === 'true') {
      console.log(`📥 Step 0: Syncing platform data...`);
      syncResults = {};
      for (const platform of ['spotify', 'calendar', 'whoop']) {
        const result = await patternLearningBridge.syncExistingPlatformData(userId, platform, 90);
        syncResults[platform] = result;
      }
      console.log(`   Sync complete`);
    }

    // Run the full pattern learning pipeline
    console.log(`🔬 Running pattern discovery pipeline...`);
    const pipelineResult = await learnedTriggerGenerator.runPatternLearningPipeline(userId);

    // Get the discovered patterns summary
    const learnedTriggers = await learnedTriggerGenerator.generateLearnedTriggers(userId);

    const duration = Date.now() - startTime;
    console.log(`\n✅ [TestPatternLearning] Pipeline complete in ${duration}ms`);
    console.log(`${'='.repeat(60)}\n`);

    res.json({
      success: true,
      userId,
      duration: `${duration}ms`,
      syncResults,
      pipeline: pipelineResult,
      learnedTriggers: {
        count: learnedTriggers.length,
        triggers: learnedTriggers
      }
    });
  } catch (error) {
    console.error(`❌ [TestPatternLearning] Pipeline error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/raw-events/:userId
 * Get raw behavioral events for a user
 */
router.get('/raw-events/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
  const { platform, limit = 50 } = req.query;

  try {
    let query = supabase
      .from('pl_raw_behavioral_events')
      .select('*')
      .eq('user_id', userId)
      .order('event_timestamp', { ascending: false })
      .limit(parseInt(limit));

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: events, error } = await query;
    if (error) throw error;

    // Get counts by platform
    const { data: counts } = await supabase
      .from('pl_raw_behavioral_events')
      .select('platform')
      .eq('user_id', userId);

    const platformCounts = {};
    for (const e of counts || []) {
      platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
    }

    res.json({
      success: true,
      userId,
      total: counts?.length || 0,
      platformCounts,
      showing: events?.length || 0,
      events
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/baselines/:userId
 * Get computed baselines for a user
 */
router.get('/baselines/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }

  try {
    const { data: baselines, error } = await supabase
      .from('pl_user_baselines')
      .select('*')
      .eq('user_id', userId)
      .order('last_computed_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      userId,
      count: baselines?.length || 0,
      baselines
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/correlations/:userId
 * Get discovered correlations for a user
 */
router.get('/correlations/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
  const { valid = 'true' } = req.query;

  try {
    let query = supabase
      .from('pl_discovered_correlations')
      .select('*')
      .eq('user_id', userId)
      .order('correlation_coefficient', { ascending: false });

    if (valid === 'true') {
      query = query.eq('still_valid', true);
    }

    const { data: correlations, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      userId,
      count: correlations?.length || 0,
      correlations
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/hypotheses/:userId
 * Get pattern hypotheses for a user
 */
router.get('/hypotheses/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }
  const { active = 'true' } = req.query;

  try {
    let query = supabase
      .from('pl_pattern_hypotheses')
      .select('*')
      .eq('user_id', userId)
      .order('confidence_score', { ascending: false });

    if (active === 'true') {
      query = query.eq('is_active', true);
    }

    const { data: hypotheses, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      userId,
      count: hypotheses?.length || 0,
      hypotheses
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/learned-triggers/:userId
 * Get generated learned triggers for a user
 */
router.get('/learned-triggers/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }

  try {
    const triggers = await learnedTriggerGenerator.generateLearnedTriggers(userId);

    res.json({
      success: true,
      userId,
      count: triggers?.length || 0,
      triggers
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/test-pattern-learning/baseline-insights/:userId
 * Get insights generated from baseline temporal patterns
 */
router.get('/baseline-insights/:userId', authenticateUser, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
  }

  try {
    const insights = await learnedTriggerGenerator.generateBaselineInsights(userId);

    res.json({
      success: true,
      userId,
      count: insights?.length || 0,
      insights
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
