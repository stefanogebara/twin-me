/**
 * Pluggy Webhook — Standalone Vercel Serverless Function
 * ========================================================
 * Extracted from the Express monolith so it builds as its own tiny lambda
 * (seconds, not 10+ minutes). Pluggy's 5s SLA also benefits — fewer cold-start
 * imports to walk before the handler runs.
 *
 * Route: vercel.json forwards /api/webhooks/pluggy here.
 *
 * Shared code comes from api/services/* and api/routes/pluggy-webhook.js —
 * but we re-export the Express router as a minimal handler here to avoid
 * pulling in helmet/cors/rate-limiter/Sentry/... that the monolith loads.
 */

import crypto from 'crypto';
import { supabaseAdmin } from './services/database.js';
import * as pluggy from './services/transactions/pluggyClient.js';

// In-memory IP rate limit. Lambda warm reuse keeps the Map alive across
// invocations; cold start resets — that's fine, 429 is a soft guard.
// 60 requests per minute per IP ≫ Pluggy's typical burst (a few events at
// item/created + a batch of transactions/created per connection).
const RATE_BUCKETS = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

function rateLimitAllow(ip) {
  if (!ip) return true; // can't identify — don't block
  const now = Date.now();
  const entry = RATE_BUCKETS.get(ip) || { start: now, count: 0 };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count++;
  RATE_BUCKETS.set(ip, entry);
  // Opportunistic cleanup
  if (RATE_BUCKETS.size > 1000) {
    for (const [k, v] of RATE_BUCKETS.entries()) {
      if (now - v.start > 2 * RATE_WINDOW_MS) RATE_BUCKETS.delete(k);
    }
  }
  return entry.count <= RATE_MAX;
}
import {
  seedItemTransactions,
  ingestTransactionsByIds,
  resolveUserIdForItem,
} from './services/transactions/pluggyIngestion.js';
import { createLogger } from './services/logger.js';

const log = createLogger('pluggy-webhook-lambda');

const WEBHOOK_SECRET = process.env.PLUGGY_WEBHOOK_SECRET;

function verifyPluggySecret(headers) {
  if (!WEBHOOK_SECRET) return true;
  const header = headers['x-pluggy-signature'] || headers['x-webhook-secret'];
  if (!header || typeof header !== 'string') return true;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(WEBHOOK_SECRET, 'utf8'),
      Buffer.from(header, 'utf8'),
    );
  } catch {
    return false;
  }
}

// In-memory dedup — survives warm lambda invocations.
const seenEventIds = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  const now = Date.now();
  if (seenEventIds.size > 500) {
    for (const [id, ts] of seenEventIds.entries()) {
      if (now - ts > DEDUP_TTL_MS) seenEventIds.delete(id);
    }
  }
  const prev = seenEventIds.get(eventId);
  if (prev && now - prev < DEDUP_TTL_MS) return true;
  seenEventIds.set(eventId, now);
  return false;
}

async function upsertConnectionFromItem(userId, item) {
  if (!userId || !item?.id) return;
  const row = {
    user_id: userId,
    pluggy_item_id: item.id,
    connector_id: item.connector?.id ?? 0,
    connector_name: item.connector?.name || 'Unknown Bank',
    status: item.status || 'UNKNOWN',
    status_detail: item.executionStatus ? { executionStatus: item.executionStatus } : null,
    last_synced_at: item.lastUpdatedAt || new Date().toISOString(),
    consent_expires_at: item.consentExpiresAt || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from('user_bank_connections')
    .upsert(row, { onConflict: 'pluggy_item_id' });
  if (error) log.warn(`upsert connection ${item.id}: ${error.message}`);
}

async function handleItemEvent(event, payload) {
  const itemId = payload.itemId;
  if (!itemId) return;

  let userId = payload.clientUserId || null;
  if (!userId) userId = await resolveUserIdForItem(itemId);
  if (!userId) {
    log.warn(`no user for item ${itemId}; skipping ${event}`);
    return;
  }

  switch (event) {
    case 'item/created':
    case 'item/updated':
    case 'item/login_succeeded': {
      const item = await pluggy.getItem(itemId);
      await upsertConnectionFromItem(userId, item);
      if (event === 'item/created') {
        await seedItemTransactions(userId, itemId);
      }
      break;
    }
    case 'item/error':
    case 'item/waiting_user_input': {
      const item = await pluggy.getItem(itemId).catch(() => null);
      const status = item?.status || (event === 'item/error' ? 'LOGIN_ERROR' : 'WAITING_USER_INPUT');
      await supabaseAdmin
        .from('user_bank_connections')
        .update({
          status,
          status_detail: item?.executionStatus ? { executionStatus: item.executionStatus } : null,
          updated_at: new Date().toISOString(),
        })
        .eq('pluggy_item_id', itemId);
      break;
    }
    case 'item/deleted': {
      await supabaseAdmin
        .from('user_bank_connections')
        .update({ deleted_at: new Date().toISOString(), status: 'DELETED' })
        .eq('pluggy_item_id', itemId);
      break;
    }
    default:
      log.info(`unhandled item event: ${event}`);
  }
}

async function handleTransactionEvent(event, payload) {
  const itemId = payload.itemId;
  const transactionIds = Array.isArray(payload.transactionIds) ? payload.transactionIds : [];
  if (!itemId || !transactionIds.length) return;

  const userId = payload.clientUserId || (await resolveUserIdForItem(itemId));
  if (!userId) {
    log.warn(`no user for transactions on item ${itemId}`);
    return;
  }

  if (event === 'transactions/deleted') {
    const { error } = await supabaseAdmin
      .from('user_transactions')
      .delete()
      .in('pluggy_transaction_id', transactionIds)
      .eq('user_id', userId);
    if (error) log.warn(`delete tx failed: ${error.message}`);
    return;
  }

  await ingestTransactionsByIds(userId, itemId, transactionIds);
}

async function dispatch(event, payload) {
  if (event.startsWith('item/')) {
    await handleItemEvent(event, payload);
  } else if (event.startsWith('transactions/')) {
    await handleTransactionEvent(event, payload);
  } else {
    log.info(`ignored event: ${event}`);
  }
}

/**
 * Vercel serverless function default export. Receives the raw Node req/res.
 * Parses JSON body, validates signature, dispatches handlers synchronously,
 * then returns 200 (or 500 with the error for debugging).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'method not allowed' });
    return;
  }

  // Rate limit BEFORE signature check so a secret-scrape attacker can't burn
  // us out on failed auth attempts.
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (!rateLimitAllow(ip)) {
    log.warn(`rate-limited ip=${ip}`);
    res.status(429).json({ success: false, error: 'rate limit exceeded' });
    return;
  }

  if (!verifyPluggySecret(req.headers)) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return;
  }

  // Vercel provides req.body pre-parsed when Content-Type is application/json.
  const payload = (typeof req.body === 'object' && req.body !== null) ? req.body : {};
  const event = String(payload.event || '');
  const eventId = payload.eventId;

  if (!event) {
    res.status(400).json({ success: false, error: 'missing event' });
    return;
  }

  if (isDuplicateEvent(eventId)) {
    log.info(`duplicate event ${eventId} ignored`);
    res.status(200).json({ success: true, deduplicated: true });
    return;
  }

  log.info(`received ${event} for item ${payload.itemId || '?'}`);

  try {
    await dispatch(event, payload);
    res.status(200).json({ success: true });
  } catch (err) {
    log.error(`dispatch ${event} failed: ${err.message}\n${err.stack}`);
    res.status(500).json({ success: false, error: 'dispatch failed' });
  }
}

export const config = {
  maxDuration: 60,
};
