/**
 * Pluggy API Client — Financial-Emotional Twin, Phase 3.1
 * =========================================================
 * Thin HTTP wrapper around the Pluggy REST API (https://api.pluggy.ai).
 * Plain fetch — no SDK — to avoid dragging heavy transitive deps into the Vercel
 * serverless cold-start (same reason we lazy-load ofx-data-extractor in ofxParser.js).
 *
 * Auth model:
 *   - CLIENT_ID + CLIENT_SECRET → POST /auth → apiKey (2h TTL)
 *   - apiKey cached in module-scope, refreshed eagerly on 401
 *   - connect_token (30min TTL) is generated per-user on-demand and consumed by the widget
 *
 * Never import this file in top-level routes that must cold-start fast — it's fine here
 * because all exports are async and fetch is standard-library.
 */

import { createLogger } from '../logger.js';

const log = createLogger('pluggy-client');

const PLUGGY_BASE_URL = 'https://api.pluggy.ai';
const API_KEY_CACHE_MS = 90 * 60 * 1000; // 90min, 30min buffer vs Pluggy's 2h TTL
const DEFAULT_TIMEOUT_MS = 15_000;

// Module-scoped cache. Multiple requests inside the same lambda share it.
let cachedApiKey = null;
let cachedApiKeyExpiresAt = 0;

function assertCredentials() {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}

/**
 * Low-level HTTP call with timeout + basic retry on 5xx/network errors.
 * Does NOT handle 401 retries — getApiKey() owns that.
 */
async function httpRequest(path, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = `${PLUGGY_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response — surface raw text in error
    }

    if (!res.ok) {
      const err = new Error(`pluggy ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function httpWithRetry(path, opts = {}, { retries = 2, backoffMs = 300 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpRequest(path, opts);
    } catch (err) {
      lastErr = err;
      // Don't retry 4xx (except 429). Pluggy retries happen on network + 5xx + rate limit.
      const status = err.status || 0;
      const retryable = status === 0 || status >= 500 || status === 429;
      if (!retryable || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Get a valid apiKey. Refreshes automatically when stale.
 * Called internally by every authenticated endpoint helper.
 */
export async function getApiKey({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedApiKey && now < cachedApiKeyExpiresAt) {
    return cachedApiKey;
  }

  const { clientId, clientSecret } = assertCredentials();

  const res = await httpRequest('/auth', {
    method: 'POST',
    body: { clientId, clientSecret },
  });

  if (!res?.apiKey) {
    throw new Error(`pluggy /auth returned no apiKey: ${JSON.stringify(res)}`);
  }

  cachedApiKey = res.apiKey;
  cachedApiKeyExpiresAt = now + API_KEY_CACHE_MS;
  log.info('refreshed apiKey');
  return cachedApiKey;
}

/**
 * Authenticated call wrapper. Handles 401 by refreshing apiKey exactly once.
 */
async function authedRequest(path, opts = {}) {
  let apiKey = await getApiKey();
  const call = (key) =>
    httpWithRetry(path, {
      ...opts,
      headers: { 'X-API-KEY': key, ...(opts.headers || {}) },
    });

  try {
    return await call(apiKey);
  } catch (err) {
    if (err.status === 401) {
      log.warn('apiKey rejected, refreshing and retrying once');
      apiKey = await getApiKey({ forceRefresh: true });
      return await call(apiKey);
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Public helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Create a short-lived connect_token for the frontend widget.
 * - clientUserId: our internal user UUID — Pluggy echoes it on every webhook
 * - itemId: pass when user is reconnecting/updating an existing item (MFA flow)
 * Returns the raw response; useful fields: { accessToken } (the connect token)
 */
export async function createConnectToken({ clientUserId, itemId = null, options = {} }) {
  if (!clientUserId) throw new Error('clientUserId is required');

  const body = { clientUserId, options };
  if (itemId) body.itemId = itemId;

  return authedRequest('/connect_token', { method: 'POST', body });
}

/**
 * Fetch an item (connection) by id — status, connector, last execution, consent.
 */
export async function getItem(pluggyItemId) {
  return authedRequest(`/items/${pluggyItemId}`);
}

/**
 * List all bank accounts under an item (checking + credit cards + savings).
 */
export async function getAccounts(pluggyItemId) {
  return authedRequest(`/accounts?itemId=${encodeURIComponent(pluggyItemId)}`);
}

/**
 * Fetch transactions for a single account over a date range.
 * Pluggy's API paginates; this helper walks pages until total is reached.
 */
export async function getTransactions(pluggyAccountId, { from, to, pageSize = 500 } = {}) {
  if (!pluggyAccountId) throw new Error('pluggyAccountId is required');
  if (!from || !to) throw new Error('from and to (YYYY-MM-DD) are required');

  const all = [];
  let page = 1;
  // Safety cap — 10 pages × 500 = 5000 tx is far more than a typical 90d window.
  while (page <= 10) {
    const qs = new URLSearchParams({
      accountId: pluggyAccountId,
      from,
      to,
      pageSize: String(pageSize),
      page: String(page),
    });
    const res = await authedRequest(`/transactions?${qs.toString()}`);
    const results = Array.isArray(res?.results) ? res.results : [];
    all.push(...results);
    if (results.length < pageSize) break;
    page += 1;
  }
  return all;
}

/**
 * Fetch a single transaction by id (used when webhook hands us transactionIds).
 */
export async function getTransaction(pluggyTransactionId) {
  return authedRequest(`/transactions/${pluggyTransactionId}`);
}

/**
 * Trigger a fresh sync on an item. Returns the updated item.
 * Used by the "force refresh" UI button and the daily fallback cron.
 */
export async function triggerSync(pluggyItemId) {
  return authedRequest(`/items/${pluggyItemId}`, { method: 'PATCH', body: {} });
}

/**
 * Delete an item — removes the Pluggy-side connection. Idempotent on 404.
 * Our DB row is soft-deleted separately so the historical transactions stay attached.
 */
export async function deleteItem(pluggyItemId) {
  try {
    return await authedRequest(`/items/${pluggyItemId}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 404) return { deleted: false, reason: 'already_gone' };
    throw err;
  }
}

/**
 * Test-only: clear the module-scoped apiKey cache.
 */
export function _resetApiKeyCache() {
  cachedApiKey = null;
  cachedApiKeyExpiresAt = 0;
}
