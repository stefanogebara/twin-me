/**
 * TrueLayer Ingestion — Phase 4
 * ================================
 * Pulls accounts + 24-month transactions for a connected user and writes them
 * to user_transactions via the same Phase 2 pipeline (recurrence detector +
 * emotion tagger) that Pluggy uses.
 *
 * Entry points:
 *   - seedUserConnection(userId, connectionRowId) — initial backfill on
 *     successful OAuth callback.
 *   - syncUserConnection(userId, connectionRowId) — refresh pull (cron or
 *     manual "force refresh"). Picks up the latest tx since last_synced_at.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { normalizeMerchant } from './merchantNormalizer.js';
import { detectAndMarkRecurring } from './recurrenceDetector.js';
import { tagTransactionsBatch } from './transactionEmotionTagger.js';
import * as tl from './trueLayerClient.js';

const log = createLogger('truelayer-ingestion');

const SEED_WINDOW_DAYS = 730; // 24 months, TrueLayer's max historical window

/**
 * TrueLayer transaction schema:
 *   { transaction_id, amount, currency, description, transaction_type,
 *     transaction_category, merchant_name, timestamp, ... }
 *
 * Sign convention: TrueLayer already uses negative for DEBIT, positive for
 * CREDIT in their `amount` field — matches our convention out of the box.
 */
function signedAmount(tx) {
  // Defensive: ensure the sign matches transaction_type even if the provider
  // returns absolute amounts (some banks do).
  const abs = Math.abs(Number(tx.amount) || 0);
  const type = String(tx.transaction_type || '').toUpperCase();
  if (type === 'DEBIT') return -abs;
  if (type === 'CREDIT') return abs;
  return Number(tx.amount) || 0;
}

function mapMerchant(tx) {
  const raw = tx.merchant_name || tx.description || 'unknown';
  const { brand, category } = normalizeMerchant(raw);
  return { merchantRaw: raw, brand, category };
}

function mapAccountType(account) {
  const type = String(account?.account_type || '').toUpperCase();
  if (type === 'CREDIT_CARD') return 'credit_card';
  if (type === 'SAVINGS') return 'savings';
  return 'checking';
}

async function persistTokenUpdate(connectionId, newEncryptedRefresh, newExpiresAt) {
  const patch = { access_token_expires_at: newExpiresAt };
  if (newEncryptedRefresh) patch.refresh_token_encrypted = newEncryptedRefresh;
  await supabaseAdmin.from('user_bank_connections').update(patch).eq('id', connectionId);
}

async function upsertTransactions(userId, tlAccountId, source, accountType, txs) {
  if (!txs.length) return [];
  const rows = txs
    .map((t) => {
      if (!t.transaction_id || !t.timestamp) return null;
      const { merchantRaw, brand, category } = mapMerchant(t);
      return {
        user_id: userId,
        truelayer_transaction_id: t.transaction_id,
        truelayer_account_id: tlAccountId,
        source,
        external_id: `truelayer:${t.transaction_id}`,
        amount: signedAmount(t),
        currency: t.currency || 'EUR',
        merchant_raw: merchantRaw,
        merchant_normalized: brand,
        category,
        transaction_date: t.timestamp,
        source_bank: 'truelayer',
        account_type: accountType,
      };
    })
    .filter(Boolean);
  if (!rows.length) return [];

  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    log.error(`tl upsert failed for user ${userId}: ${error.message}`);
    return [];
  }
  return (data || []).map((r) => r.id);
}

async function runDownstream(userId, insertedIds) {
  try { await detectAndMarkRecurring(userId); }
  catch (err) { log.warn(`recurrence detector failed user ${userId}: ${err.message}`); }
  if (insertedIds.length) {
    try { await tagTransactionsBatch(userId, insertedIds); }
    catch (err) { log.warn(`emotion tagger failed user ${userId}: ${err.message}`); }
  }
}

async function fetchConnection(connectionId) {
  const { data, error } = await supabaseAdmin
    .from('user_bank_connections')
    .select('id, user_id, provider, truelayer_credentials_id, refresh_token_encrypted, access_token_expires_at, last_synced_at')
    .eq('id', connectionId)
    .eq('provider', 'truelayer')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`fetch connection: ${error.message}`);
  if (!data) throw new Error(`truelayer connection ${connectionId} not found`);
  return data;
}

/**
 * One round of: refresh token → list accounts + cards → fetch transactions
 * for each over [from, to] window → upsert → run downstream pipeline.
 *
 * Shared between seed and sync; differs only in the `from` date.
 */
async function pullAndIngest(connectionId, { from, to }) {
  const conn = await fetchConnection(connectionId);

  const { accessToken, newEncryptedRefresh, newExpiresAt } = await tl.getValidAccessToken(conn);
  if (newEncryptedRefresh || newExpiresAt) {
    await persistTokenUpdate(connectionId, newEncryptedRefresh, newExpiresAt);
  }

  const [accountsRes, cardsRes] = await Promise.all([
    tl.getAccounts(accessToken).catch(() => ({ results: [] })),
    tl.getCards(accessToken).catch(() => ({ results: [] })),
  ]);

  const accountList = accountsRes?.results || [];
  const cardList = cardsRes?.results || [];

  const allInserted = [];
  const source = from && (Date.now() - new Date(from).getTime() < 48 * 3600_000) ? 'truelayer_webhook' : 'truelayer_sync';

  for (const acc of accountList) {
    const type = mapAccountType(acc);
    try {
      const res = await tl.getAccountTransactions(accessToken, acc.account_id, { from, to });
      const ids = await upsertTransactions(conn.user_id, acc.account_id, source, type, res?.results || []);
      allInserted.push(...ids);
    } catch (err) {
      log.warn(`account ${acc.account_id} tx fetch failed: ${err.message}`);
    }
  }

  for (const card of cardList) {
    try {
      const res = await tl.getCardTransactions(accessToken, card.account_id, { from, to });
      const ids = await upsertTransactions(conn.user_id, card.account_id, source, 'credit_card', res?.results || []);
      allInserted.push(...ids);
    } catch (err) {
      log.warn(`card ${card.account_id} tx fetch failed: ${err.message}`);
    }
  }

  await supabaseAdmin
    .from('user_bank_connections')
    .update({ last_synced_at: new Date().toISOString(), status: 'UPDATED' })
    .eq('id', connectionId);

  await runDownstream(conn.user_id, allInserted);

  log.info(`tl sync user ${conn.user_id} conn ${connectionId}: ${allInserted.length} tx, ${accountList.length}a+${cardList.length}c`);
  return { inserted: allInserted.length, accounts: accountList.length, cards: cardList.length };
}

/**
 * Initial 24-month backfill after the OAuth callback completes.
 */
export async function seedUserConnection(connectionId) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - SEED_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  return pullAndIngest(connectionId, { from, to });
}

/**
 * Incremental sync — called by cron or the "force refresh" button. Looks back
 * 14 days to catch late-posting transactions + anything since last_synced_at.
 */
export async function syncUserConnection(connectionId) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  return pullAndIngest(connectionId, { from, to });
}
