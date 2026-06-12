/**
 * Pluggy Routes — Financial-Emotional Twin, Phase 3.1
 * ======================================================
 * Authenticated endpoints for the frontend:
 *   POST /api/transactions/pluggy/connect-token     — widget auth
 *   GET  /api/transactions/pluggy/connections       — list user's banks
 *   DELETE /api/transactions/pluggy/connections/:id — disconnect a bank
 *   POST /api/transactions/pluggy/sync/:id          — force refresh
 *
 * Webhook endpoint (public, header-secret gate) lives separately in
 * routes/pluggy-webhook.js so it can skip the JWT middleware cleanly.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import * as pluggy from '../services/transactions/pluggyClient.js';
import { upsertConnectionFromItem, seedItemTransactions } from '../services/transactions/pluggyIngestion.js';
import { getPlaidSandboxState, isSandboxConnection } from '../services/transactions/sandboxGuard.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('pluggy-routes');
const router = express.Router();

router.use(authenticateUser);

// audit-2026-05-08 C1: emit one warn line at module-init if creds are missing
// so engineers don't waste time chasing a silent 500. Idempotent — env reads
// only.
if (!pluggy.isPluggyConfigured()) {
  log.warn('Pluggy disabled: PLUGGY_CLIENT_ID or PLUGGY_CLIENT_SECRET unset. /pluggy/connect-token will return 503.');
}

/**
 * POST /connect-token
 * Returns a 30-min connect_token the widget uses to authenticate the user
 * against their chosen bank. `clientUserId` is echoed on every webhook so
 * we can route events back to the right user.
 *
 * Body (optional):
 *   { itemId: string } — when reconnecting/updating an existing item (MFA)
 */
router.post('/connect-token', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    // audit-2026-05-08 C1: short-circuit when credentials are missing — return
    // 503 + a stable code so the FE can render a "feature unavailable" hint
    // instead of a generic "failed to create connect token" error.
    if (!pluggy.isPluggyConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'bank linking is currently unavailable',
        code: 'PLUGGY_NOT_CONFIGURED',
      });
    }

    const { itemId = null } = req.body || {};

    // If reconnecting, verify the item belongs to this user.
    if (itemId) {
      const { data: row, error } = await supabaseAdmin
        .from('user_bank_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('pluggy_item_id', itemId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) log.warn(`ownership check: ${error.message}`);
      if (!row) {
        return res.status(404).json({ success: false, error: 'item not found' });
      }
    }

    const tokenRes = await pluggy.createConnectToken({ clientUserId: userId, itemId });
    return res.json({
      success: true,
      connectToken: tokenRes?.accessToken,
      environment: process.env.PLUGGY_ENV || 'sandbox',
    });
  } catch (err) {
    // audit-2026-05-08 C1: a thrown PLUGGY_NOT_CONFIGURED (e.g. envs went
    // missing mid-runtime) should still surface as 503, not 500.
    if (err?.code === 'PLUGGY_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        error: 'bank linking is currently unavailable',
        code: 'PLUGGY_NOT_CONFIGURED',
      });
    }
    log.error(`connect-token failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'failed to create connect token',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * GET /connections
 * List the current user's active bank connections. Provider-agnostic — returns
 * every user_bank_connections row (Pluggy BR + Plaid US) so the single
 * BankConnectionsList UI can render them together.
 */
router.get('/connections', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, connector_name, status, status_detail, last_synced_at, consent_expires_at, created_at, plaid_institution_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    // replan-2026-06-10 Track D P0: never show a Plaid sandbox item ("First
    // Platypus Bank · CONNECTED") as a real bank in production runtimes — the
    // FE must fall through to its connect/empty state instead. Stored
    // is_sandbox flags arrive via getPlaidSandboxState (which tolerates the
    // column not existing yet); the institution-id check covers the rest.
    const sandbox = await getPlaidSandboxState(userId);
    const visible = sandbox.hideActive
      ? (data || []).filter((row) => !sandbox.sandboxConnectionIds.has(row.id) && !isSandboxConnection(row))
      : (data || []);
    const connections = visible.map(({ plaid_institution_id: _pi, ...row }) => row);

    return res.json({ success: true, connections });
  } catch (err) {
    log.error(`list connections: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to list connections' });
  }
});

/**
 * DELETE /connections/:id
 * Disconnect a bank: revoke on Pluggy's side, then soft-delete our row so
 * historical transactions stay attached to the user.
 *
 * Provider revoke errors are logged but not fatal — local soft-delete must
 * always succeed so the user isn't stuck with a phantom connection.
 *
 * TrueLayer was deleted in replan-2026-06-10 Track D (never configured, zero
 * rows in prod). The truelayer_* columns on user_bank_connections and
 * user_transactions are intentionally KEPT in the DB — no migration.
 */
