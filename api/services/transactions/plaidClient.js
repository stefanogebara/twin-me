/**
 * Plaid API Client — Financial-Emotional Twin, Phase 4.1 (US coverage)
 * =====================================================================
 * Thin HTTP wrapper around the Plaid REST API. Plaid is the dominant US/CA
 * bank aggregator (~12,000 institutions: Chase, Schwab, Fidelity, Robinhood,
 * Amex, Capital One, etc.). OpenAI shipped their ChatGPT Personal Finance
 * dashboard on top of this same provider on 2026-05-15; this client closes
 * the geography gap left by our existing Pluggy (BR) + TrueLayer (UK/EU)
 * integrations.
 *
 * Auth model (simpler than Pluggy):
 *   - PLAID_CLIENT_ID + PLAID_SECRET passed in EVERY request body — no apiKey
 *     dance, no rotation, no module-scoped cache to keep warm.
 *   - Per-item `access_token` is permanent (no refresh). Exchanged once from
 *     Link's short-lived `public_token` after the user completes the drawer.
 *   - `link_token` is short-lived (30 min TTL), created server-side and
 *     consumed by the Plaid Link frontend SDK.
 *
 * Plain fetch — no Plaid SDK — to keep the Vercel serverless cold-start
 * lean. Same trade-off as Pluggy's client. All exports are async.
 */

import { createLogger } from '../logger.js';

const log = createLogger('plaid-client');

const DEFAULT_TIMEOUT_MS = 15_000;

const PLAID_ENVIRONMENTS = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

function getBaseUrl() {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  const url = PLAID_ENVIRONMENTS[env];
  if (!url) throw new Error(`Invalid PLAID_ENV: ${env}. Must be sandbox or production.`);
  return url;
}

/**
 * Cheap env predicate so callers can short-circuit with a graceful 503
 * instead of leaking a 500 when credentials aren't configured. Matches
 * the pattern set by isPluggyConfigured.
 */
export function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function assertCredentials() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    const err = new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');
    err.code = 'PLAID_NOT_CONFIGURED';
    throw err;
  }
  return { clientId, secret };
}

/**
 * Low-level HTTP POST with timeout. Every Plaid endpoint is a POST that
 * accepts a JSON body — no path-based routing variation needed.
 */
