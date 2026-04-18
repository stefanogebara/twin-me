/**
 * Cron: Agent Actions TTL Cleanup
 * ================================
 * Schedule: daily at 2am UTC (0 2 * * *)
 *
 * Marks pending agent_actions proposals as 'expired' when they've been
 * sitting in user_response = NULL for more than TTL_DAYS (default 7).
 *
 * Why this exists:
 * - department-execute cron skips proposals whose department autonomy
 *   is below ACT_NOTIFY (3). Those proposals remain user_response = NULL.
 * - Without a TTL, they accumulate forever and keep filling the oldest-50
 *   fetch window on every cron run, starving newer proposals.
 * - Soft-expire (user_response = 'expired' + resolved_at = NOW) preserves
 *   the audit trail while removing them from the pending queue.
 *
 * Security: protected by CRON_SECRET Bearer token.
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronAgentActionsCleanup');
const router = express.Router();

// Proposals older than this, still pending, are marked expired.
const TTL_DAYS = 7;

// Safety cap — one run won't expire more than this many rows. Prevents a
// runaway mass-update if the backlog is huge after a deployment gap.
const MAX_EXPIRATIONS_PER_RUN = 500;

router.all('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    const cutoffIso = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch pending proposals older than cutoff. Cap the batch size.
    const { data: stale, error: fetchErr } = await supabaseAdmin
      .from('agent_actions')
      .select('id')
      .is('user_response', null)
      .lt('created_at', cutoffIso)
      .limit(MAX_EXPIRATIONS_PER_RUN);

    if (fetchErr) {
      log.error('Failed to fetch stale proposals', { error: fetchErr.message });
      const elapsed = Date.now() - startTime;
      await logCronExecution('agent-actions-cleanup', 'error', elapsed, null, fetchErr.message);
      return res.status(500).json({ success: false, error: fetchErr.message });
    }

    if (!stale || stale.length === 0) {
      const elapsed = Date.now() - startTime;
      log.info('No stale proposals to expire', { cutoffIso, elapsedMs: elapsed });
      await logCronExecution('agent-actions-cleanup', 'success', elapsed, { expired: 0, cutoffDays: TTL_DAYS });
      return res.json({ success: true, expired: 0, cutoffDays: TTL_DAYS, elapsedMs: elapsed });
    }

    const staleIds = stale.map(r => r.id);

    // 2. Batch soft-expire them. outcome_data captures the reason so the
    //    audit trail survives a later forensic review.
    const { error: updateErr, count } = await supabaseAdmin
      .from('agent_actions')
      .update({
        user_response: 'expired',
        resolved_at: new Date().toISOString(),
        outcome_data: { reason: 'ttl_expired', ttl_days: TTL_DAYS, expired_at: new Date().toISOString() },
      }, { count: 'exact' })
      .in('id', staleIds);

    if (updateErr) {
      log.error('Failed to update stale proposals', { error: updateErr.message, batchSize: staleIds.length });
      const elapsed = Date.now() - startTime;
      await logCronExecution('agent-actions-cleanup', 'error', elapsed, null, updateErr.message);
      return res.status(500).json({ success: false, error: updateErr.message });
    }

    const expired = count ?? staleIds.length;
    const elapsed = Date.now() - startTime;
    log.info('Expired stale proposals', { expired, cutoffIso, batchSize: staleIds.length, elapsedMs: elapsed });
    await logCronExecution('agent-actions-cleanup', 'success', elapsed, { expired, cutoffDays: TTL_DAYS });

    return res.json({ success: true, expired, cutoffDays: TTL_DAYS, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('agent-actions-cleanup', 'error', elapsed, null, err.message);
    log.error('Agent actions cleanup cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
