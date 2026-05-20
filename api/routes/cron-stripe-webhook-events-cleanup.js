/**
 * Cron: Stripe webhook events table cleanup
 * ==========================================
 * Schedule: weekly, Sunday 04:00 UTC (0 4 * * 0)
 *
 * The stripe_webhook_events table (added by migration
 * 20260515_create_stripe_webhook_events.sql) records every Stripe webhook
 * event.id we've processed, so retries short-circuit to 200 without
 * re-running the handler (audit C1).
 *
 * Stripe retries failed deliveries for up to 3 days. After ~4 days, an
 * event_id can no longer be replayed by Stripe, so the idempotency row
 * for it is dead weight. Without cleanup the table grows unboundedly —
 * a Stripe-active account with ~100 events/day would accumulate ~36k
 * rows/year.
 *
 * Retention: 30 days. Generous safety margin past Stripe's 3-day retry
 * window. Keeps a month of audit history for incident review.
 *
 * Security: protected by CRON_SECRET Bearer token (mirrors every other cron).
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';
import { logCronExecution } from '../services/cronLogger.js';

const log = createLogger('CronStripeWebhookEventsCleanup');
const router = express.Router();

const RETENTION_DAYS = 30;

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const auth = verifyCronSecret(req);
    if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

    const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('stripe_webhook_events')
      .delete({ count: 'exact' })
      .lt('received_at', cutoffIso)
      .select('event_id', { count: 'exact' });

    if (error) {
      log.error('cleanup failed', { code: error.code, message: error.message });
      await logCronExecution('stripe-webhook-events-cleanup', 'error', Date.now() - startTime, null, error.message);
      return res.status(500).json({ success: false, error: 'cleanup failed' });
    }

    const deleted = Array.isArray(data) ? data.length : 0;
    const durationMs = Date.now() - startTime;
    log.info('cleanup complete', { deleted, retentionDays: RETENTION_DAYS, durationMs });
    await logCronExecution('stripe-webhook-events-cleanup', 'success', durationMs, { deleted, retentionDays: RETENTION_DAYS });
    return res.json({ success: true, deleted, retentionDays: RETENTION_DAYS, durationMs });
  } catch (err) {
    log.error('cleanup unhandled', { message: err.message });
    await logCronExecution('stripe-webhook-events-cleanup', 'error', Date.now() - startTime, null, err.message);
    return res.status(500).json({ success: false, error: 'cleanup failed' });
  }
});

export default router;
