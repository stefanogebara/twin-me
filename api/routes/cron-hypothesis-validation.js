/**
 * Vercel Cron Job Endpoint: Hypothesis Validation & Insight Generation
 *
 * This endpoint is called by Vercel Cron (daily at 5 AM UTC)
 * to validate hypotheses and generate proactive insights.
 *
 * The validation process:
 * 1. Finds all users with active hypotheses
 * 2. Checks recent deviations against hypothesis predictions
 * 3. Updates hypothesis confidence based on validation
 * 4. Generates proactive insights for significant deviations
 * 5. Cleans up expired data
 * 6. Logs execution for monitoring
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Schedule: 0 5 * * * (daily at 5:00 AM UTC)
 */

import { createClient } from '@supabase/supabase-js';
import hypothesisEngine from '../services/patternHypothesisEngine.js';
import insightService from '../services/proactiveInsightService.js';
import deviationDetector from '../services/deviationDetector.js';

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
        feedback_processed: result?.hypothesesValidated || 0,
        insights_generated: result?.insightsGenerated || 0,
        error_message: errorMessage,
        result_data: result || {},
        executed_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('[CRON] Failed to log execution:', error.message);
  }
}

/**
 * Get all users with active hypotheses or recent deviations
 */
async function getActiveUsers() {
  // Get users with active hypotheses
  const { data: hypothesisUsers } = await getSupabaseClient()
    .from('pl_pattern_hypotheses')
    .select('user_id')
    .eq('is_active', true);

  // Get users with recent deviations (last 24 hours)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: deviationUsers } = await getSupabaseClient()
    .from('pl_behavioral_deviations')
    .select('user_id')
    .gte('detected_at', yesterday.toISOString());

  // Combine and dedupe
  const allUserIds = new Set([
    ...(hypothesisUsers || []).map(r => r.user_id),
    ...(deviationUsers || []).map(r => r.user_id)
  ]);

  return [...allUserIds];
}

/**
 * Validate hypotheses against recent observations
 */
async function validateUserHypotheses(userId) {
  const results = {
    validated: 0,
    invalidated: 0,
    unchanged: 0
  };

  // Get active hypotheses
  const hypotheses = await hypothesisEngine.getActiveHypotheses(userId, null, 0.3);

  // Get recent deviations (last 24 hours)
  const deviations = await deviationDetector.getRecentDeviations(userId, 50);

  for (const hypothesis of hypotheses) {
    if (!hypothesis.correlation) continue;

    const { metric_a, metric_b, direction } = hypothesis.correlation;

    // Find deviations in metric_a
    const metricADeviations = deviations.filter(d => d.metric_name === metric_a);

    // Find corresponding deviations in metric_b (within time lag window)
    for (const devA of metricADeviations) {
      const timeA = new Date(devA.detected_at).getTime();
      const lagHours = hypothesis.correlation.time_lag_hours || 0;
      const lagMs = Math.abs(lagHours) * 60 * 60 * 1000;

      // Find metric_b deviation within window
      const matchingDevB = deviations.find(d => {
        if (d.metric_name !== metric_b) return false;
        const timeB = new Date(d.detected_at).getTime();
        const timeDiff = lagHours >= 0 ? timeB - timeA : timeA - timeB;
        return timeDiff >= 0 && timeDiff <= lagMs + (2 * 60 * 60 * 1000); // 2h tolerance
      });

      if (matchingDevB) {
        // Check if directions match the hypothesis
        const expectedDirection = direction === 'positive'
          ? devA.direction
          : (devA.direction === 'above' ? 'below' : 'above');

        const validated = matchingDevB.direction === expectedDirection;

        await hypothesisEngine.recordValidation(hypothesis.id, validated);

        if (validated) {
          results.validated++;
        } else {
          results.invalidated++;
        }
      }
    }
  }

  return results;
}

