/**
 * Cron: Health Monitor
 * =====================
 * Schedule: daily 04:30 UTC (after the busy ingestion crons finish at
 * 04:00 — observation-ingestion is 30-min cadence; the soul-signature
 * regen and other heavy daily ones finish before 06:00).
 *
 * What it catches (audit 2026-05-22):
 *   This sweep was built after a deep page-by-page audit found three
 *   crons that had been firing successfully for 7-30+ days while
 *   producing zero useful work — undetectable from cron_executions.status
 *   alone:
 *     - meeting-debrief: 30-min cadence, "success" every run, 0 debriefs
 *       generated for weeks because findDebriefCandidates' SQL filter
 *       was excluding every eligible briefing.
 *     - pluggy-sync: daily, "success" every run with errors=1, synced=0
 *       and no error detail surfaced.
 *     - soul-signature-regen: daily, "no_eligible_users" every run
 *       because SIGNATURE_STALE_DAYS=14 sat just above the user's
 *       actual signature age.
 *
 * Detection model:
 *   For each cron job, look at the last LOOKBACK_RUNS executions.
 *   If status='success' on all of them AND every "useful-work counter"
 *   in result_data is 0, flag as a zombie. Cleanup crons (delete-only)
 *   get a separate counter list because a 0 there means "nothing to
 *   clean," which is healthy.
 *
 * Output:
 *   - Persists a row to cron_executions with job_name='cron-health-monitor'
 *     and result_data containing the zombie list (so operators can query
 *     'WHERE job_name=cron-health-monitor' to see history).
 *   - Logs each zombie via log.error so Vercel runtime monitoring
 *     surfaces it (loud signal, not buried in JSON).
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronHealthMonitor');
const router = express.Router();

// Number of recent runs to inspect per cron. 3 is enough to distinguish
// "had nothing to do today" from "structurally broken." Audit-period
// crons had identical zero-work output for dozens of consecutive runs.
const LOOKBACK_RUNS = 3;

// Crons whose primary job is to DELETE / PRUNE. A 0 here is healthy
// (nothing to clean). Excluded from zombie detection.
const CLEANUP_CRONS = new Set([
  'stripe-webhook-events-cleanup',
  'agent-actions-cleanup',
  'memory-archive',
  'memory-forgetting',
]);

// Crons that LEGITIMATELY report zero on quiet days (e.g., consent
// re-confirmations only trigger when consent is near expiry).
// Excluded from zombie detection but logged for visibility.
const QUIET_BY_DESIGN = new Set([
  'bank-consent',
  'nudge-retrospective',
  'nudge-inactive',
  // meeting-prep only fires briefings when meetings are upcoming. On
  // weekends / holidays / off days, briefingsGenerated=0 is correct.
  // First live run of the monitor flagged this as a false positive.
  'meeting-prep',
  // department-execute skips proposals when autonomy < 3 (ACT_NOTIFY).
  // Most users haven't granted autonomy to most departments, so
  // executed=0 + skipped>0 is the normal state. Real bug would be
  // skipped=0 AND executed=0 (no proposals at all), already covered
  // by the per-producer cron monitoring (e.g., emailTriage).
  'department-execute',
]);

// The set of OUTPUT counters a cron uses to prove it did real work.
// Distinct from ITERATOR counters (users, scanned, eligible, reviewed)
// which mean "I looked at N things." A zombie cron scans plenty but
// produces nothing. That's exactly meeting-debrief: users=1 every
// 30 min for weeks while debriefsGenerated=0.
//
// Adding new counters here is safe — they become additional ways for
// a cron to prove liveness. Removing one would falsely mark its cron
// as zombie. Add iterators here ONLY when you want "this cron ran"
// to be sufficient proof of liveness.
const USEFUL_WORK_COUNTERS = [
  // Direct output verbs
  'processed', 'compiled', 'ingested', 'synced',
  'stored', 'tagged', 'retagged', 'debriefsGenerated',
  'briefingsGenerated', 'inserted', 'updated', 'sent',
  'extracted', 'archived', 'replayed', 'delivered',
  'triggered', 'executed', 'usersProcessed',
  // Counts of items that produced something (the cron itself).
  // Distinct from `users` / `scanned` / `eligible` which only mean
  // "I looked." Added after the 2026-05-22 first live run flagged
  // observation-ingestion as zombie purely because it logs
  // platformTimings (a per-user map) instead of a top-level counter.
  // Without 'successCount' we'd never see the ingestion succeeding.
  'successCount',
];

/**
 * Pull a numeric counter from a result_data JSON blob, treating missing
 * or non-numeric values as zero. Used to roll up "useful work" across
 * potentially-heterogeneous crons.
 */
