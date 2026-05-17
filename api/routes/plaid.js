/**
 * Plaid Routes — Financial-Emotional Twin, Phase 4.1 (US coverage)
 * ==================================================================
 * Authenticated endpoints for the frontend Plaid Link flow + lifecycle:
 *   POST /api/plaid/link/token          — issue link_token for the Link SDK
 *   POST /api/plaid/link/exchange       — exchange public_token → access_token + bootstrap
 *   POST /api/plaid/sync/:id            — force-pull cursor sync for one connection
 *   DELETE /api/plaid/connections/:id   — disconnect a Plaid item
 *
 * Connections LIST is shared with Pluggy/TrueLayer — the existing
 * `GET /api/transactions/pluggy/connections` route already returns all
 * providers from user_bank_connections, so no duplicate route is needed
 * here. The frontend reads from that endpoint and dispatches the Connect/
 * Disconnect action to the right provider based on `row.provider`.
 *
 * Webhook endpoint (public, signature-verified) lives separately at
 * api/webhook-plaid.js so it can skip JWT and run as a thin lambda — same
 * pattern as Pluggy/TrueLayer webhooks per server.js mount notes.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { decryptToken } from '../services/encryption.js';
import * as plaid from '../services/transactions/plaidClient.js';
import { bootstrapItem, syncItem } from '../services/transactions/plaidIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('plaid-routes');
const router = express.Router();

router.use(authenticateUser);

if (!plaid.isPlaidConfigured()) {
  log.warn('Plaid disabled: PLAID_CLIENT_ID or PLAID_SECRET unset. /plaid/link/token will return 503.');
}

/**
 * POST /link/token
 * Issue a short-lived (30 min) link_token for the Plaid Link drawer.
 *
 * Body (optional):
 *   {
 *     products?: ['transactions', 'investments', 'liabilities'],
 *     countryCodes?: ['US'],
 *     accessToken?: string   // pass when reconnecting after ITEM_LOGIN_REQUIRED
 *   }
 */
