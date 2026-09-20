/**
 * Shared Cron Execution Logger
 * ==============================
 * Logs cron job executions to the `cron_executions` table for monitoring.
 * Used by all cron handlers for consistent tracking.
 *
 * Usage:
 *   import { logCronExecution } from '../services/cronLogger.js';
 *
 *   const startTime = Date.now();
 *   // ... do work ...
 *   await logCronExecution('my-cron', 'success', Date.now() - startTime, resultData);
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('CronLogger');

/**
 * Log a cron execution to the database.
 *
 * @param {string} jobName - Cron job identifier (e.g. 'platform-polling')
 * @param {'success'|'error'} status - Execution outcome
 * @param {number} executionTimeMs - Duration in milliseconds
 * @param {object|null} resultData - Arbitrary JSON result payload
 * @param {string|null} errorMessage - Error description (if status='error')
 */
/**
 * Check if a cron job ran successfully within the given cooldown window.
 * Use this as an early-exit guard before expensive LLM dispatches.
 *
 * @param {string} jobName - Same job name used in logCronExecution
 * @param {number} cooldownMs - Cooldown window in milliseconds (default: 20 hours)
 * @returns {Promise<boolean>} true if the job ran successfully within the window
 */
export async function wasRecentlyRun(jobName, cooldownMs = 20 * 60 * 60 * 1000) {
  try {
    const since = new Date(Date.now() - cooldownMs).toISOString();
    const { data } = await supabaseAdmin
      .from('cron_executions')
      .select('executed_at')
      .eq('job_name', jobName)
      .eq('status', 'success')
      .gte('executed_at', since)
      .order('executed_at', { ascending: false })
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    // If the check fails, don't block the cron — run it
    return false;
  }
}

/**
 * A failed run reaches Sentry as well as the table, tagged by job, so an alert rule on it is
 * the whole of QW3 (2026-09-20). Only when a DSN is configured; never throws; never blocks.
 */
export async function reportCronFailure(jobName, status, errorMessage = null, resultData = null) {
  if (!process.env.SENTRY_DSN || status === 'success') return false;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.captureMessage(`cron ${jobName} ${status}${errorMessage ? `: ${String(errorMessage).slice(0, 200)}` : ''}`, {
      level: 'error',
      tags: { cron: jobName, status },
      extra: { result: resultData || null },
    });
    return true;
  } catch (err) {
    log.warn('Cron failure could not be reported', { jobName, error: err.message });
    return false;
  }
}

export async function logCronExecution(jobName, status, executionTimeMs, resultData = null, errorMessage = null) {
  await reportCronFailure(jobName, status, errorMessage, resultData);
  try {
    const { error } = await supabaseAdmin
      .from('cron_executions')
      .insert({
        job_name: jobName,
        status,
        execution_time_ms: executionTimeMs,
        result_data: resultData || {},
        error_message: errorMessage,
        executed_at: new Date().toISOString(),
      });

    if (error) {
      log.warn('Failed to log cron execution', { jobName, error: error.message });
    }
  } catch (err) {
    // Never let logging failures break the cron job
    log.warn('Cron execution logging error', { jobName, error: err.message });
  }
}
