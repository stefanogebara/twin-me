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

import { createClient } from '@supabase/supabase-js';
import { PatternLearningService } from '../services/patternLearningService.js';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Log cron execution to database for tracking and monitoring
 */
async function logCronExecution(jobName, status, executionTimeMs, result, errorMessage = null) {
  try {
    const logEntry = {
      job_name: jobName,
      status,
      execution_time_ms: executionTimeMs,
      users_processed: result?.usersProcessed || 0,
      feedback_processed: result?.totalFeedbackProcessed || 0,
      insights_generated: result?.totalInsightsGenerated || 0,
      error_message: errorMessage,
      result_data: result || {},
      executed_at: new Date().toISOString(),
    };

    await getSupabaseClient()
      .from('cron_executions')
      .insert(logEntry);

    console.log(`📊 [CRON] Execution logged to database`);
  } catch (error) {
    // Don't fail the cron job if logging fails
    console.error('⚠️  [CRON] Failed to log execution:', error.message);
  }
}

/**
 * Vercel Cron Job Handler
 * Called every 6 hours by Vercel Cron (00:00, 06:00, 12:00, 18:00 UTC)
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌐 [CRON] Pattern learning endpoint called at ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  // Security: Verify cron secret (Vercel automatically adds this header)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error('❌ Unauthorized cron request - invalid secret');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid CRON_SECRET',
    });
  }

  try {
    // Execute pattern learning for all users
    console.log(`🔄 [CRON] Starting pattern learning batch processing...`);
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

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [CRON] Pattern learning completed in ${executionTime}ms`);
    console.log(`   - Users processed: ${usersProcessed}`);
    console.log(`   - Successful: ${successCount}`);
    console.log(`   - Feedback items: ${totalFeedbackProcessed}`);
    console.log(`   - Insights generated: ${totalInsightsGenerated}`);
    console.log(`${'='.repeat(60)}\n`);

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

    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [CRON] Pattern learning failed in ${executionTime}ms:`, error);
    console.error(`${'='.repeat(60)}\n`);

    return res.status(500).json({
      success: false,
      error: error.message,
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
