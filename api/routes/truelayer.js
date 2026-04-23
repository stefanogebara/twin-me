/**
 * TrueLayer Routes — Phase 4
 * =============================
 * Authenticated endpoints for the OAuth-redirect-based bank connect flow.
 *
 * Flow:
 *   1. Frontend → POST /auth-url → returns TrueLayer authorization URL +
 *      signed state to redirect the user to.
 *   2. User consents at TrueLayer → TL redirects to /callback?code=...&state=...
 *   3. /callback exchanges code for tokens, stores encrypted refresh token,
 *      calls seedUserConnection() to backfill 24 months.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import * as tl from '../services/transactions/trueLayerClient.js';
import { encryptToken, encryptState, decryptState } from '../services/encryption.js';
import { seedUserConnection, syncUserConnection } from '../services/transactions/trueLayerIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('truelayer-routes');
const router = express.Router();

// Tight per-IP limiter for the unauthenticated callback. A legitimate flow
// fires exactly once per user connection; anything above 5 in 15min is abuse.
// The callback holds a 55s Vercel function for seedUserConnection — without
// this cap an attacker could burn GB-s quickly.
const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

function redirectUriForEnv() {
  const base = process.env.VITE_APP_URL || 'https://twinme.me';
  return `${base.replace(/\/$/, '')}/api/truelayer/callback`;
}

/**
 * POST /auth-url — build the TL authorization URL, sign state (userId + nonce).
 * Auth required so state is bound to a real user.
 */
router.post('/auth-url', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { providers } = req.body || {};
    const nonce = crypto.randomBytes(12).toString('hex');
    const state = encryptState({ userId, nonce, t: Date.now() }, 'truelayer');
    const url = tl.buildAuthUrl({
      state,
      redirectUri: redirectUriForEnv(),
      providers, // pass-through, defaults to ES+UK in client
    });
    return res.json({ success: true, authUrl: url });
  } catch (err) {
    log.error(`auth-url: ${err.message}`);
    return res.status(500).json({ success: false, error: 'failed to build auth url' });
  }
});

/**
 * GET /callback — TrueLayer redirects here after user consent. Exchanges the
 * code, persists the connection, kicks off the seed backfill.
 * No JWT middleware — the state cookie/param carries identity.
 */
router.get('/callback', callbackLimiter, async (req, res) => {
  const { code, state, error } = req.query || {};
  if (error) {
    log.warn(`callback error: ${error}`);
    return res.redirect('/money?truelayer_error=' + encodeURIComponent(String(error)));
  }
  if (!code || !state) {
    return res.redirect('/money?truelayer_error=missing_params');
  }
  try {
    const decoded = decryptState(String(state), true);
    if (!decoded?.userId) throw new Error('invalid state');
    // Reject states older than 15 minutes.
    if (Date.now() - (decoded.t || 0) > 15 * 60_000) throw new Error('state expired');

    const tokens = await tl.exchangeCode({ code: String(code), redirectUri: redirectUriForEnv() });
    const encRefresh = encryptToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + (tokens.expiresIn - 60) * 1000).toISOString();

    // Fetch metadata to populate connector name + credentials id.
    const meta = await tl.getMetadata(tokens.accessToken).catch(() => null);
    const connectorName = meta?.results?.[0]?.provider?.display_name || 'Bank';
    const credentialsId = meta?.results?.[0]?.credentials_id || null;

    const { data: inserted, error: dbErr } = await supabaseAdmin
      .from('user_bank_connections')
      .insert({
        user_id: decoded.userId,
        provider: 'truelayer',
        pluggy_item_id: `tl:${credentialsId || crypto.randomUUID()}`, // reuse unique index; prefix to avoid collision
        connector_id: 0,
        connector_name: connectorName,
        status: 'UPDATING',
        truelayer_credentials_id: credentialsId,
        refresh_token_encrypted: encRefresh,
        access_token_expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (dbErr) throw new Error(`insert connection: ${dbErr.message}`);

    // Fire-and-forget: seed in the background. On Vercel this will only run
    // if we await. For safety, await — Pluggy's retry pattern doesn't apply
    // here since there's no external retry driver. Timeout budget is 60s.
    try {
      await seedUserConnection(inserted.id);
    } catch (seedErr) {
      log.warn(`seed failed (will show as UPDATING until sync cron): ${seedErr.message}`);
    }

    return res.redirect('/money?truelayer_connected=1');
  } catch (err) {
    log.error(`callback: ${err.message}`);
    return res.redirect('/money?truelayer_error=' + encodeURIComponent(err.message));
  }
});

/**
 * POST /sync/:id — force refresh a single connection.
 */
router.post('/sync/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { data: row, error } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('provider', 'truelayer')
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.status(404).json({ success: false, error: 'not found' });

    const result = await syncUserConnection(id);
    return res.json({ success: true, ...result });
  } catch (err) {
    log.error(`sync: ${err.message}`);
    return res.status(500).json({ success: false, error: 'sync failed' });
  }
});

export default router;
