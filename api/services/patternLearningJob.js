/**
 * Pattern Learning Background Job Scheduler
 *
 * Manages automated background job for pattern learning:
 * - Pattern Learning Job - Processes feedback and generates insights every 6 hours
 *
 * The job analyzes user feedback on recommendations and uses Claude AI to:
 * 1. Identify patterns in user preferences
 * 2. Update confidence scores for recommendation types
 * 3. Generate personalized insights based on feedback
 *
 * @module patternLearningJob
 */

import cron from 'node-cron';
import { PatternLearningService } from './patternLearningService.js';
import patternLearningBridge from './patternLearningBridge.js';
import learnedTriggerGenerator from './learnedTriggerGenerator.js';
import { supabaseAdmin } from './database.js';

// =========================================================================
// Job Storage
// =========================================================================

let patternLearningJob = null;

// =========================================================================
// Pattern Learning Job Handler
// =========================================================================

/**
 * Pattern Learning Job Handler
 *
 * Runs every 6 hours to process user feedback and generate insights.
 * This job:
 * 1. Finds all users with unprocessed feedback
 * 2. Analyzes feedback patterns using Claude AI
 * 3. Updates confidence scores for patterns
 * 4. Generates personalized insights
 * 5. Marks feedback as processed
 *
 * Schedule: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
 */
const patternLearningJobHandler = async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`⏰ [PatternLearningJob] Scheduled job triggered at ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Phase 1: Get all active users with platform connections
    const { data: activeUsers } = await supabaseAdmin
      .from('platform_connections')
      .select('user_id')
      .eq('is_active', true);

    const uniqueUserIds = [...new Set(activeUsers?.map(u => u.user_id) || [])];
    console.log(`📊 [PatternLearningJob] Found ${uniqueUserIds.length} active users`);

    // Phase 2: Run the 6-layer pattern learning pipeline for each user
    const pipelineResults = [];
    for (const userId of uniqueUserIds) {
      try {
        console.log(`\n🧠 [PatternLearningJob] Processing user ${userId}...`);

        // Sync latest platform data to pattern learning
        const syncResults = {};
        for (const platform of ['spotify', 'calendar', 'whoop']) {
          const result = await patternLearningBridge.syncExistingPlatformData(userId, platform, 7); // Last 7 days
          syncResults[platform] = result.synced || 0;
        }
        console.log(`   📥 Synced: Spotify ${syncResults.spotify}, Calendar ${syncResults.calendar}, Whoop ${syncResults.whoop}`);

        // Run full pipeline (baselines, correlations, hypotheses)
        const pipelineResult = await learnedTriggerGenerator.runPatternLearningPipeline(userId);
        console.log(`   📈 Baselines: ${pipelineResult.baselines?.computed || 0}, Correlations: ${pipelineResult.correlations?.discovered || 0}`);

        // Generate learned triggers
        const triggers = await learnedTriggerGenerator.generateLearnedTriggers(userId);
        console.log(`   🎯 Learned triggers: ${triggers.length}`);

        pipelineResults.push({
          userId,
          success: true,
          synced: syncResults,
          baselines: pipelineResult.baselines?.computed || 0,
          correlations: pipelineResult.correlations?.discovered || 0,
          triggers: triggers.length
        });
      } catch (err) {
        console.error(`   ❌ Error for user ${userId}:`, err.message);
        pipelineResults.push({ userId, success: false, error: err.message });
      }
    }

    // Phase 3: Run the original feedback processing
    const feedbackResults = await PatternLearningService.runForAllUsers();
    const successCount = feedbackResults?.filter(r => r.success)?.length || 0;
    const totalProcessed = feedbackResults?.reduce((sum, r) => sum + (r.processed || 0), 0) || 0;
    const totalInsights = feedbackResults?.reduce((sum, r) => sum + (r.insightsGenerated || 0), 0) || 0;

    // Summary
    const totalBaselines = pipelineResults.reduce((sum, r) => sum + (r.baselines || 0), 0);
    const totalCorrelations = pipelineResults.reduce((sum, r) => sum + (r.correlations || 0), 0);
    const totalTriggers = pipelineResults.reduce((sum, r) => sum + (r.triggers || 0), 0);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 [PatternLearningJob] Job summary:`);
    console.log(`   - Users processed: ${uniqueUserIds.length}`);
    console.log(`   - Pattern Pipeline:`);
    console.log(`     • Baselines computed: ${totalBaselines}`);
    console.log(`     • Correlations discovered: ${totalCorrelations}`);
    console.log(`     • Learned triggers generated: ${totalTriggers}`);
    console.log(`   - Feedback Processing:`);
    console.log(`     • Feedback items: ${totalProcessed}`);
    console.log(`     • Insights generated: ${totalInsights}`);
    console.log(`   - Next run: In 6 hours`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`❌ [PatternLearningJob] Job failed:`, error.message);
    console.error(`Stack trace:`, error.stack);
  }
};

