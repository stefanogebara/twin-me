/**
 * Vercel Cron Job Endpoint: Correlation Discovery
 *
 * This endpoint is called by Vercel Cron (weekly on Sunday at 4 AM UTC)
 * to discover statistical correlations between user metrics.
 *
 * The correlation discovery process:
 * 1. Finds all users with sufficient baseline data
 * 2. Discovers pairwise correlations between metrics
 * 3. Validates existing correlations with new data
 * 4. Generates hypotheses from significant correlations
 * 5. Logs execution for monitoring
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Schedule: 0 4 * * 0 (Sunday at 4:00 AM UTC)
 */

import { createClient } from '@supabase/supabase-js';
import correlationEngine from '../services/correlationDiscoveryEngine.js';
import hypothesisEngine from '../services/patternHypothesisEngine.js';

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
        feedback_processed: result?.correlationsDiscovered || 0,
        insights_generated: result?.hypothesesGenerated || 0,
        error_message: errorMessage,
        result_data: result || {},
        executed_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('[CRON] Failed to log execution:', error.message);
  }
}

/**
 * Get all users with sufficient baseline data
 */
async function getUsersWithBaselines(minBaselines = 5) {
  const { data, error } = await getSupabaseClient()
    .from('pl_user_baselines')
    .select('user_id')
    .gte('sample_count', correlationEngine.MIN_SAMPLE_SIZE);

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }

  // Count baselines per user and filter
  const userCounts = {};
  for (const row of data || []) {
    userCounts[row.user_id] = (userCounts[row.user_id] || 0) + 1;
  }

  return Object.entries(userCounts)
    .filter(([_, count]) => count >= minBaselines)
    .map(([userId]) => userId);
}

/**
 * Vercel Cron Job Handler
 * Called weekly on Sunday at 4 AM UTC
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[CRON] Correlation discovery started at ${new Date().toISOString()}`);
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
    // Get users with sufficient data
    const userIds = await getUsersWithBaselines(5);
    console.log(`[CRON] Found ${userIds.length} users with sufficient baseline data`);

    const results = [];
    let totalCorrelationsDiscovered = 0;
    let totalCorrelationsValidated = 0;
    let totalCorrelationsInvalidated = 0;
    let totalHypothesesGenerated = 0;

    // Process each user
    for (const userId of userIds) {
      try {
        console.log(`[CRON] Processing user ${userId.substring(0, 8)}...`);

        // Step 1: Discover new correlations
        const discoveryResult = await correlationEngine.discoverCorrelations(userId, true);
        totalCorrelationsDiscovered += discoveryResult.discovered;

        console.log(`  - Discovered ${discoveryResult.discovered} correlations`);

        // Step 2: Validate existing correlations
        const validationResult = await correlationEngine.validateExistingCorrelations(userId);
        totalCorrelationsValidated += validationResult.validated;
        totalCorrelationsInvalidated += validationResult.invalidated;

        console.log(`  - Validated ${validationResult.validated}, invalidated ${validationResult.invalidated}`);

        // Step 3: Generate hypotheses from correlations
        const hypothesisResult = await hypothesisEngine.generateHypotheses(userId, true);
        totalHypothesesGenerated += hypothesisResult.generated;

        console.log(`  - Generated ${hypothesisResult.generated} hypotheses`);

        // Step 4: Deactivate stale hypotheses
        const deactivated = await hypothesisEngine.deactivateStaleHypotheses(userId);
        if (deactivated > 0) {
          console.log(`  - Deactivated ${deactivated} stale hypotheses`);
        }

        results.push({
          userId: userId.substring(0, 8) + '...',
          success: true,
          correlationsDiscovered: discoveryResult.discovered,
          correlationsValidated: validationResult.validated,
          correlationsInvalidated: validationResult.invalidated,
          hypothesesGenerated: hypothesisResult.generated
        });

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
      correlationsDiscovered: totalCorrelationsDiscovered,
      correlationsValidated: totalCorrelationsValidated,
      correlationsInvalidated: totalCorrelationsInvalidated,
      hypothesesGenerated: totalHypothesesGenerated,
      results
    };

    await logCronExecution('correlation-discovery', 'success', executionTime, resultSummary);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[CRON] Correlation discovery completed in ${executionTime}ms`);
    console.log(`  - Users: ${userIds.length}`);
    console.log(`  - Correlations discovered: ${totalCorrelationsDiscovered}`);
    console.log(`  - Correlations validated: ${totalCorrelationsValidated}`);
    console.log(`  - Correlations invalidated: ${totalCorrelationsInvalidated}`);
    console.log(`  - Hypotheses generated: ${totalHypothesesGenerated}`);
    console.log(`${'='.repeat(60)}\n`);

    return res.status(200).json({
      ...resultSummary,
      timestamp: new Date().toISOString(),
      cronType: 'correlation-discovery',
      executionTime: `${executionTime}ms`,
      nextScheduledRun: calculateNextRun()
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    await logCronExecution('correlation-discovery', 'error', executionTime, null, error.message);

    console.error(`[CRON] Correlation discovery failed:`, error);

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      cronType: 'correlation-discovery',
      executionTime: `${executionTime}ms`,
    });
  }
}

/**
 * Calculate next scheduled run (Sunday 4 AM UTC)
 */
function calculateNextRun() {
  const now = new Date();
  const nextRun = new Date(now);

  // Find next Sunday
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  nextRun.setUTCDate(nextRun.getUTCDate() + daysUntilSunday);
  nextRun.setUTCHours(4, 0, 0, 0);

  // If today is Sunday and we haven't run yet
  if (now.getUTCDay() === 0 && now.getUTCHours() < 4) {
    nextRun.setUTCDate(now.getUTCDate());
  }

  return nextRun.toISOString();
}
