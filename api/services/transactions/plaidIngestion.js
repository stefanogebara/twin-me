/**
 * Plaid Ingestion — Financial-Emotional Twin, Phase 4.1 (US coverage)
 * =====================================================================
 * Maps Plaid's /transactions/sync payload onto our `user_transactions`
 * schema and chains the Phase 2 pipeline (recurrence detector → emotion
 * tagger → memory stream dual-write).
 *
 * Two entry points:
 *   - bootstrapItem(userId, accessToken, plaidItemId) — call right after
 *     exchanging public_token. Stores the encrypted access_token + initial
 *     metadata, then runs a full sync to seed transactions.
 *   - syncItem(userId, plaidItemId) — incremental sync using the stored
 *     cursor. Called by the webhook and the fallback cron.
 *
 * Idempotency: we upsert on (user_id, external_id) where
 * external_id = `plaid:<transaction_id>`. Plaid's transaction_id is stable
 * across pending→posted transitions so re-running sync is safe.
 *
 * Cursor handling: Plaid's /transactions/sync is cursor-based. We persist
 * the cursor on user_bank_connections.plaid_sync_cursor and resume from
 * there on every call. Each call may return has_more=true; we loop until
 * has_more is false. Initial call (cursor=null) returns everything Plaid
 * has fetched for the item so far — typically the trailing 90d, depending
 * on the institution's history depth.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { encryptToken, decryptToken } from '../encryption.js';
import { normalizeMerchant } from './merchantNormalizer.js';
import { detectAndMarkRecurring } from './recurrenceDetector.js';
import { tagTransactionsBatch } from './transactionEmotionTagger.js';
import { maybeNudgeForTransactions } from './transactionNudgeService.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import * as plaid from './plaidClient.js';

const log = createLogger('plaid-ingestion');

// USD threshold — Plaid is US-centric so default to USD-equivalent of the
// Pluggy/TrueLayer 50-unit floor (matches the existing "only material tx
// land in the memory stream" rule). Roughly $50.
const MEMORY_MIN_AMOUNT = 50;

// Hard cap on the sync loop — Plaid normally returns 500/page; 20 iterations
// covers 10k transactions which is more than any human-scale 2-year window.
const MAX_SYNC_PAGES = 20;

/**
 * Plaid amount convention vs ours:
 *   - Plaid: positive amount = money LEAVING the account (debit). E.g. a
 *     $42.31 grocery purchase shows up as amount: 42.31. Refunds and
 *     deposits are negative.
 *   - Ours: negative = outflow, positive = inflow.
 *
 * So we flip the sign. Documented in Plaid docs: "Amounts are positive when
 * money is removed from the account; negative when money is being added."
 */
function signedAmount(plaidTx) {
  const raw = Number(plaidTx?.amount);
  if (!Number.isFinite(raw)) return 0;
  return -raw;
}

/**
 * Map Plaid merchant → our (brand, category). Plaid's `merchant_name` is
 * the cleaned name (e.g. "Starbucks") and `name` is the raw description.
 * We prefer merchant_name when present, fall back to name.
 */
function mapMerchant(plaidTx) {
  const merchantRaw =
    plaidTx.merchant_name ||
    plaidTx.name ||
    plaidTx.original_description ||
    'unknown';
  const { brand, category } = normalizeMerchant(merchantRaw);
  return { merchantRaw, brand, category };
}

/**
 * Plaid account.type ∈ { depository, credit, loan, investment, brokerage,
 * other }. subtype narrows further (checking, savings, credit card, etc.).
 * Map to our enum: checking | savings | credit_card | investment | other.
 */
function mapAccountType(account) {
  const type = String(account?.type || '').toLowerCase();
  const subtype = String(account?.subtype || '').toLowerCase();
  if (type === 'credit' || subtype.includes('credit card')) return 'credit_card';
  if (subtype === 'savings') return 'savings';
  if (subtype === 'checking') return 'checking';
  if (type === 'investment' || type === 'brokerage') return 'investment';
  return 'checking'; // safe default — surfaces in UI, doesn't lose data
}

