/**
 * Vercel Cron Job Endpoint: Pattern Learning
 *
 * This endpoint is called by Vercel Cron (every 6 hours)
 * to automatically process user feedback and generate personalized insights.
 *
 * The pattern learning process:
 * 1. Finds all users with unprocessed feedback
 * 2. Analyzes feedback patterns using Claude AI
 * 3. Updates confidence scores for recommendation types
 * 4. Generates personalized insights based on patterns
 * 5. Marks feedback as processed
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { PatternLearningService } from '../services/patternLearningService.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronPatternLearning');

/**
 * Vercel Cron Job Handler
 * Called every 6 hours by Vercel Cron (00:00, 06:00, 12:00, 18:00 UTC)
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  log.info('Pattern learning endpoint called');

  // Security: Verify cron secret (timing-safe)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    log.error('Unauthorized cron request - invalid secret');
    return res.status(authResult.status).json({
      success: false,
      error: authResult.error,
    });
  }

  try {
    // Execute pattern learning for all users
    log.info('Starting pattern learning batch processing');
    const results = await PatternLearningService.runForAllUsers();

    const executionTime = Date.now() - startTime;

    // Calculate summary statistics
    const usersProcessed = results?.length || 0;
    const successCount = results?.filter(r => r.success)?.length || 0;
    const totalFeedbackProcessed = results?.reduce((sum, r) => sum + (r.processed || 0), 0) || 0;
    const totalInsightsGenerated = results?.reduce((sum, r) => sum + (r.insightsGenerated || 0), 0) || 0;

    const resultSummary = {
      success: true,
      usersProcessed,
      successCount,
      failedCount: usersProcessed - successCount,
      totalFeedbackProcessed,
      totalInsightsGenerated,
      results: results || []
    };

    // Log execution to database
    await logCronExecution(
      'pattern-learning',
      'success',
      executionTime,
      resultSummary,
      null
    );

    log.info('Pattern learning completed', { executionTimeMs: executionTime, usersProcessed, successCount, totalFeedbackProcessed, totalInsightsGenerated });

    return res.status(200).json({
      ...resultSummary,
      timestamp: new Date().toISOString(),
      cronType: 'pattern-learning',
      executionTime: `${executionTime}ms`,
      nextScheduledRun: calculateNextRun()
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    // Log error execution
    await logCronExecution(
      'pattern-learning',
      'error',
      executionTime,
      null,
      error.message
    );

    log.error('Pattern learning failed', { executionTimeMs: executionTime, error });

    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      cronType: 'pattern-learning',
      executionTime: `${executionTime}ms`,
    });
  }
}

/**
 * Calculate the next scheduled run time
 * Returns ISO timestamp of next 6-hour mark
 */
function calculateNextRun() {
  const now = new Date();
  const currentHour = now.getUTCHours();

  // Find next 6-hour mark (0, 6, 12, 18)
  const nextRunHour = Math.ceil((currentHour + 1) / 6) * 6;
  const nextRun = new Date(now);
  nextRun.setUTCHours(nextRunHour % 24, 0, 0, 0);

  // If we wrapped around to tomorrow (e.g., 18 -> 24 -> 0)
  if (nextRunHour >= 24) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  // If next run is in the past, add 6 hours
  if (nextRun <= now) {
    nextRun.setUTCHours(nextRun.getUTCHours() + 6);
  }

  return nextRun.toISOString();
}
