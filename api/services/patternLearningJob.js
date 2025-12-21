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
    const results = await PatternLearningService.runForAllUsers();

    // Summary statistics
    const successCount = results?.filter(r => r.success)?.length || 0;
    const totalProcessed = results?.reduce((sum, r) => sum + (r.processed || 0), 0) || 0;
    const totalInsights = results?.reduce((sum, r) => sum + (r.insightsGenerated || 0), 0) || 0;

    console.log(`\n📊 [PatternLearningJob] Job summary:`);
    console.log(`   - Users processed: ${results?.length || 0}`);
    console.log(`   - Successful: ${successCount}`);
    console.log(`   - Feedback items: ${totalProcessed}`);
    console.log(`   - Insights generated: ${totalInsights}`);
    console.log(`   - Next run: In 6 hours`);

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