/**
 * Look up the owning user_id + access_token + cursor for a Plaid item.
 * Mirrors resolveUserIdForItem in pluggyIngestion.js.
 */
async function resolveItemContext(plaidItemId) {
  const { data, error } = await supabaseAdmin
    .from('user_bank_connections')
    .select('user_id, plaid_access_token_encrypted, plaid_sync_cursor')
    .eq('plaid_item_id', plaidItemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    log.warn(`resolveItemContext ${plaidItemId}: ${error.message}`);
    return null;
  }
  if (!data) return null;
  let accessToken = null;
  try {
    if (data.plaid_access_token_encrypted) {
      accessToken = decryptToken(data.plaid_access_token_encrypted);
    }
  } catch (err) {
    log.error(`decrypt access_token failed for item ${plaidItemId}: ${err.message}`);
    return null;
  }
  return {
    userId: data.user_id,
    accessToken,
    cursor: data.plaid_sync_cursor || null,
  };
}

/**
 * Bulk-insert/upsert transactions with Plaid-native idempotency. Returns
 * the ids of inserted rows so the downstream pipeline can tag them.
 */
async function upsertTransactions(userId, plaidAccountId, source, accountType, transactions, accountCurrency) {
  if (!transactions.length) return [];

  const rows = transactions
    .map((t) => {
      if (!t.transaction_id || !t.date) return null;
      const { merchantRaw, brand, category } = mapMerchant(t);
      return {
        user_id: userId,
        plaid_transaction_id: t.transaction_id,
        plaid_account_id: plaidAccountId,
        source,
        external_id: `plaid:${t.transaction_id}`,
        amount: signedAmount(t),
        currency: t.iso_currency_code || t.unofficial_currency_code || accountCurrency || 'USD',
        merchant_raw: merchantRaw,
        merchant_normalized: brand,
        category,
        transaction_date: t.date,
        source_bank: 'plaid',
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
    log.error(`upsert failed for user ${userId}: ${error.message}`);
    return [];
  }
  return (data || []).map((r) => r.id);
}

/**
 * Apply a /transactions/sync response to the DB. Handles added + modified
 * (same upsert path) and removed (soft delete by external_id).
 *
 * Returns the array of touched ids so downstream pipeline can run.
 */
async function applySyncBatch(userId, syncResponse, accounts) {
  const accountIndex = new Map((accounts?.accounts || []).map((a) => [a.account_id, a]));

  // Group added+modified by account so we can derive account_type once per account
  // instead of N times. Tiny optimisation but mirrors the Pluggy path.
  const byAccount = new Map();
  for (const t of [...(syncResponse.added || []), ...(syncResponse.modified || [])]) {
    if (!byAccount.has(t.account_id)) byAccount.set(t.account_id, []);
    byAccount.get(t.account_id).push(t);
  }

  const allIds = [];
  for (const [accountId, txs] of byAccount.entries()) {
    const acc = accountIndex.get(accountId);
    const accountType = mapAccountType(acc);
    const ccy = acc?.balances?.iso_currency_code || acc?.balances?.unofficial_currency_code || null;
    const ids = await upsertTransactions(userId, accountId, 'plaid_sync', accountType, txs, ccy);
    allIds.push(...ids);
  }

  // Removed transactions: Plaid sometimes deletes a pending tx when it
  // re-emerges as posted under a different id. Soft-delete by external_id
  // so historical analytics keep the row but it stops appearing in the UI.
  const removed = syncResponse.removed || [];
  if (removed.length) {
    const removedExtIds = removed.map((r) => `plaid:${r.transaction_id}`).filter(Boolean);
    if (removedExtIds.length) {
      const { error: delErr } = await supabaseAdmin
        .from('user_transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('external_id', removedExtIds);
      if (delErr) log.warn(`mark removed failed for user ${userId}: ${delErr.message}`);
    }
  }

  return allIds;
}

/**
 * Run the downstream pipeline. Mirrors pluggyIngestion.runDownstreamPipeline
 * exactly so emotion tagging + memory-stream dual-write + nudges fire the
 * same regardless of provider.
 */
async function runDownstreamPipeline(userId, insertedIds, { allowNudge = false } = {}) {
  try {
    await detectAndMarkRecurring(userId);
  } catch (err) {
    log.warn(`recurrence detector failed for user ${userId}: ${err.message}`);
  }
  if (!insertedIds.length) return;

  try {
    await tagTransactionsBatch(userId, insertedIds);
  } catch (err) {
    log.warn(`emotion tagger failed for user ${userId}: ${err.message}`);
  }

  // Dual-write material spend transactions into the memory stream so the
  // twin can talk about them. Floor at MEMORY_MIN_AMOUNT to keep noise out.
  try {
    const { data: txRows } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        id, amount, currency, merchant_normalized, merchant_raw, category,
        transaction_date,
        emotional_context:transaction_emotional_context (
          computed_stress_score, emotion_label
        )
      `)
      .in('id', insertedIds)
      .eq('user_id', userId)
      .lt('amount', 0);

    const material = (txRows || []).filter(
      (r) => Math.abs(Number(r.amount) || 0) >= MEMORY_MIN_AMOUNT,
    );

    await Promise.all(
      material.map((r) => {
        const merchant = r.merchant_normalized || r.merchant_raw || 'unknown';
        const ccy = r.currency || 'USD';
        const amountStr = new Intl.NumberFormat('en-US', {
          style: 'currency', currency: ccy,
        }).format(Math.abs(r.amount));
        const date = (r.transaction_date || '').slice(0, 10) || 'unknown date';
        const ec = r.emotional_context;
        const emotionNote = ec?.emotion_label
          ? `; emotional context: ${ec.emotion_label}${ec.computed_stress_score != null ? `, stress=${Math.round(ec.computed_stress_score * 100)}%` : ''}`
          : '';
        const content = `Spent ${amountStr} at ${merchant} on ${date}${emotionNote}.`;
        return addPlatformObservation(userId, content, 'plaid', {
          category: r.category,
          source_tx_id: r.id,
        }).catch((err) => log.warn(`memory write failed for tx ${r.id}: ${err.message}`));
      }),
    );

    if (material.length) {
      log.info(`wrote ${material.length} tx observations to memory stream for user ${userId}`);
    }
  } catch (err) {
    log.warn(`memory stream dual-write failed for user ${userId}: ${err.message}`);
  }

  if (allowNudge) {
    try {
      await maybeNudgeForTransactions(userId, insertedIds);
    } catch (err) {
      log.warn(`nudge check failed for user ${userId}: ${err.message}`);
    }
  }
}

/**
 * Persist the bank connection row from an exchanged Plaid item. Idempotent
 * upsert on plaid_item_id — re-running this for an already-bootstrapped
 * item just refreshes the institution metadata + access_token + status.
 */
export async function upsertConnectionFromItem(userId, plaidItemId, accessToken, item) {
  if (!userId || !plaidItemId || !accessToken) {
    throw new Error('upsertConnectionFromItem: userId, plaidItemId, accessToken are required');
  }

  const institutionId = item?.item?.institution_id || null;
  const institutionName = item?.institution?.name || institutionId || 'Bank (Plaid)';
  const error = item?.item?.error;
  const status = error ? 'ERROR' : 'CONNECTED';
  const statusDetail = error
    ? { error_type: error.error_type, error_code: error.error_code, error_message: error.error_message }
    : null;

  const row = {
    user_id: userId,
    provider: 'plaid',
    plaid_item_id: plaidItemId,
    plaid_access_token_encrypted: encryptToken(accessToken),
    plaid_institution_id: institutionId,
    connector_id: 0,                         // Plaid doesn't have a numeric connector id; keep schema happy
    connector_name: institutionName,
    status,
    status_detail: statusDetail,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: dbErr } = await supabaseAdmin
    .from('user_bank_connections')
    .upsert(row, { onConflict: 'plaid_item_id' });
  if (dbErr) {
    log.error(`upsert connection ${plaidItemId} failed: ${dbErr.message}`);
    throw dbErr;
  }
}

/**
 * Update the persisted cursor + last-synced timestamp after a sync loop.
 * Separate function so the syncItem loop can checkpoint between pages.
 */
async function persistCursor(plaidItemId, cursor) {
  const { error } = await supabaseAdmin
    .from('user_bank_connections')
    .update({ plaid_sync_cursor: cursor, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('plaid_item_id', plaidItemId);
  if (error) log.warn(`persistCursor ${plaidItemId}: ${error.message}`);
}

/**
 * Bootstrap an item right after Link's public_token exchange. Persists the
 * encrypted access_token + metadata, then runs the first sync to backfill
 * transactions. Returns { accounts, inserted }.
 */
export async function bootstrapItem(userId, accessToken, plaidItemId) {
  if (!userId || !accessToken || !plaidItemId) {
    throw new Error('bootstrapItem: userId, accessToken, plaidItemId are required');
  }

  // 1. Pull item metadata (institution + error state) so the connection row
  //    reflects the real state from the start.
  let itemMeta = null;
  try {
    itemMeta = await plaid.getItem(accessToken);
  } catch (err) {
    log.warn(`getItem failed for new item ${plaidItemId}: ${err.message}`);
  }

  // 2. Persist the connection row before we even start fetching transactions
  //    so the webhook (which can race ahead) can resolve the user.
  await upsertConnectionFromItem(userId, plaidItemId, accessToken, itemMeta || {});

  // 3. Run the initial sync. Plaid backfills history asynchronously, so the
  //    first call often returns 0-50 transactions and a cursor. The webhook
  //    will fire SYNC_UPDATES_AVAILABLE later with the rest.
  const result = await syncItem(userId, plaidItemId, { allowNudge: false });
  log.info(`bootstrapped item ${plaidItemId} for user ${userId}: ${result.inserted} tx`);
  return result;
}

/**
 * Incremental sync from the persisted cursor. Loops over has_more pages
 * with a hard cap. Applies the downstream pipeline once after all pages
 * settle so emotion-tagging + memory dual-write run on one batch.
 */
export async function syncItem(userId, plaidItemId, { allowNudge = true } = {}) {
  const ctx = userId
    ? { userId, accessToken: null, cursor: null }
    : await resolveItemContext(plaidItemId);
  if (!ctx) {
    log.warn(`syncItem: no context for item ${plaidItemId}`);
    return { inserted: 0 };
  }

  // If we were called with explicit userId (bootstrap path), we still need
  // the access_token + cursor — fetch them now.
  if (!ctx.accessToken) {
    const ctxFromDb = await resolveItemContext(plaidItemId);
    if (!ctxFromDb || !ctxFromDb.accessToken) {
      log.warn(`syncItem: no access_token for item ${plaidItemId}`);
      return { inserted: 0 };
    }
    ctx.accessToken = ctxFromDb.accessToken;
    ctx.cursor = ctxFromDb.cursor;
  }

  let cursor = ctx.cursor;
  let totalIds = [];
  let accounts = null;
  let pages = 0;

  while (pages < MAX_SYNC_PAGES) {
    pages += 1;
    let syncRes;
    try {
      syncRes = await plaid.syncTransactions(ctx.accessToken, { cursor });
    } catch (err) {
      log.error(`sync page ${pages} failed for item ${plaidItemId}: ${err.message}`);
      break;
    }

    // Cache the accounts list from the first page — Plaid returns it on
    // every response and it doesn't change mid-loop.
    if (!accounts) accounts = { accounts: syncRes.accounts || [] };

    const ids = await applySyncBatch(ctx.userId, syncRes, accounts);
    totalIds.push(...ids);

    cursor = syncRes.next_cursor;
    if (!syncRes.has_more) break;
  }

  await persistCursor(plaidItemId, cursor);
  await runDownstreamPipeline(ctx.userId, totalIds, { allowNudge });

  log.info(`sync done for item ${plaidItemId}: ${pages} pages, ${totalIds.length} tx`);
  return { inserted: totalIds.length, pages };
}

export { resolveItemContext };