async function httpPost(path, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Plaid normally returns JSON. Non-JSON = lower layer failure; surface raw text.
    }

    if (!res.ok) {
      // Plaid error shape: { error_type, error_code, error_message, display_message, ... }
      // Surface error_code + display_message so callers can act on common cases
      // (ITEM_LOGIN_REQUIRED, INVALID_PUBLIC_TOKEN, RATE_LIMIT_EXCEEDED, etc.).
      const err = new Error(
        `plaid POST ${path} failed: ${res.status} ${json?.error_code || ''} ${json?.error_message || text.slice(0, 300)}`,
      );
      err.status = res.status;
      err.body = json;
      err.plaidErrorCode = json?.error_code || null;
      err.plaidErrorType = json?.error_type || null;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry wrapper. Plaid retries on network errors + 5xx + 429 only. Most
 * 4xx errors (INVALID_PUBLIC_TOKEN, ITEM_LOGIN_REQUIRED, INVALID_ACCESS_TOKEN)
 * are not retryable — they require user reauthorization or config changes.
 */
async function postWithRetry(path, body, { retries = 2, backoffMs = 300 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpPost(path, body);
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

/**
 * Inject credentials + the per-call `body` into a single request body.
 * Every authed Plaid endpoint takes client_id + secret in the JSON body,
 * which simplifies things considerably vs Pluggy's header-based apiKey.
 */
function authedPost(path, body = {}) {
  const { clientId, secret } = assertCredentials();
  return postWithRetry(path, { client_id: clientId, secret, ...body });
}

/* -------------------------------------------------------------------------- */
/* Public helpers — Link flow                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Server-side step 1 of the Plaid Link flow. The returned `link_token` (30min
 * TTL) is handed to the frontend Plaid Link SDK, which opens the drawer for
 * the user to pick a bank + authenticate.
 *
 * `clientUserId` is our internal user UUID — Plaid echoes it on every
 * webhook so we know which user the event belongs to.
 *
 * `products` defaults to ['transactions'] which is the cheapest. Add
 * 'investments' and/or 'liabilities' when the user is on a plan that
 * supports those features.
 */
export async function createLinkToken({
  clientUserId,
  products = ['transactions'],
  countryCodes = ['US'],
  language = 'en',
  webhookUrl = null,
  itemId = null,
  accessToken = null,
} = {}) {
  if (!clientUserId) throw new Error('clientUserId is required');

  const body = {
    user: { client_user_id: clientUserId },
    client_name: 'TwinMe',
    products,
    country_codes: countryCodes,
    language,
  };

  if (webhookUrl || process.env.PLAID_WEBHOOK_URL) {
    body.webhook = webhookUrl || process.env.PLAID_WEBHOOK_URL;
  }

  // Update mode: when reconnecting an existing item (ITEM_LOGIN_REQUIRED),
  // pass the access_token so Plaid opens the drawer scoped to that item.
  if (accessToken) {
    body.access_token = accessToken;
    // In update mode Plaid disallows the `products` field — only one or the other.
    delete body.products;
  }

  return authedPost('/link/token/create', body);
}

/**
 * Server-side step 2: exchange the `public_token` from Link's onSuccess
 * callback for a permanent `access_token` + plaid `item_id`. Call this
 * once and persist the access_token in your DB — never expose it to the
 * client.
 */
export async function exchangePublicToken(publicToken) {
  if (!publicToken) throw new Error('publicToken is required');
  return authedPost('/item/public_token/exchange', { public_token: publicToken });
}

/* -------------------------------------------------------------------------- */
/* Public helpers — Item lifecycle                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fetch item metadata — institution_id, available_products, billed_products,
 * webhook URL, error state (e.g. ITEM_LOGIN_REQUIRED). The first place to
 * look when a transactions/sync fails.
 */
export async function getItem(accessToken) {
  return authedPost('/item/get', { access_token: accessToken });
}

/**
 * Disconnect an item. Plaid removes the item server-side and revokes the
 * access_token. Our DB row is typically soft-deleted separately so the
 * historical transactions stay attached.
 */
export async function removeItem(accessToken) {
  try {
    return await authedPost('/item/remove', { access_token: accessToken });
  } catch (err) {
    // 404 / INVALID_ACCESS_TOKEN means the item is already gone — same as Pluggy.
    if (err.status === 400 && err.plaidErrorCode === 'INVALID_ACCESS_TOKEN') {
      return { removed: false, reason: 'already_gone' };
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Public helpers — Accounts / Transactions                                    */
/* -------------------------------------------------------------------------- */

/**
 * List all bank accounts under an item (checking, savings, credit cards,
 * brokerage, loans, etc.). Used after public-token exchange to populate
 * the account-picker UI and the per-account currency map.
 */
export async function getAccounts(accessToken) {
  return authedPost('/accounts/get', { access_token: accessToken });
}

/**
 * Incremental transaction sync. Cursor-based, returns:
 *   { added: [...], modified: [...], removed: [...], next_cursor, has_more }
 *
 * Pass the previous cursor on subsequent calls. First call (no cursor)
 * returns everything Plaid has fetched for the item so far. has_more=true
 * means there are more pages — loop until false.
 *
 * Replaces the legacy /transactions/get endpoint which had a 30-day window
 * and forced clients to paginate by date.
 */
export async function syncTransactions(accessToken, { cursor = null, count = 500 } = {}) {
  const body = { access_token: accessToken, count };
  if (cursor) body.cursor = cursor;
  return authedPost('/transactions/sync', body);
}

/* -------------------------------------------------------------------------- */
/* Public helpers — Investments                                                */
/* -------------------------------------------------------------------------- */

/**
 * Current portfolio holdings — positions, market values, cost basis. Plaid
 * returns one row per (account, security) pair plus a securities lookup
 * table for human-readable names + tickers.
 *
 * Requires the 'investments' product to be enabled at link time.
 */
export async function getInvestmentHoldings(accessToken) {
  return authedPost('/investments/holdings/get', { access_token: accessToken });
}

/**
 * Investment transactions (buys, sells, dividends, splits) within a date
 * range. Useful for the differentiated "sold at the bottom of a Whoop
 * recovery dip" insight surface.
 *
 * Date strings are YYYY-MM-DD. Plaid caps the page size at 500 — paginate
 * with `offset` if has_more is true.
 */
export async function getInvestmentTransactions(accessToken, { startDate, endDate, count = 250, offset = 0 } = {}) {
  if (!startDate || !endDate) throw new Error('startDate and endDate (YYYY-MM-DD) are required');
  return authedPost('/investments/transactions/get', {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: { count, offset },
  });
}

/* -------------------------------------------------------------------------- */
/* Public helpers — Liabilities                                                */
/* -------------------------------------------------------------------------- */

/**
 * Credit cards, mortgages, student loans — current balance, APR, next
 * payment, last payment, principal/interest split (where available).
 * Requires the 'liabilities' product enabled at link time.
 */
export async function getLiabilities(accessToken) {
  return authedPost('/liabilities/get', { access_token: accessToken });
}

/* -------------------------------------------------------------------------- */
/* Webhook verification key                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the public key used to sign a webhook JWT. Plaid embeds a `kid`
 * (key id) claim in the JWT header; callers extract it and pass it here to
 * receive the matching JWK. Keys rotate, but Plaid documents that an
 * `expired_at` key remains valid for verification for 24h after rotation —
 * the verifier must check the expiry and reject older signatures.
 *
 * Response shape: `{ key: { alg: 'ES256', crv: 'P-256', kid, kty: 'EC',
 * use: 'sig', x, y, created_at, expired_at } }`.
 */
export async function webhookVerificationKeyGet(keyId) {
  if (!keyId) throw new Error('keyId is required');
  return authedPost('/webhook_verification_key/get', { key_id: keyId });
}

/* -------------------------------------------------------------------------- */
/* Sandbox helpers (test-only — not callable in production)                    */
/* -------------------------------------------------------------------------- */

/**
 * Sandbox-only shortcut: mint a public_token for a test institution without
 * going through the Link drawer. Used in unit tests + initial dev setup.
 *
 * Default institution is ins_109508 (First Platypus Bank), which Plaid
 * provides as the canonical sandbox test institution.
 */
export async function sandboxCreatePublicToken({
  institutionId = 'ins_109508',
  initialProducts = ['transactions'],
} = {}) {
  if ((process.env.PLAID_ENV || 'sandbox').toLowerCase() !== 'sandbox') {
    throw new Error('sandboxCreatePublicToken can only be called when PLAID_ENV=sandbox');
  }
  return authedPost('/sandbox/public_token/create', {
    institution_id: institutionId,
    initial_products: initialProducts,
  });
}
