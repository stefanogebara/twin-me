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
import { createLogger } from './logger.js';

const log = createLogger('PatternLearningJob');

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
  log.info(`\n${'='.repeat(60)}`);
  log.info(`Scheduled job triggered at ${new Date().toISOString()}`);
  log.info(`${'='.repeat(60)}`);

  try {
    // Phase 1: Get all active users with platform connections
    const { data: activeUsers } = await supabaseAdmin
      .from('platform_connections')
      .select('user_id')
      .eq('is_active', true);

    const uniqueUserIds = [...new Set(activeUsers?.map(u => u.user_id) || [])];
    log.info(`Found ${uniqueUserIds.length} active users`);

    // Phase 2: Run the 6-layer pattern learning pipeline for each user
    const pipelineResults = [];
    for (const userId of uniqueUserIds) {
      try {
        log.info(`\n🧠 [PatternLearningJob] Processing user ${userId}...`);

        // Sync latest platform data to pattern learning
        const syncResults = {};
        for (const platform of ['spotify', 'calendar', 'whoop']) {
          const result = await patternLearningBridge.syncExistingPlatformData(userId, platform, 7); // Last 7 days
          syncResults[platform] = result.synced || 0;
        }
        log.info(`Synced: Spotify ${syncResults.spotify}, Calendar ${syncResults.calendar}, Whoop ${syncResults.whoop}`);

        // Run full pipeline (baselines, correlations, hypotheses)
        const pipelineResult = await learnedTriggerGenerator.runPatternLearningPipeline(userId);
        log.info(`Baselines: ${pipelineResult.baselines?.computed || 0}, Correlations: ${pipelineResult.correlations?.discovered || 0}`);

        // Generate learned triggers
        const triggers = await learnedTriggerGenerator.generateLearnedTriggers(userId);
        log.info(`Learned triggers: ${triggers.length}`);

        pipelineResults.push({
          userId,
          success: true,
          synced: syncResults,
          baselines: pipelineResult.baselines?.computed || 0,
          correlations: pipelineResult.correlations?.discovered || 0,
          triggers: triggers.length
        });
      } catch (err) {
        log.error(`Error for user ${userId}:`, err.message);
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

    log.info(`\n${'='.repeat(60)}`);
    log.info(`Job summary:`);
    log.info(`- Users processed: ${uniqueUserIds.length}`);
    log.info(`- Pattern Pipeline:`);
    log.info(`• Baselines computed: ${totalBaselines}`);
    log.info(`• Correlations discovered: ${totalCorrelations}`);
    log.info(`• Learned triggers generated: ${totalTriggers}`);
    log.info(`- Feedback Processing:`);
    log.info(`• Feedback items: ${totalProcessed}`);
    log.info(`• Insights generated: ${totalInsights}`);
    log.info(`- Next run: In 6 hours`);
    log.info(`${'='.repeat(60)}\n`);

  } catch (error) {
    log.error(`Job failed:`, error.message);
    log.error(`Stack trace:`, error.stack);
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
  log.info(`\n📋 [PatternLearningJob] Initializing pattern learning job...`);

  // Stop existing job if running
  if (patternLearningJob) {
    log.warn(`Job already running, stopping old instance`);
    patternLearningJob.stop();
  }

  // Schedule job: Every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00)
  patternLearningJob = cron.schedule('0 */6 * * *', patternLearningJobHandler, {
    scheduled: true,
    timezone: 'UTC'
  });

  log.info(`Job scheduled successfully`);
  log.info(`- Schedule: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)`);
  log.info(`- Purpose: Process feedback & generate insights`);
  log.info(`- Service: PatternLearningService`);

  // Optionally run immediately
  if (runImmediately) {
    log.info(`Running initial job immediately...`);
    patternLearningJobHandler().catch(error => {
      log.error(`Initial run failed:`, error.message);
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
  log.info(`Stopping pattern learning job...`);

  if (patternLearningJob) {
    patternLearningJob.stop();
    patternLearningJob = null;
    log.info(`Job stopped successfully`);
    return true;
  }

  log.info(`No job was running`);
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