/**
 * Vercel Cron Job Handler
 * Called daily at 5 AM UTC
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[CRON] Hypothesis validation started at ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  // Security: Verify cron secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized cron request');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    // Get active users
    const userIds = await getActiveUsers();
    console.log(`[CRON] Found ${userIds.length} active users`);

    const results = [];
    let totalHypothesesValidated = 0;
    let totalHypothesesInvalidated = 0;
    let totalInsightsGenerated = 0;
    let totalPredictiveInsights = 0;

    // Process each user
    for (const userId of userIds) {
      try {
        console.log(`[CRON] Processing user ${userId.substring(0, 8)}...`);

        // Step 1: Validate hypotheses
        const validationResult = await validateUserHypotheses(userId);
        totalHypothesesValidated += validationResult.validated;
        totalHypothesesInvalidated += validationResult.invalidated;

        console.log(`  - Validated ${validationResult.validated}, invalidated ${validationResult.invalidated}`);

        // Step 2: Generate insights from recent deviations
        const insightResult = await insightService.generateInsights(userId);
        totalInsightsGenerated += insightResult.generated;

        console.log(`  - Generated ${insightResult.generated} insights`);

        // Step 3: Generate predictive insights
        const predictiveResult = await insightService.generatePredictiveInsights(userId);
        totalPredictiveInsights += predictiveResult.generated;

        if (predictiveResult.generated > 0) {
          console.log(`  - Generated ${predictiveResult.generated} predictive insights`);
        }

        results.push({
          userId: userId.substring(0, 8) + '...',
          success: true,
          hypothesesValidated: validationResult.validated,
          hypothesesInvalidated: validationResult.invalidated,
          insightsGenerated: insightResult.generated,
          predictiveInsights: predictiveResult.generated
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

    // Cleanup expired data
    console.log('[CRON] Cleaning up expired data...');
    const cleanedInsights = await insightService.cleanupOldInsights();

    // Cleanup expired from pattern learning tables
    const { data: cleanupResult } = await getSupabaseClient()
      .rpc('cleanup_expired_pattern_learning_data');

    console.log(`  - Cleaned ${cleanedInsights} expired insights`);
    if (cleanupResult) {
      console.log(`  - Cleaned ${cleanupResult} expired records from pattern tables`);
    }

    const executionTime = Date.now() - startTime;

    const resultSummary = {
      success: true,
      usersProcessed: userIds.length,
      hypothesesValidated: totalHypothesesValidated,
      hypothesesInvalidated: totalHypothesesInvalidated,
      insightsGenerated: totalInsightsGenerated,
      predictiveInsights: totalPredictiveInsights,
      cleanedInsights,
      results
    };

    await logCronExecution('hypothesis-validation', 'success', executionTime, resultSummary);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[CRON] Hypothesis validation completed in ${executionTime}ms`);
    console.log(`  - Users: ${userIds.length}`);
    console.log(`  - Hypotheses validated: ${totalHypothesesValidated}`);
    console.log(`  - Hypotheses invalidated: ${totalHypothesesInvalidated}`);
    console.log(`  - Insights generated: ${totalInsightsGenerated}`);
    console.log(`  - Predictive insights: ${totalPredictiveInsights}`);
    console.log(`${'='.repeat(60)}\n`);

    return res.status(200).json({
      ...resultSummary,
      timestamp: new Date().toISOString(),
      cronType: 'hypothesis-validation',
      executionTime: `${executionTime}ms`,
      nextScheduledRun: calculateNextRun()
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    await logCronExecution('hypothesis-validation', 'error', executionTime, null, error.message);

    console.error(`[CRON] Hypothesis validation failed:`, error);

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      cronType: 'hypothesis-validation',
      executionTime: `${executionTime}ms`,
    });
  }
}

/**
 * Calculate next scheduled run (5 AM UTC daily)
 */
function calculateNextRun() {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(5, 0, 0, 0);

  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun.toISOString();
}
