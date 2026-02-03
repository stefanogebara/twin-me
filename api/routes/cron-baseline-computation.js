/**
 * Vercel Cron Job Endpoint: Baseline Computation
 *
 * This endpoint is called by Vercel Cron (daily at 3 AM UTC)
 * to compute personal baselines for all users with recent activity.
 *
 * The baseline computation process:
 * 1. Finds all users with raw behavioral events
 * 2. Computes rolling statistics (7/30/90 day windows) for each metric
 * 3. Updates the user_baselines table with new statistics
 * 4. Logs execution for monitoring
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Schedule: 0 3 * * * (daily at 3:00 AM UTC)
 */

import { createClient } from '@supabase/supabase-js';
import baselineEngine from '../services/baselineEngine.js';

// Lazy initialization
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
 * Log cron execution to database
 */
async function logCronExecution(jobName, status, executionTimeMs, result, errorMessage = null) {
  try {
    await getSupabaseClient()
      .from('cron_executions')
      .insert({
        job_name: jobName,
        status,
        execution_time_ms: executionTimeMs,
        users_processed: result?.usersProcessed || 0,
        feedback_processed: result?.baselinesComputed || 0,
        insights_generated: result?.metricsTotal || 0,
        error_message: errorMessage,
        result_data: result || {},
        executed_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('[CRON] Failed to log execution:', error.message);
  }
}

/**
 * Get all users with recent raw events
 */
async function getUsersWithRecentActivity(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await getSupabaseClient()
    .from('pl_raw_behavioral_events')
    .select('user_id')
    .gte('event_timestamp', startDate.toISOString());

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }

  // Get unique user IDs
  return [...new Set((data || []).map(r => r.user_id))];
}

/**
 * Vercel Cron Job Handler
 * Called daily at 3 AM UTC
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[CRON] Baseline computation started at ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  // Security: Verify cron secret
  // SECURITY FIX: Require CRON_SECRET in production (was previously bypassed if not set)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    if (!cronSecret) {
      console.error('CRON_SECRET not configured in production');
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'CRON_SECRET must be configured in production',
      });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cron request');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }
  }

  try {
    // Get users with recent activity
    const userIds = await getUsersWithRecentActivity(7);
    console.log(`[CRON] Found ${userIds.length} users with recent activity`);

    const results = [];
    let totalBaselinesComputed = 0;
    let totalMetrics = 0;

    // Process each user
    for (const userId of userIds) {
      try {
        console.log(`[CRON] Computing baselines for user ${userId.substring(0, 8)}...`);

        const result = await baselineEngine.computeBaselines(userId);

        totalBaselinesComputed += result.computed;
        totalMetrics += result.metrics.length;

        results.push({
          userId: userId.substring(0, 8) + '...',
          success: true,
          computed: result.computed,
          failed: result.failed,
          metrics: result.metrics.length
        });

        console.log(`  - Computed ${result.computed} baselines for ${result.metrics.length} metrics`);
      } catch (error) {
        console.error(`[CRON] Error for user ${userId}:`, error.message);
        results.push({
          userId: userId.substring(0, 8) + '...',
          success: false,
          error: error.message
        });
      }
    }

    const executionTime = Date.now() - startTime;

    const resultSummary = {
      success: true,
      usersProcessed: userIds.length,
      baselinesComputed: totalBaselinesComputed,
      metricsTotal: totalMetrics,
      results
    };

    await logCronExecution('baseline-computation', 'success', executionTime, resultSummary);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[CRON] Baseline computation completed in ${executionTime}ms`);
    console.log(`  - Users: ${userIds.length}`);
    console.log(`  - Baselines computed: ${totalBaselinesComputed}`);
    console.log(`  - Unique metrics: ${totalMetrics}`);
    console.log(`${'='.repeat(60)}\n`);

    return res.status(200).json({
      ...resultSummary,
      timestamp: new Date().toISOString(),
      cronType: 'baseline-computation',
      executionTime: `${executionTime}ms`,
      nextScheduledRun: calculateNextRun()
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    await logCronExecution('baseline-computation', 'error', executionTime, null, error.message);

    console.error(`[CRON] Baseline computation failed:`, error);

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      cronType: 'baseline-computation',
      executionTime: `${executionTime}ms`,
    });
  }
}

/**
 * Calculate next scheduled run (3 AM UTC daily)
 */
function calculateNextRun() {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(3, 0, 0, 0);

  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun.toISOString();
}
