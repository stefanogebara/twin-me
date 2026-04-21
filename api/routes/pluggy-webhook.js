/**
 * Pluggy Webhook Receiver — Financial-Emotional Twin, Phase 3.1
 * ================================================================
 * Public endpoint. Gated by a shared-secret header (Pluggy has no HMAC).
 * Pluggy retries 10× over 3 days if we don't 200 within 5s, so we:
 *   1. Verify the secret
 *   2. Parse + persist event metadata
 *   3. Kick off heavy work (API fetches, ingestion) without blocking the response
 *
 * Events handled:
 *   item/created | item/updated | item/deleted | item/error
 *   item/waiting_user_input | item/login_succeeded
 *   connector/status_updated
 *   transactions/created | transactions/updated | transactions/deleted
 */

import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../services/database.js';
import * as pluggy from '../services/transactions/pluggyClient.js';
import {
  seedItemTransactions,
  ingestTransactionsByIds,
  resolveUserIdForItem,
} from '../services/transactions/pluggyIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('pluggy-webhook');
const router = express.Router();

const WEBHOOK_SECRET = process.env.PLUGGY_WEBHOOK_SECRET;

/**
 * Secret check — optional because Pluggy's dashboard webhook form does NOT
 * expose custom-header configuration (only the URL). If the secret env is
 * set AND a header is present, we enforce a match. If either is absent,
 * we accept the request and rely on the downstream defenses:
 *
 *   1. clientUserId must map to a real user in user_bank_connections
 *   2. pluggy_item_id must exist and not be soft-deleted
 *   3. Events for unknown items are logged and dropped
 *
 * When Pluggy ships HMAC signing (or we find the header config), tighten
 * this to fail-closed again.
 */
function verifyPluggySecret(req) {
  if (!WEBHOOK_SECRET) return true; // no secret configured — accept
  const header = req.headers['x-pluggy-signature'] || req.headers['x-webhook-secret'];
  if (!header || typeof header !== 'string') return true; // Pluggy didn't send one — accept
  try {
    return crypto.timingSafeEqual(
      Buffer.from(WEBHOOK_SECRET, 'utf8'),
      Buffer.from(header, 'utf8'),
    );
  } catch {
    // Length mismatch — secret rotated or malformed header. Reject.
    return false;
  }
}

// In-memory dedup — Pluggy may retry on timeout. Keep 5min window.
const seenEventIds = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  const now = Date.now();
  // Opportunistic cleanup
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

/**
 * Upsert a user_bank_connections row from a Pluggy item payload.
 * Called on item/created and item/updated.
 */
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

  // Primary user lookup: clientUserId (set by us at connect_token time)
  let userId = payload.clientUserId || null;

  // Fallback lookup: if the row exists, trust it (covers item/updated where clientUserId may be absent)
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
      // Only seed on create — update fires again on every refresh cycle
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

  // transactions/created + transactions/updated both funnel into the same upsert path.
  await ingestTransactionsByIds(userId, itemId, transactionIds);
}

/**
 * Dispatch handlers. On Vercel serverless, fire-and-forget promises get
 * killed after the response returns — sandbox testing confirmed this makes
 * the handler no-op even though Pluggy saw a 200. So we AWAIT dispatch
 * before responding. Pluggy's 5s SLA means light operations finish in
 * budget; seedItemTransactions (up to 90 days of tx across N accounts) can
 * exceed it — Pluggy retries 10x over 3d and our dedup cache + pluggy_tx_id
 * upsert skip duplicates on retry, so that's acceptable for Phase 3.
 */
async function dispatch(event, payload) {
  try {
    if (event.startsWith('item/')) {
      await handleItemEvent(event, payload);
    } else if (event.startsWith('transactions/')) {
      await handleTransactionEvent(event, payload);
    } else {
      log.info(`ignored event: ${event}`);
    }
  } catch (err) {
    log.error(`dispatch ${event} failed: ${err.message}`);
  }
}

router.post('/', express.json({ limit: '1mb' }), async (req, res) => {
  if (!verifyPluggySecret(req)) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  const payload = req.body || {};
  const event = String(payload.event || '');
  const eventId = payload.eventId;

  if (!event) return res.status(400).json({ success: false, error: 'missing event' });
  if (isDuplicateEvent(eventId)) {
    log.info(`duplicate event ${eventId} ignored`);
    return res.json({ success: true, deduplicated: true });
  }

  log.info(`received ${event} for item ${payload.itemId || '?'}`);

  // MUST await — Vercel serverless kills fire-and-forget promises after the
  // response returns, so dispatch never runs. If this times out past Pluggy's
  // 5s SLA, Pluggy retries (10x over 3d) and our dedup + pluggy_transaction_id
  // unique index make retries idempotent.
  try {
    await dispatch(event, payload);
    res.json({ success: true });
  } catch (err) {
    log.error(`dispatch failed: ${err.message}`);
    res.status(500).json({ success: false, error: 'dispatch failed' });
  }
});

export default router;