router.post('/link/token', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    if (!plaid.isPlaidConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'bank linking is currently unavailable',
        code: 'PLAID_NOT_CONFIGURED',
      });
    }

    const { products, countryCodes, accessToken } = req.body || {};

    // Reconnect mode: if an accessToken is provided, verify it belongs to
    // this user before passing it to Plaid (prevents one user from minting
    // a Link token scoped to another user's item).
    if (accessToken) {
      const { data: row } = await supabaseAdmin
        .from('user_bank_connections')
        .select('id, plaid_access_token_encrypted')
        .eq('user_id', userId)
        .eq('provider', 'plaid')
        .is('deleted_at', null)
        .not('plaid_access_token_encrypted', 'is', null)
        .maybeSingle();
      if (!row || decryptToken(row.plaid_access_token_encrypted) !== accessToken) {
        return res.status(403).json({ success: false, error: 'access_token does not belong to this user' });
      }
    }

    const result = await plaid.createLinkToken({
      clientUserId: userId,
      products: Array.isArray(products) && products.length ? products : ['transactions'],
      countryCodes: Array.isArray(countryCodes) && countryCodes.length ? countryCodes : ['US'],
      accessToken: accessToken || null,
    });

    return res.json({
      success: true,
      linkToken: result.link_token,
      expiration: result.expiration,
    });
  } catch (err) {
    log.error(`link/token: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'failed to create link token',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /link/exchange
 * Step 2 of the Link flow. Frontend POSTs the public_token from Link's
 * onSuccess callback. Server exchanges it for a permanent access_token,
 * encrypts + stores it, and kicks off the initial transaction sync.
 *
 * Body:
 *   { publicToken: string, metadata?: object } — metadata is what Link
 *   returns alongside (institution name, account list, etc.); we don't
 *   trust it, we fetch the authoritative state from Plaid.
 */
router.post('/link/exchange', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    if (!plaid.isPlaidConfigured()) {
      return res.status(503).json({ success: false, error: 'plaid not configured', code: 'PLAID_NOT_CONFIGURED' });
    }

    const { publicToken } = req.body || {};
    if (!publicToken || typeof publicToken !== 'string') {
      return res.status(400).json({ success: false, error: 'publicToken is required' });
    }

    let exchange;
    try {
      exchange = await plaid.exchangePublicToken(publicToken);
    } catch (plaidErr) {
      if (plaidErr.plaidErrorCode === 'INVALID_PUBLIC_TOKEN') {
        return res.status(400).json({ success: false, error: 'invalid or expired public_token' });
      }
      throw plaidErr;
    }

    const { access_token: accessToken, item_id: plaidItemId } = exchange || {};
    if (!accessToken || !plaidItemId) {
      return res.status(500).json({ success: false, error: 'plaid returned no item_id' });
    }

    // Idempotency: if this item is already connected to a DIFFERENT user,
    // refuse — protects against one user re-linking another user's item.
    const { data: existing } = await supabaseAdmin
      .from('user_bank_connections')
      .select('user_id')
      .eq('plaid_item_id', plaidItemId)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing && existing.user_id && existing.user_id !== userId) {
      log.warn(`link/exchange: item ${plaidItemId} already owned by ${existing.user_id}, refusing claim by ${userId}`);
      return res.status(409).json({ success: false, error: 'this account is already linked to another user' });
    }

    const bootstrap = await bootstrapItem(userId, accessToken, plaidItemId);

    return res.json({
      success: true,
      itemId: plaidItemId,
      inserted: bootstrap.inserted,
    });
  } catch (err) {
    log.error(`link/exchange: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'failed to exchange public_token',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * GET /holdings
 * Investment portfolio snapshot, aggregated across every Plaid item the
 * user has linked. Returns positions joined with the securities lookup so
 * the frontend can render ticker + name + quantity + value + cost basis.
 *
 * Response:
 *   {
 *     success: true,
 *     holdings: [{
 *       institutionName, accountName, accountMask, accountType,
 *       ticker, name, quantity, costBasis, value, currency, gainLoss, gainLossPct,
 *     }, ...],
 *     totalValue,
 *     totalCost,
 *     totalGainLoss,
 *     currency,        // the dominant currency across positions
 *     itemsScanned,
 *     itemsWithError,  // items where /investments/holdings/get failed (Plaid investments product not enabled, etc.)
 *   }
 *
 * Errors per-item are non-fatal — a failed Plaid call for one institution
 * doesn't sink the whole response. The UI surfaces the count.
 */
router.get('/holdings', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    if (!plaid.isPlaidConfigured()) {
      return res.status(503).json({ success: false, error: 'plaid not configured', code: 'PLAID_NOT_CONFIGURED' });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, plaid_item_id, plaid_access_token_encrypted, connector_name')
      .eq('user_id', userId)
      .eq('provider', 'plaid')
      .is('deleted_at', null)
      .not('plaid_access_token_encrypted', 'is', null);
    if (error) throw new Error(error.message);

    if (!rows?.length) {
      return res.json({
        success: true,
        holdings: [],
        totalValue: 0,
        totalCost: 0,
        totalGainLoss: 0,
        currency: 'USD',
        itemsScanned: 0,
        itemsWithError: 0,
      });
    }

    const holdings = [];
    let totalValue = 0;
    let totalCost = 0;
    let itemsWithError = 0;
    const currencyTally = new Map();

    for (const row of rows) {
      let accessToken;
      try { accessToken = decryptToken(row.plaid_access_token_encrypted); }
      catch { itemsWithError++; continue; }

      let resp;
      try {
        resp = await plaid.getInvestmentHoldings(accessToken);
      } catch (err) {
        // Most common cause: this item wasn't linked with the 'investments'
        // product (we default link_token to 'transactions' only). Non-fatal.
        log.info(`holdings for ${row.plaid_item_id} unavailable: ${err.plaidErrorCode || err.message}`);
        itemsWithError++;
        continue;
      }

      const accountIndex = new Map((resp.accounts || []).map((a) => [a.account_id, a]));
      const secIndex = new Map((resp.securities || []).map((s) => [s.security_id, s]));

      for (const h of resp.holdings || []) {
        const acc = accountIndex.get(h.account_id);
        const sec = secIndex.get(h.security_id);
        if (!sec) continue; // stale id — skip rather than render "unknown"

        const quantity = Number(h.quantity) || 0;
        const value = Number(h.institution_value) || (quantity * (Number(h.institution_price) || 0));
        const costBasis = Number(h.cost_basis) || 0;
        const ccy = h.iso_currency_code || h.unofficial_currency_code || acc?.balances?.iso_currency_code || 'USD';
        const gainLoss = costBasis > 0 ? value - costBasis : 0;
        const gainLossPct = costBasis > 0 ? (value - costBasis) / costBasis : 0;

        holdings.push({
          institutionName: row.connector_name,
          accountId: h.account_id,
          accountName: acc?.name || acc?.official_name || 'Brokerage',
          accountMask: acc?.mask || null,
          accountType: acc?.subtype || acc?.type || 'brokerage',
          ticker: sec.ticker_symbol || null,
          name: sec.name || sec.ticker_symbol || 'Unknown security',
          type: sec.type || null,
          quantity,
          institutionPrice: Number(h.institution_price) || null,
          costBasis,
          value,
          currency: ccy,
          gainLoss,
          gainLossPct,
        });

        totalValue += value;
        totalCost += costBasis;
        currencyTally.set(ccy, (currencyTally.get(ccy) || 0) + value);
      }
    }

    // Dominant currency for the summary — whichever holds the most value.
    let dominantCcy = 'USD';
    let maxV = -1;
    for (const [c, v] of currencyTally.entries()) {
      if (v > maxV) { maxV = v; dominantCcy = c; }
    }

    // Sort positions: highest value first.
    holdings.sort((a, b) => b.value - a.value);

    return res.json({
      success: true,
      holdings,
      totalValue,
      totalCost,
      totalGainLoss: totalValue - totalCost,
      currency: dominantCcy,
      itemsScanned: rows.length,
      itemsWithError,
    });
  } catch (err) {
    log.error(`holdings: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to fetch holdings' });
  }
});

/**
 * GET /investment-activity
 * Recent investment events (buys / sells / dividends / fees) joined with
 * the emotional-context fingerprint already computed by the Phase 2 tagger.
 * This is the moat surface: each row carries the Whoop recovery score, the
 * music valence at the time, and the calendar load — context ChatGPT's
 * spending dashboard literally cannot show.
 *
 * Response:
 *   {
 *     success: true,
 *     events: [{
 *       id, ticker, name, type, quantity, amount, currency, transactionDate,
 *       emotionalContext: { recoveryScore, musicValence, calendarLoad, computedStressScore, emotionLabel } | null,
 *     }, ...],
 *     range: { since, limit },
 *   }
 */
router.get('/investment-activity', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '30'), 10) || 30, 1), 100);
    const sinceDays = Math.min(Math.max(parseInt(String(req.query.sinceDays ?? '90'), 10) || 90, 7), 730);
    const sinceDate = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);

    const { data, error } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        id, amount, currency, merchant_normalized, merchant_raw, category, transaction_date,
        plaid_account_id,
        emotional_context:transaction_emotional_context (
          recovery_score, music_valence, calendar_load, computed_stress_score, sleep_score
        )
      `)
      .eq('user_id', userId)
      .eq('account_type', 'investment')
      .eq('source_bank', 'plaid')
      .gte('transaction_date', sinceDate)
      .order('transaction_date', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const events = (data || []).map((r) => {
      const ec = r.emotional_context;
      // Derive a friendly label from the strongest signal so the UI can show
      // "low recovery (38%)" / "high stress (72%)" without re-deriving in JS.
      let emotionLabel = null;
      if (ec?.computed_stress_score != null && ec.computed_stress_score >= 0.6) {
        emotionLabel = `high stress (${Math.round(ec.computed_stress_score * 100)}%)`;
      } else if (ec?.recovery_score != null && ec.recovery_score < 50) {
        emotionLabel = `low recovery (${Math.round(ec.recovery_score)}%)`;
      } else if (ec?.recovery_score != null && ec.recovery_score >= 75) {
        emotionLabel = `high recovery (${Math.round(ec.recovery_score)}%)`;
      }

      // Parse the category prefix back into a clean type
      const rawType = r.category?.replace(/^investment_/, '') || 'unknown';
      const [typeMain] = rawType.split('_');

      return {
        id: r.id,
        ticker: r.merchant_normalized,
        name: r.merchant_raw,
        type: typeMain,                          // buy | sell | cash | fee | dividend | transfer
        rawCategory: r.category,                 // full category for advanced filtering
        amount: Number(r.amount) || 0,
        currency: r.currency || 'USD',
        transactionDate: r.transaction_date,
        emotionalContext: ec
          ? {
              recoveryScore: ec.recovery_score,
              musicValence: ec.music_valence,
              calendarLoad: ec.calendar_load,
              sleepScore: ec.sleep_score,
              computedStressScore: ec.computed_stress_score,
              emotionLabel,
            }
          : null,
      };
    });

    return res.json({ success: true, events, range: { since: sinceDate, limit } });
  } catch (err) {
    log.error(`investment-activity: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to fetch investment activity' });
  }
});

/**
 * POST /sync/:id
 * Force a fresh cursor-based sync on a single connection. The webhook
 * normally drives this — this route is the "Refresh" button + the cron's
 * fallback path.
 *
 * :id is the user_bank_connections.id (our row UUID), not the Plaid item_id.
 */
router.post('/sync/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, plaid_item_id, provider')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.provider !== 'plaid') {
      return res.status(404).json({ success: false, error: 'plaid connection not found' });
    }

    const result = await syncItem(null, row.plaid_item_id, { allowNudge: true });
    return res.json({ success: true, inserted: result.inserted, pages: result.pages });
  } catch (err) {
    log.error(`sync: ${err.message}`);
    return res.status(500).json({ success: false, error: 'sync failed' });
  }
});

/**
 * DELETE /connections/:id
 * Disconnect a Plaid item. Revokes the access_token on Plaid's side, then
 * soft-deletes our row so historical transactions remain attached.
 *
 * Provider-aware: refuses to act on non-plaid rows so the generic
 * disconnect route on /api/transactions/pluggy/connections/:id can keep
 * owning the Pluggy/TrueLayer paths.
 */
router.delete('/connections/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, plaid_item_id, plaid_access_token_encrypted')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.provider !== 'plaid') {
      return res.status(404).json({ success: false, error: 'plaid connection not found' });
    }

    if (row.plaid_access_token_encrypted) {
      try {
        const accessToken = decryptToken(row.plaid_access_token_encrypted);
        await plaid.removeItem(accessToken);
      } catch (revokeErr) {
        // Non-fatal — local soft-delete must always succeed even if Plaid
        // can't be reached. Mirrors the Pluggy disconnect path.
        log.warn(`plaid removeItem failed for ${row.plaid_item_id}: ${revokeErr.message}`);
      }
    }

    await supabaseAdmin
      .from('user_bank_connections')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'DELETED',
        // Wipe the encrypted token after Plaid-side revoke so a future
        // compromise of our DB can't replay it (Plaid permanent tokens
        // would otherwise still work).
        plaid_access_token_encrypted: null,
      })
      .eq('id', id);

    return res.json({ success: true });
  } catch (err) {
    log.error(`delete plaid connection: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to disconnect' });
  }
});

export default router;