router.delete('/connections/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, pluggy_item_id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.status(404).json({ success: false, error: 'connection not found' });

    // Pluggy revoke (also handles legacy rows with no provider set)
    try {
      await pluggy.deleteItem(row.pluggy_item_id);
    } catch (err) {
      log.warn(`pluggy delete failed for ${row.pluggy_item_id}: ${err.message}`);
    }

    await supabaseAdmin
      .from('user_bank_connections')
      .update({ deleted_at: new Date().toISOString(), status: 'DELETED' })
      .eq('id', id);

    return res.json({ success: true });
  } catch (err) {
    log.error(`delete connection: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to disconnect' });
  }
});

/**
 * POST /sync/:id
 * Force a fresh pull on a Pluggy connection: triggers Pluggy's PATCH
 * /items/:id (new tx arrive via webhook).
 */
/**
 * POST /register
 *
 * Webhook-delivery fallback: after the Connect Widget reports success on
 * the frontend, the client POSTs the item id here. We then run the same
 * ingestion path the webhook runs in production:
 *   1. Fetch the item from Pluggy (authoritative status + connector info)
 *   2. Verify the item's clientUserId matches the authed user
 *      (prevents one user from claiming another user's items)
 *   3. Upsert user_bank_connections
 *   4. Seed the last 90 days of transactions
 *
 * Why this exists:
 *   - Local dev: Pluggy can't deliver webhooks to localhost. Without this,
 *     a sandbox link via the widget never produces a DB row.
 *   - Production: webhook delivery isn't 100%. This is the resilience
 *     path — idempotent, so calling it after a webhook already arrived
 *     is a no-op.
 *
 * Body: { itemId: string }
 */
router.post('/register', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    if (!pluggy.isPluggyConfigured()) {
      return res.status(503).json({ success: false, error: 'pluggy not configured', code: 'PLUGGY_NOT_CONFIGURED' });
    }

    const { itemId } = req.body || {};
    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ success: false, error: 'itemId is required' });
    }

    let item;
    try {
      item = await pluggy.getItem(itemId);
    } catch (pluggyErr) {
      // Pluggy returns 400 for malformed UUIDs and 404 for unknown items.
      // Surface those as user-fixable 4xx instead of swallowing into 500.
      if (pluggyErr?.status === 400) {
        return res.status(400).json({ success: false, error: 'invalid itemId format' });
      }
      if (pluggyErr?.status === 404) {
        return res.status(404).json({ success: false, error: 'item not found in pluggy' });
      }
      throw pluggyErr;
    }
    if (!item?.id) {
      return res.status(404).json({ success: false, error: 'item not found in pluggy' });
    }

    // Ownership: Pluggy echoes the clientUserId we passed at connect_token creation.
    // audit-2026-05-23 M1: previously the check was `if (itemUserId && itemUserId !== userId)`,
    // which fell open when clientUserId was null/undefined (which Pluggy sandbox
    // occasionally returns). An authed user could then claim ANY itemId they could
    // guess by hitting /register. We now refuse claims with a null clientUserId
    // UNLESS we already own the row locally (handles legacy items predating the
    // strict requirement — zero such rows exist in prod today, but the carve-out
    // means a future backfill is safe).
    const itemUserId = item.clientUserId;
    if (!itemUserId) {
      const { data: existing } = await supabaseAdmin
        .from('user_bank_connections')
        .select('id')
        .eq('pluggy_item_id', itemId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!existing) {
        log.warn(`register: itemId ${itemId} has null clientUserId; refusing claim by user=${userId}`);
        return res.status(403).json({ success: false, error: 'cannot verify item ownership' });
      }
    } else if (itemUserId !== userId) {
      log.warn(`register: itemId ${itemId} clientUserId=${itemUserId} but auth user=${userId}`);
      return res.status(403).json({ success: false, error: 'item belongs to a different user' });
    }

    await upsertConnectionFromItem(userId, item);

    // Best-effort seed; non-fatal if it fails (cron-pluggy-sync runs daily as backup)
    let seededCount = null;
    try {
      const seed = await seedItemTransactions(userId, itemId);
      seededCount = seed?.inserted ?? null;
    } catch (seedErr) {
      log.warn(`seed transactions for ${itemId} failed (non-fatal): ${seedErr.message}`);
    }

    // Return the freshly-created/updated connection row so the FE can update its list
    const { data: row } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, connector_name, status, last_synced_at, pluggy_item_id, provider')
      .eq('pluggy_item_id', itemId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    return res.json({ success: true, connection: row, seededTransactions: seededCount });
  } catch (err) {
    log.error(`register failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'failed to register item',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

router.post('/sync/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, pluggy_item_id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.status(404).json({ success: false, error: 'connection not found' });

    const updated = await pluggy.triggerSync(row.pluggy_item_id);

    await supabaseAdmin
      .from('user_bank_connections')
      .update({ status: updated?.status || 'UPDATING', updated_at: new Date().toISOString() })
      .eq('id', id);

    return res.json({ success: true, status: updated?.status });
  } catch (err) {
    log.error(`sync: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to trigger sync' });
  }
});

export default router;
