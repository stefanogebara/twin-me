/**
 * Plaid Webhook — Standalone Vercel Serverless Function
 * =======================================================
 * Extracted from the Express monolith so it builds as its own tiny lambda
 * (cold-start seconds, not 10+ minutes). Plaid retries 200-non-2xx
 * responses with exponential backoff, so fast 200 = idempotent re-delivery
 * tolerance.
 *
 * Route: vercel.json forwards /api/webhooks/plaid here.
 *
 * Plaid webhook payload shape (all events):
 *   {
 *     webhook_type: 'TRANSACTIONS' | 'ITEM' | 'INVESTMENTS_TRANSACTIONS' | 'HOLDINGS' | 'LIABILITIES' | ...,
 *     webhook_code: 'SYNC_UPDATES_AVAILABLE' | 'ERROR' | 'PENDING_EXPIRATION' | ...,
 *     item_id: 'wEXVMG...',
 *     error: { error_type, error_code, error_message } | null,
 *     ...event-specific fields
 *   }
 *
 * Security model:
 *   - Plaid's production-grade verification is JWS-signed via the
 *     `plaid-verification` header, validated against /webhook_verification_key/get.
 *     That's the right long-term path. For now we use a shared-secret header
 *     (PLAID_WEBHOOK_SECRET) matching the Pluggy/TrueLayer pattern, which is
 *     fine for sandbox + early production but should be upgraded before scale.
 *   - Same rate-limit + dedup belts as the Pluggy lambda.
 */

import crypto from 'crypto';
import { supabaseAdmin } from './services/database.js';
import {
  syncItem,
  resolveItemContext,
} from './services/transactions/plaidIngestion.js';
import { verifyPlaidWebhook } from './services/transactions/plaidWebhookVerifier.js';
import { createLogger } from './services/logger.js';

const log = createLogger('plaid-webhook-lambda');

const WEBHOOK_SECRET = process.env.PLAID_WEBHOOK_SECRET;
// audit-2026-05-23 C3: when true, ONLY accept JWS-verified webhooks. Keep
// false during rollout so the existing shared-secret fallback covers gaps
// while the JWT path is observed. Flip to true once Vercel logs show
// JWS-verified events arriving cleanly.
const REQUIRE_JWS = process.env.PLAID_WEBHOOK_REQUIRE_JWS === 'true';

const RATE_BUCKETS = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120; // Plaid bursts a bit harder than Pluggy on initial sync

function rateLimitAllow(ip) {
  if (!ip) return true;
  const now = Date.now();
  const entry = RATE_BUCKETS.get(ip) || { start: now, count: 0 };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count++;
  RATE_BUCKETS.set(ip, entry);
  if (RATE_BUCKETS.size > 1000) {
    for (const [k, v] of RATE_BUCKETS.entries()) {
      if (now - v.start > 2 * RATE_WINDOW_MS) RATE_BUCKETS.delete(k);
    }
  }
  return entry.count <= RATE_MAX;
}