// =========================================================================
// Job Scheduling Functions
// =========================================================================

/**
 * Start the pattern learning background job
 *
 * Initializes and starts the pattern learning job.
 * This should be called once on server startup in development mode.
 * In production, Vercel Cron Jobs call the /api/cron/pattern-learning endpoint instead.
 *
 * @param {boolean} runImmediately - Whether to run the job immediately on startup
 * @returns {Object} The job instance
 */
export function startPatternLearningJob(runImmediately = false) {
  console.log(`\n📋 [PatternLearningJob] Initializing pattern learning job...`);

  // Stop existing job if running
  if (patternLearningJob) {
    console.warn(`⚠️ [PatternLearningJob] Job already running, stopping old instance`);
    patternLearningJob.stop();
  }

  // Schedule job: Every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00)
  patternLearningJob = cron.schedule('0 */6 * * *', patternLearningJobHandler, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log(`✅ [PatternLearningJob] Job scheduled successfully`);
  console.log(`   - Schedule: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)`);
  console.log(`   - Purpose: Process feedback & generate insights`);
  console.log(`   - Service: PatternLearningService`);

  // Optionally run immediately
  if (runImmediately) {
    console.log(`🔄 [PatternLearningJob] Running initial job immediately...`);
    patternLearningJobHandler().catch(error => {
      console.error(`❌ [PatternLearningJob] Initial run failed:`, error.message);
    });
  }

  return patternLearningJob;
}

/**
 * Stop the pattern learning background job
 *
 * Stops the pattern learning job.
 * This should be called on graceful server shutdown.
 */
export function stopPatternLearningJob() {
  console.log(`🛑 [PatternLearningJob] Stopping pattern learning job...`);

  if (patternLearningJob) {
    patternLearningJob.stop();
    patternLearningJob = null;
    console.log(`✅ [PatternLearningJob] Job stopped successfully`);
    return true;
  }

  console.log(`ℹ️ [PatternLearningJob] No job was running`);
  return false;
}

/**
 * Get the current job status
 *
 * @returns {Object} Status object with running state and next run time
 */
export function getPatternLearningJobStatus() {
  const now = new Date();
  const currentHour = now.getUTCHours();

  // Calculate next run time (next 6-hour mark)
  const nextRunHour = Math.ceil((currentHour + 1) / 6) * 6;
  const nextRun = new Date(now);
  nextRun.setUTCHours(nextRunHour % 24, 0, 0, 0);

  // If next run is in the past (e.g., we're at 18:00 and calculated 18:00), add 6 hours
  if (nextRun <= now) {
    nextRun.setUTCHours(nextRun.getUTCHours() + 6);
  }

  return {
    running: !!patternLearningJob,
    schedule: 'Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)',
    nextRun: nextRun.toISOString(),
    timeUntilNextRun: Math.round((nextRun - now) / 1000 / 60) + ' minutes'
  };
}

// Default export
export default {
  start: startPatternLearningJob,
  stop: stopPatternLearningJob,
  status: getPatternLearningJobStatus,
  runNow: patternLearningJobHandler
};
