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
 * List the current user's active bank connections. Used by BankConnectionsPage.
 */
router.get('/connections', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, connector_name, status, status_detail, last_synced_at, consent_expires_at, created_at')
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
 * Disconnect a bank. Calls Pluggy DELETE + soft-deletes our row so historical
 * transactions stay attached to the user.
 */
router.delete('/connections/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, pluggy_item_id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.status(404).json({ success: false, error: 'connection not found' });

    try {
      await pluggy.deleteItem(row.pluggy_item_id);
    } catch (err) {
      // Log but don't fail — our soft-delete should still proceed so the user isn't stuck.
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
 * Force a fresh pull on an item. Triggers Pluggy's internal sync; new transactions
 * will arrive via webhook shortly after. Returns the item's updated status.
 */
router.post('/sync/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, pluggy_item_id')
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