function verifyPlaidSecret(headers) {
  if (!WEBHOOK_SECRET) return true; // dev mode — bypass when unset
  const header = headers['x-plaid-secret'] || headers['x-webhook-secret'];
  if (!header || typeof header !== 'string') return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(WEBHOOK_SECRET, 'utf8'),
      Buffer.from(header, 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Read the raw request body as a string. Plaid signs the exact bytes it
 * sent, so JSON.stringify(req.body) is NOT good enough — key ordering and
 * whitespace differ. We disable Vercel's automatic body parsing below and
 * pull the bytes off the stream ourselves.
 */
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// In-memory dedup. Plaid doesn't ship a stable event_id like Pluggy, so we
// hash item_id + webhook_type + webhook_code + a short coarse timestamp
// (10s bucket) to dedup retries inside the same warm lambda.
const seenEvents = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function eventKey(payload) {
  const bucket = Math.floor(Date.now() / 10_000); // 10s buckets
  return `${payload.item_id || '?'}:${payload.webhook_type || '?'}:${payload.webhook_code || '?'}:${bucket}`;
}

function isDuplicateEvent(key) {
  if (!key) return false;
  const now = Date.now();
  if (seenEvents.size > 500) {
    for (const [k, ts] of seenEvents.entries()) {
      if (now - ts > DEDUP_TTL_MS) seenEvents.delete(k);
    }
  }
  const prev = seenEvents.get(key);
  if (prev && now - prev < DEDUP_TTL_MS) return true;
  seenEvents.set(key, now);
  return false;
}

/**
 * Update the connection row's status fields when Plaid reports an item
 * error or consent-expiry warning. Drives the reconnect prompt in the UI.
 */
async function updateItemStatus(itemId, status, statusDetail) {
  const { error } = await supabaseAdmin
    .from('user_bank_connections')
    .update({ status, status_detail: statusDetail, updated_at: new Date().toISOString() })
    .eq('plaid_item_id', itemId);
  if (error) log.warn(`updateItemStatus ${itemId}: ${error.message}`);
}

async function handleTransactionsWebhook(payload) {
  const itemId = payload.item_id;
  if (!itemId) return;

  // The only event we care about under the /transactions/sync regime is
  // SYNC_UPDATES_AVAILABLE — everything else (INITIAL_UPDATE, etc.) is for
  // the legacy /transactions/get path. We trigger a sync run unconditionally
  // for the sync-related events so even a confused webhook still surfaces tx.
  const code = payload.webhook_code;
  if (
    code === 'SYNC_UPDATES_AVAILABLE' ||
    code === 'INITIAL_UPDATE' ||
    code === 'HISTORICAL_UPDATE' ||
    code === 'DEFAULT_UPDATE' ||
    code === 'TRANSACTIONS_REMOVED'
  ) {
    // resolveItemContext loads user_id + access_token from the DB row.
    const ctx = await resolveItemContext(itemId);
    if (!ctx) {
      log.warn(`tx webhook for unknown item ${itemId} (code=${code})`);
      return;
    }
    await syncItem(null, itemId, { allowNudge: true });
  } else {
    log.info(`ignored transactions webhook_code: ${code}`);
  }
}

async function handleItemWebhook(payload) {
  const itemId = payload.item_id;
  if (!itemId) return;
  const code = payload.webhook_code;

  switch (code) {
    case 'ERROR': {
      const err = payload.error || {};
      // ITEM_LOGIN_REQUIRED is the "user needs to reauth" signal. Flip our
      // row to LOGIN_REQUIRED so the UI can render the reconnect CTA.
      const status = err.error_code === 'ITEM_LOGIN_REQUIRED'
        ? 'LOGIN_REQUIRED'
        : 'ERROR';
      await updateItemStatus(itemId, status, {
        error_type: err.error_type,
        error_code: err.error_code,
        error_message: err.error_message,
      });
      break;
    }
    case 'LOGIN_REPAIRED': {
      // User finished update-mode Link drawer; reset to CONNECTED and
      // immediately trigger a sync to pick up anything missed during the
      // outage.
      await updateItemStatus(itemId, 'CONNECTED', null);
      const ctx = await resolveItemContext(itemId);
      if (ctx) await syncItem(null, itemId, { allowNudge: false });
      break;
    }
    case 'PENDING_EXPIRATION':
    case 'PENDING_DISCONNECT': {
      await updateItemStatus(itemId, 'PENDING_EXPIRATION', {
        webhook_code: code,
        consent_expiration_time: payload.consent_expiration_time || null,
      });
      break;
    }
    case 'USER_PERMISSION_REVOKED':
    case 'USER_ACCOUNT_REVOKED': {
      // User revoked at the bank side. Soft-delete locally — Plaid will
      // 400 on subsequent calls anyway, no point keeping the row live.
      await supabaseAdmin
        .from('user_bank_connections')
        .update({
          deleted_at: new Date().toISOString(),
          status: 'REVOKED',
          plaid_access_token_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .eq('plaid_item_id', itemId);
      break;
    }
    case 'NEW_ACCOUNTS_AVAILABLE':
    case 'WEBHOOK_UPDATE_ACKNOWLEDGED':
      log.info(`item ${itemId}: ${code} (informational)`);
      break;
    default:
      log.info(`unhandled item webhook_code: ${code}`);
  }
}

async function dispatch(payload) {
  const type = payload.webhook_type;
  if (type === 'TRANSACTIONS') {
    await handleTransactionsWebhook(payload);
  } else if (type === 'ITEM') {
    await handleItemWebhook(payload);
  } else {
    // INVESTMENTS_TRANSACTIONS / HOLDINGS / LIABILITIES — not wired yet,
    // log + accept so Plaid stops retrying. We'll wire investment events
    // when we add the brokerage tracking surface.
    log.info(`accepted webhook_type without handler: ${type}/${payload.webhook_code}`);
  }
}

/**
 * Vercel serverless handler. Mirrors webhook-pluggy.js shape: rate limit
 * → signature check → dedup → dispatch → 200. Plaid retries non-2xx with
 * backoff, so 200-on-deduped + 500-on-error is the right contract.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'method not allowed' });
    return;
  }

  const ip = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '',
  ).split(',')[0].trim();
  if (!rateLimitAllow(ip)) {
    log.warn(`rate-limited ip=${ip}`);
    res.status(429).json({ success: false, error: 'rate limit exceeded' });
    return;
  }

  // Pull raw body off the stream. bodyParser is disabled below so req.body
  // is undefined here — the verifier needs exact bytes for the sha256 check.
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    log.warn(`body read failed: ${err.message}`);
    res.status(400).json({ success: false, error: 'body read failed' });
    return;
  }

  // Primary path: Plaid's JWS verification via plaid-verification header.
  const signedJwt = req.headers['plaid-verification'];
  let verifiedVia = null;
  if (signedJwt) {
    const result = await verifyPlaidWebhook(rawBody, signedJwt);
    if (result.valid) {
      verifiedVia = 'jws';
    } else {
      log.warn(`JWS verification failed: ${result.reason}`);
      if (REQUIRE_JWS) {
        res.status(401).json({ success: false, error: 'unauthorized' });
        return;
      }
    }
  } else if (REQUIRE_JWS) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return;
  }

  // Fallback path (transition window): legacy shared-secret header.
  if (!verifiedVia) {
    if (!verifyPlaidSecret(req.headers)) {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }
    verifiedVia = 'shared-secret';
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    res.status(400).json({ success: false, error: 'invalid json' });
    return;
  }
  if (!payload.webhook_type || !payload.webhook_code) {
    res.status(400).json({ success: false, error: 'missing webhook_type or webhook_code' });
    return;
  }

  const key = eventKey(payload);
  if (isDuplicateEvent(key)) {
    log.info(`duplicate event ${key} ignored`);
    res.status(200).json({ success: true, deduplicated: true });
    return;
  }

  log.info(`received ${payload.webhook_type}/${payload.webhook_code} for item ${payload.item_id || '?'} (auth=${verifiedVia})`);

  try {
    await dispatch(payload);
    res.status(200).json({ success: true });
  } catch (err) {
    log.error(`dispatch ${payload.webhook_type}/${payload.webhook_code} failed: ${err.message}\n${err.stack}`);
    res.status(500).json({ success: false, error: 'dispatch failed' });
  }
}

export const config = {
  maxDuration: 60,
  api: {
    // We read the body manually for JWS sha256 verification — Vercel must
    // not auto-parse it (re-stringified JSON would never hash-match).
    bodyParser: false,
  },
};