function sumWork(resultData) {
  if (!resultData || typeof resultData !== 'object') return 0;
  let total = 0;
  for (const key of USEFUL_WORK_COUNTERS) {
    const v = resultData[key];
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

router.all('/', async (req, res) => {
  const startTime = Date.now();
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  try {
    // Distinct cron job names that have run in the last 48h. We treat
    // "didn't run at all" as a separate concern (handled below) so we
    // base the scan on what DID run.
    const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentRuns, error: fetchErr } = await supabaseAdmin
      .from('cron_executions')
      .select('job_name, status, result_data, executed_at, error_message')
      .gte('executed_at', sinceIso)
      .order('executed_at', { ascending: false })
      .limit(2000);

    if (fetchErr) {
      log.error('Failed to read cron_executions', { message: fetchErr.message });
      await logCronExecution('cron-health-monitor', 'error', Date.now() - startTime, null, fetchErr.message);
      return res.status(500).json({ success: false, error: 'fetch_failed' });
    }

    // Group runs by job_name, preserving DESC order so [0..N-1] = most recent N.
    const runsByJob = new Map();
    for (const r of recentRuns || []) {
      if (r.job_name === 'cron-health-monitor') continue; // skip ourselves
      const arr = runsByJob.get(r.job_name) || [];
      if (arr.length < LOOKBACK_RUNS) {
        arr.push(r);
        runsByJob.set(r.job_name, arr);
      }
    }

    // Classify each cron
    const zombies = [];
    const errored = [];
    const quietByDesign = [];
    const healthy = [];

    for (const [job, runs] of runsByJob.entries()) {
      // Did EVERY recent run report status='error'?
      const allErrored = runs.length > 0 && runs.every(r => r.status === 'error');
      if (allErrored) {
        errored.push({
          job,
          runs: runs.length,
          firstError: runs[0]?.error_message?.slice(0, 200) || null,
        });
        log.error('Cron in sustained error state', { job, runs: runs.length });
        continue;
      }

      if (CLEANUP_CRONS.has(job)) {
        healthy.push(job);
        continue;
      }

      // Sum useful-work across LOOKBACK_RUNS runs
      const totalWork = runs.reduce((sum, r) => sum + sumWork(r.result_data), 0);
      const allSuccess = runs.every(r => r.status === 'success');

      if (allSuccess && totalWork === 0 && runs.length >= LOOKBACK_RUNS) {
        if (QUIET_BY_DESIGN.has(job)) {
          quietByDesign.push(job);
          continue;
        }
        zombies.push({
          job,
          runs: runs.length,
          lastRun: runs[0]?.executed_at || null,
          sampleResult: JSON.stringify(runs[0]?.result_data || {}).slice(0, 200),
        });
        log.error('Zombie cron detected — success status but no useful work', {
          job,
          runs: runs.length,
          sample: runs[0]?.result_data,
        });
      } else {
        healthy.push(job);
      }
    }

    const durationMs = Date.now() - startTime;
    const report = {
      cronsInspected: runsByJob.size,
      zombies: zombies.length,
      errored: errored.length,
      quietByDesign: quietByDesign.length,
      healthy: healthy.length,
      zombieList: zombies,
      erroredList: errored,
    };
    log.info('Cron health sweep complete', report);
    await logCronExecution('cron-health-monitor', 'success', durationMs, report);
    return res.json({ success: true, ...report, durationMs });
  } catch (err) {
    log.error('Health monitor unhandled error', { message: err.message });
    await logCronExecution('cron-health-monitor', 'error', Date.now() - startTime, null, err.message);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? err.message : 'monitor_failed',
    });
  }
});

export default router;
