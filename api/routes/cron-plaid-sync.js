/**
 * Cron: Plaid Fallback Sync — Financial-Emotional Twin US safety net
 * ====================================================================
 * PARKED (replan-2026-06-10 Track D): NOT mounted in server.js and NOT
 * scheduled in vercel.json. Plaid is sandbox-only and sits behind the
 * default-off `money_plaid` feature flag, so this daily sync would only
 * burn Vercel invocations re-pulling sandbox data. The file is kept (not
 * deleted) so un-parking is a two-line revert: remount in server.js and
 * re-add the vercel.json cron entry ("0 7 * * *").
 *
 * Original schedule: daily at 7am UTC (= 3am ET, low-US-traffic window).
 *
 * WHY THIS CRON EXISTS
 * --------------------
 * Plaid transactions arrive primarily via webhook (TRANSACTIONS /
 * SYNC_UPDATES_AVAILABLE). The webhook handler is cursor-idempotent —
 * re-delivery is safe. But webhooks fail silently sometimes:
 *   - Vercel cold-start timeouts (>5s = Plaid retries with backoff)
 *   - Plaid's webhook system occasionally drops events under load
 *   - User reauths during an outage and we miss LOGIN_REPAIRED
 *
 * This cron asks Plaid to incrementally sync every active connection. The
 * underlying ingestion is cursor-idempotent (the persisted cursor on
 * user_bank_connections.plaid_sync_cursor advances after each call) — so
 * re-running is cheap. Missed transactions land, already-ingested ones
 * no-op via the unique plaid_transaction_id index.
 *
 * COST PROFILE (per CLAUDE.md rules)
 * -----------------------------------
 *   - Schedule: once per day (not every-N-minutes)
 *   - Cap: 50 connections per run (keeps us under 60s Vercel maxDuration)
 *   - Each connection = ~1 Plaid API call per page (typically 1 page)
 *   - No LLM calls in this cron path (emotion tagger runs async in ingestion)
 *
 * SECURITY
 * --------
 *   - Gated by CRON_SECRET Bearer token (verifyCronSecret middleware)
 *   - Only operates on connections where deleted_at IS NULL AND provider='plaid'
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import { syncItem } from '../services/transactions/plaidIngestion.js';

const log = createLogger('CronPlaidSync');
const router = express.Router();

const MAX_CONNECTIONS_PER_RUN = 50;

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // Cooldown — if we ran in the last 20h, skip. Vercel sometimes fires
    // crons twice on redeploy boundaries; this keeps us once-per-day.
    if (await wasRecentlyRun('plaid-sync')) {
      return res.json({ success: true, synced: 0, reason: 'cooldown' });
    }

    const { data: connections, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, user_id, plaid_item_id, status, updated_at')
      .eq('provider', 'plaid')
      .is('deleted_at', null)
      .not('plaid_item_id', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(MAX_CONNECTIONS_PER_RUN);

    if (error) {
      log.error(`query connections failed: ${error.message}`);
      await logCronExecution('plaid-sync', 'error', Date.now() - startTime, null, error.message);
      return res.status(500).json({ success: false, error: 'query_failed' });
    }

    if (!connections?.length) {
      log.info('no active plaid connections to sync');
      await logCronExecution('plaid-sync', 'success', Date.now() - startTime, { synced: 0 });
      return res.json({ success: true, synced: 0 });
    }

    let synced = 0;
    let ingested = 0;
    const errors = [];

    for (const c of connections) {
      try {
        const result = await syncItem(null, c.plaid_item_id, { allowNudge: false });
        ingested += result?.inserted || 0;
        synced++;
      } catch (err) {
        log.warn(`sync failed for item ${c.plaid_item_id}: ${err.message}`);
        errors.push({ item: c.plaid_item_id, error: err.message });
      }
    }

    const duration = Date.now() - startTime;
    log.info(`synced ${synced}/${connections.length} plaid connections, ingested ${ingested} tx, ${errors.length} errors, ${duration}ms`);

    await logCronExecution('plaid-sync', 'success', duration, {
      synced,
      ingested,
      errors: errors.length,
    });

    return res.json({
      success: true,
      synced,
      ingested,
      errors: errors.length,
      duration_ms: duration,
    });
  } catch (err) {
    log.error(`cron failed: ${err.message}`);
    await logCronExecution('plaid-sync', 'error', Date.now() - startTime, null, err.message);
    return res.status(500).json({
      success: false,
      error: 'cron_failed',
      ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
    });
  }
});

export default router;
