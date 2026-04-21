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
import * as tl from '../services/transactions/trueLayerClient.js';
import { decryptToken } from '../services/encryption.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('pluggy-routes');
const router = express.Router();

router.use(authenticateUser);

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
 * both Pluggy (BR) and TrueLayer (EU/UK) rows so the single BankConnectionsList
 * UI can render them together.
 */
router.get('/connections', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, connector_name, status, status_detail, last_synced_at, consent_expires_at, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ success: true, connections: data || [] });
  } catch (err) {
    log.error(`list connections: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to list connections' });
  }
});

/**
 * DELETE /connections/:id
 * Disconnect a bank. Dispatches to the right provider's revoke API based on
 * the row's provider field (pluggy or truelayer), then soft-deletes our row
 * so historical transactions stay attached to the user.
 *
 * Provider revoke errors are logged but not fatal — local soft-delete must
 * always succeed so the user isn't stuck with a phantom connection.
 */
router.delete('/connections/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, pluggy_item_id, truelayer_credentials_id, refresh_token_encrypted')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.status(404).json({ success: false, error: 'connection not found' });

    if (row.provider === 'truelayer') {
      try {
        if (row.refresh_token_encrypted) {
          const refresh = decryptToken(row.refresh_token_encrypted);
          const { accessToken } = await tl.refreshAccessToken(refresh);
          await tl.revokeToken(accessToken);
        }
      } catch (err) {
        log.warn(`truelayer revoke failed for ${row.truelayer_credentials_id}: ${err.message}`);
      }
    } else {
      // Default: Pluggy (existing behaviour, also handles legacy rows with no provider set)
      try {
        await pluggy.deleteItem(row.pluggy_item_id);
      } catch (err) {
        log.warn(`pluggy delete failed for ${row.pluggy_item_id}: ${err.message}`);
      }
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
 * Force a fresh pull on a connection. Dispatches on the row's provider field:
 *   - pluggy: triggers Pluggy's PATCH /items/:id (new tx arrive via webhook)
 *   - truelayer: /api/truelayer/sync/:id owns the pull-side refresh path;
 *     here we return a redirect hint so the frontend can call that instead.
 */
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

    if (row.provider === 'truelayer') {
      // Frontend should be calling /api/truelayer/sync/:id directly — this is a
      // safety net for legacy clients.
      return res.status(400).json({ success: false, error: 'use /api/truelayer/sync/:id for TrueLayer connections' });
    }

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
