/**
 * Cron: Pluggy Fallback Sync — Financial-Emotional Twin safety net
 * =================================================================
 * Runs daily at 6am UTC (= 3am São Paulo, low-traffic window).
 *
 * WHY THIS CRON EXISTS
 * --------------------
 * Pluggy transactions arrive primarily via webhook (item/created,
 * transactions/created, transactions/updated). The webhook handler is
 * idempotent — re-delivery is safe. But webhooks can fail silently:
 *   - Vercel cold start timeouts
 *   - Intermittent 500s (see 2026-04-21 incident: 4 webhooks failed within
 *     a 3-min window before self-recovering)
 *   - Network partition between Pluggy -> Vercel
 *   - User's item lost connection and we missed the recovery webhook
 *
 * This cron asks Pluggy to refresh every active connection and re-fetch the
 * last 7 days of transactions. The underlying ingestion is idempotent
 * (unique index on pluggy_transaction_id), so re-running is cheap — missed
 * transactions get inserted, already-ingested ones no-op.
 *
 * COST PROFILE (per CLAUDE.md rules)
 * -----------------------------------
 *   - Schedule: once per day (not every-N-minutes)
 *   - Cap: 50 connections per run (keeps us under 60s Vercel maxDuration)
 *   - Each connection = ~2 Pluggy API calls (sync + list tx) + 1 DB batch
 *   - No LLM calls in this cron path (emotion tagger runs async in ingestion)
 *
 * SECURITY
 * --------
 *   - Gated by CRON_SECRET Bearer token (verifyCronSecret middleware)
 *   - Only operates on connections where deleted_at IS NULL
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { supabaseAdmin } from '../services/database.js';
import { logCronExecution, wasRecentlyRun } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';
import * as pluggy from '../services/transactions/pluggyClient.js';
import { seedItemTransactions } from '../services/transactions/pluggyIngestion.js';

const log = createLogger('CronPluggySync');
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
    if (await wasRecentlyRun('pluggy-sync')) {
      return res.json({ success: true, synced: 0, reason: 'cooldown' });
    }

    // Fetch active connections, oldest-updated first so stalest ones get fresh data.
    const { data: connections, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, user_id, pluggy_item_id, status, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: true })
      .limit(MAX_CONNECTIONS_PER_RUN);

    if (error) {
      log.error(`query connections failed: ${error.message}`);
      await logCronExecution('pluggy-sync', 'error', { error: error.message });
      return res.status(500).json({ success: false, error: 'query_failed' });
    }

    if (!connections?.length) {
      log.info('no active connections to sync');
      await logCronExecution('pluggy-sync', 'success', { synced: 0 });
      return res.json({ success: true, synced: 0 });
    }

    let synced = 0;
    let ingested = 0;
    const errors = [];

    for (const c of connections) {
      try {
        // 1. Ask Pluggy to refresh (triggers re-auth + fresh transaction pull).
        const updated = await pluggy.triggerSync(c.pluggy_item_id);

        // Update connection status mirror — user sees this in BankConnectionsList.
        await supabaseAdmin
          .from('user_bank_connections')
          .update({
            status: updated?.status || 'UPDATING',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id);

        // 2. Re-seed transactions (idempotent via unique pluggy_transaction_id index).
        // seedItemTransactions fetches last ~90d of transactions across all accounts
        // and upserts them. Safe to run daily — already-ingested rows no-op; missed
        // rows from webhook failures get inserted.
        const result = await seedItemTransactions(c.user_id, c.pluggy_item_id);
        ingested += result?.inserted || 0;
        synced++;
      } catch (err) {
        log.warn(`sync failed for item ${c.pluggy_item_id}: ${err.message}`);
        errors.push({ item: c.pluggy_item_id, error: err.message });
        // Continue — one bad connection must not take down the whole run.
      }
    }

    const duration = Date.now() - startTime;
    log.info(`synced ${synced}/${connections.length} connections, ingested ${ingested} tx, ${errors.length} errors, ${duration}ms`);

    await logCronExecution('pluggy-sync', 'success', {
      synced,
      ingested,
      errors: errors.length,
      duration_ms: duration,
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
    await logCronExecution('pluggy-sync', 'error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'cron_failed',
      ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
    });
  }
});

export default router;
