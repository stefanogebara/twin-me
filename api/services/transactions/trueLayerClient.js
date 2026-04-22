/**
 * TrueLayer API Client — EU/UK Open Banking (PSD2 AISP), Phase 4
 * =================================================================
 * Thin HTTP wrapper over TrueLayer's Data API. Mirrors the pluggyClient.js
 * shape so pluggyIngestion.js and trueLayerIngestion.js share DNA.
 *
 * Auth model:
 *   OAuth 2.0 authorization code flow (NOT an embedded widget like Pluggy).
 *   User redirects to TrueLayer's hosted auth page → picks bank → consents →
 *   redirects back with ?code=...&state=... . We exchange the code for
 *   access_token (1h) + refresh_token (long-lived) and store the refresh
 *   token encrypted in user_bank_connections.
 *
 * Two base URLs:
 *   - Production: https://api.truelayer.com  +  https://auth.truelayer.com
 *   - Sandbox:    https://api.truelayer-sandbox.com  +  https://auth.truelayer-sandbox.com
 *
 * Webhook signing: TrueLayer uses JWKS-based RSA signing (unlike Pluggy's
 * shared-header secret). Signature verification lives in the webhook
 * endpoint module, not here.
 */

import { encryptToken, decryptToken } from '../encryption.js';
import { createLogger } from '../logger.js';

const log = createLogger('truelayer-client');

const DEFAULT_TIMEOUT_MS = 15_000;

// Core scope — what we need for Data API.
// direct_debits + standing_orders are UK-only and sandbox-iffy; drop until
// we're in prod with explicit UK opt-in. offline_access is required for
// refresh-token rotation.
const SCOPE = 'info accounts balance transactions cards offline_access';

function assertCredentials() {
  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}

function bases() {
  const env = (process.env.TRUELAYER_ENV || 'sandbox').toLowerCase();
  if (env === 'production') {
    return { api: 'https://api.truelayer.com', auth: 'https://auth.truelayer.com' };
  }
  return { api: 'https://api.truelayer-sandbox.com', auth: 'https://auth.truelayer-sandbox.com' };
}

async function httpRequest(url, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, isForm = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const finalHeaders = {
      Accept: 'application/json',
      ...headers,
    };
    if (body && !isForm) finalHeaders['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

    if (!res.ok) {
      const err = new Error(`truelayer ${method} ${url}: ${res.status} ${text.slice(0, 300)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function httpWithRetry(url, opts = {}, { retries = 2, backoffMs = 300 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpRequest(url, opts);
    } catch (err) {
      lastErr = err;
      const status = err.status || 0;
      const retryable = status === 0 || status >= 500 || status === 429;
      if (!retryable || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/* -------------------------------------------------------------------------- */
/* Public helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Build the authorization URL the frontend redirects the user to.
 * Providers is a space-separated list of TL provider ids (e.g.
 * 'es-santander uk-oauth-all uk-ob-all'). Default covers our Phase 4 scope:
 * Spain regulated banks + UK Open Banking + UK OAuth (Revolut).
 */
export function buildAuthUrl({ state, redirectUri, providers }) {
  const { clientId } = assertCredentials();
  const { auth } = bases();
  const isSandbox = (process.env.TRUELAYER_ENV || 'sandbox') !== 'production';
  // Sandbox only supports the mock universal provider; real provider IDs
  // (es-santander-ob, uk-ob-barclays, revolut-ob-revolut, etc.) are gated
  // to the production environment.
  // Sandbox mock bank: providers=mock (per TL docs). Credentials: john/doe.
  // Production covers UK Open Banking + UK OAuth + major EU countries.
  const defaultProviders = isSandbox
    ? 'mock'
    : 'uk-ob-all uk-oauth-all es-santander-ob ro-ob-all fr-ob-all de-ob-all';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: redirectUri,
    providers: providers || defaultProviders,
    state,
    enable_mock: isSandbox ? 'true' : 'false',
  });
  return `${auth}/?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Called from the OAuth callback route.
 */
export async function exchangeCode({ code, redirectUri }) {
  const { clientId, clientSecret } = assertCredentials();
  const { auth } = bases();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  }).toString();

  const json = await httpRequest(`${auth}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    isForm: true,
  });

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: Number(json.expires_in) || 3600,
  };
}

/**
 * Refresh an access token using a stored (decrypted) refresh token.
 */
export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = assertCredentials();
  const { auth } = bases();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }).toString();

  const json = await httpRequest(`${auth}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    isForm: true,
  });

  return {
    accessToken: json.access_token,
    // TrueLayer may or may not rotate the refresh token; fall back to the old one
    refreshToken: json.refresh_token || refreshToken,
    expiresIn: Number(json.expires_in) || 3600,
  };
}

/**
 * Helper: given a user_bank_connections row for a TrueLayer connection,
 * return a valid access token (refreshing if needed). Returns { accessToken,
 * newEncryptedRefresh?, newExpiresAt? } so the caller can persist updates.
 */
export async function getValidAccessToken(connectionRow) {
  if (!connectionRow?.refresh_token_encrypted) {
    throw new Error('no refresh token for connection');
  }
  const refresh = decryptToken(connectionRow.refresh_token_encrypted);
  // If access_token_expires_at is null or in the past, refresh now.
  // TrueLayer access tokens are 1h; we don't cache them in-memory across
  // invocations (lambda cold-starts make that unreliable) — instead we refresh
  // on every ingestion call. The cost is negligible (one extra POST).
  const { accessToken, refreshToken, expiresIn } = await refreshAccessToken(refresh);
  const newExpiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
  const newEncryptedRefresh = refreshToken !== refresh ? encryptToken(refreshToken) : null;
  return { accessToken, newEncryptedRefresh, newExpiresAt };
}

/**
 * Fetch accounts for the authed user.
 */
export async function getAccounts(accessToken) {
  const { api } = bases();
  return httpWithRetry(`${api}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Fetch the credential-holder metadata (needed to populate credentials_id,
 * bank name, consent expiry on our connection row).
 */
export async function getMetadata(accessToken) {
  const { api } = bases();
  return httpWithRetry(`${api}/data/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Fetch transactions for an account over a date range.
 * TrueLayer returns the full list in one call; paginates internally for
 * very large ranges but most accounts stay under a few hundred tx.
 */
export async function getAccountTransactions(accessToken, accountId, { from, to } = {}) {
  const { api } = bases();
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  return httpWithRetry(`${api}/data/v1/accounts/${encodeURIComponent(accountId)}/transactions${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Credit cards expose the same semantic transactions but on a separate endpoint.
 */
export async function getCards(accessToken) {
  const { api } = bases();
  return httpWithRetry(`${api}/data/v1/cards`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getCardTransactions(accessToken, cardId, { from, to } = {}) {
  const { api } = bases();
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  return httpWithRetry(`${api}/data/v1/cards/${encodeURIComponent(cardId)}/transactions${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Revoke the user's consent on TrueLayer side (cleanup on disconnect).
 * Idempotent on 404.
 */
export async function revokeToken(accessToken) {
  const { auth } = bases();
  const body = new URLSearchParams({
    token: accessToken,
  }).toString();

  try {
    const { clientId, clientSecret } = assertCredentials();
    await httpRequest(`${auth}/api/delete`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    void clientId; void clientSecret; void body; // reserved for future POST-variant revoke
    return { revoked: true };
  } catch (err) {
    if (err.status === 404 || err.status === 401) return { revoked: false, reason: 'already_gone' };
    throw err;
  }
}
