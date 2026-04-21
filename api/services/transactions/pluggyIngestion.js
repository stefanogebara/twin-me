/**
 * Pluggy Ingestion — Financial-Emotional Twin, Phase 3.1
 * =========================================================
 * Maps Pluggy's transaction payload onto our `user_transactions` schema and
 * chains the Phase 2 pipeline (recurrence detector → emotion tagger).
 *
 * Three entry points:
 *   - seedItemTransactions(userId, pluggyItemId) — called on item/created, pulls last 90d
 *   - ingestTransactionsByIds(userId, pluggyItemId, transactionIds) — called on transactions/created
 *   - ingestTransactions(userId, pluggyItemId, transactions) — raw path for tests
 *
 * Idempotency: we upsert on `pluggy_transaction_id` (unique index applied in
 * 20260421_pluggy_bank_connections.sql). Rerunning seed is safe.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { normalizeMerchant } from './merchantNormalizer.js';
import { detectAndMarkRecurring } from './recurrenceDetector.js';
import { tagTransactionsBatch } from './transactionEmotionTagger.js';
import * as pluggy from './pluggyClient.js';

const log = createLogger('pluggy-ingestion');

const SEED_WINDOW_DAYS = 90;

/**
 * Convert Pluggy's `type` + `amount` into our signed convention (negative = outflow).
 *
 * Pluggy conventions (per their Transaction schema):
 *   - `amount` is always positive
 *   - `type` = "DEBIT" (money out) or "CREDIT" (money in)
 *   - For credit card items, amount sign follows the bank's statement which
 *     is typically reversed — Pluggy normalizes this to DEBIT/CREDIT for us
 *
 * We want: negative = user spent money, positive = user received money.
 */
function signedAmount(pluggyTx) {
  const magnitude = Math.abs(Number(pluggyTx.amount) || 0);
  const type = String(pluggyTx.type || '').toUpperCase();
  // DEBIT = money leaving account = negative
  if (type === 'DEBIT') return -magnitude;
  // CREDIT = money arriving = positive
  if (type === 'CREDIT') return magnitude;
  // Fallback: trust Pluggy's sign
  return Number(pluggyTx.amount) || 0;
}

/**
 * Map Pluggy merchant → our (brand, category).
 * Pluggy pre-categorizes via their `category` and `merchant.name` fields.
 * We prefer Pluggy's merchant name as raw input, then pass through our
 * normalizer so downstream clustering (recurrence + patterns) keeps working.
 */
function mapMerchant(pluggyTx) {
  const merchantRaw =
    pluggyTx.merchant?.name ||
    pluggyTx.merchant?.businessName ||
    pluggyTx.description ||
    'unknown';
  const { brand, category } = normalizeMerchant(merchantRaw);
  return { merchantRaw, brand, category };
}

/**
 * Translate account type from Pluggy to our enum.
 * Pluggy account.type ∈ { BANK, CREDIT }; subtype narrows to CHECKING_ACCOUNT,
 * SAVINGS_ACCOUNT, CREDIT_CARD, etc.
 */
function mapAccountType(account) {
  const type = String(account?.type || '').toUpperCase();
  const subtype = String(account?.subtype || '').toUpperCase();
  if (type === 'CREDIT' || subtype.includes('CREDIT_CARD')) return 'credit_card';
  if (subtype.includes('SAVINGS')) return 'savings';
  return 'checking';
}

/**
 * Look up the owning user_id for a Pluggy item. Centralised so webhook and
 * cron paths share the same lookup + logging.
 */
async function resolveUserIdForItem(pluggyItemId) {
  const { data, error } = await supabaseAdmin
    .from('user_bank_connections')
    .select('user_id')
    .eq('pluggy_item_id', pluggyItemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    log.warn(`resolveUserIdForItem ${pluggyItemId}: ${error.message}`);
    return null;
  }
  return data?.user_id || null;
}

/**
 * Bulk-insert transactions with Pluggy-native idempotency.
 * Returns the ids of rows touched (inserted OR existing — upsert returns both).
 */
async function upsertTransactions(userId, pluggyAccountId, source, accountType, transactions) {
  if (!transactions.length) return [];

  const rows = transactions
    .map((t) => {
      if (!t.id || !t.date) return null;
      const { merchantRaw, brand, category } = mapMerchant(t);
      return {
        user_id: userId,
        pluggy_transaction_id: t.id,
        pluggy_account_id: pluggyAccountId,
        source,
        // external_id is required by the CSV-era unique index (user_id, external_id).
        // Reuse Pluggy's id so CSV + Pluggy can coexist without collision.
        external_id: `pluggy:${t.id}`,
        amount: signedAmount(t),
        currency: t.currencyCode || 'BRL',
        merchant_raw: merchantRaw,
        merchant_normalized: brand,
        category,
        transaction_date: t.date,
        source_bank: 'pluggy',
        account_type: accountType,
      };
    })
    .filter(Boolean);

  if (!rows.length) return [];

  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .upsert(rows, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    log.error(`upsert failed for user ${userId}: ${error.message}`);
    return [];
  }

  return (data || []).map((r) => r.id);
}

/**
 * Run the Phase 2 pipeline downstream of ingestion. Both steps are idempotent
 * and already gate internally when there's nothing to do. Errors are logged
 * and swallowed — we never want a tagger blip to fail a webhook 200.
 */
async function runDownstreamPipeline(userId, insertedIds) {
  try {
    await detectAndMarkRecurring(userId);
  } catch (err) {
    log.warn(`recurrence detector failed for user ${userId}: ${err.message}`);
  }
  if (insertedIds.length) {
    try {
      await tagTransactionsBatch(userId, insertedIds);
    } catch (err) {
      log.warn(`emotion tagger failed for user ${userId}: ${err.message}`);
    }
  }
}

/**
 * Seed the last 90d of transactions across every account on the item.
 * Called from the item/created webhook handler.
 */
export async function seedItemTransactions(userId, pluggyItemId) {
  if (!userId || !pluggyItemId) throw new Error('userId and pluggyItemId are required');

  const accounts = await pluggy.getAccounts(pluggyItemId);
  const accountList = accounts?.results || [];
  if (!accountList.length) {
    log.warn(`no accounts returned for item ${pluggyItemId}`);
    return { accounts: 0, inserted: 0 };
  }

  const today = new Date();
  const from = new Date(today.getTime() - SEED_WINDOW_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const allIds = [];
  for (const acc of accountList) {
    const accountType = mapAccountType(acc);
    const txs = await pluggy.getTransactions(acc.id, { from, to });
    const ids = await upsertTransactions(userId, acc.id, 'pluggy_sync', accountType, txs);
    allIds.push(...ids);
  }

  await runDownstreamPipeline(userId, allIds);

  log.info(`seeded item ${pluggyItemId}: ${accountList.length} accounts, ${allIds.length} tx`);
  return { accounts: accountList.length, inserted: allIds.length };
}

/**
 * Ingest a small set of transactions by id. Called from the transactions/created
 * webhook handler, which hands us an array of new transactionIds.
 *
 * Fetches each tx + resolves its account to derive account_type. Small N (typically
 * 1-5 per webhook), so sequential fetch keeps the code simple.
 */
export async function ingestTransactionsByIds(userId, pluggyItemId, transactionIds) {
  if (!Array.isArray(transactionIds) || !transactionIds.length) {
    return { inserted: 0 };
  }

  // Prefetch accounts once to avoid N duplicate account calls.
  const accounts = await pluggy.getAccounts(pluggyItemId);
  const accountIndex = new Map((accounts?.results || []).map((a) => [a.id, a]));

  const perAccount = new Map();
  for (const txId of transactionIds) {
    try {
      const tx = await pluggy.getTransaction(txId);
      if (!tx?.accountId) continue;
      if (!perAccount.has(tx.accountId)) perAccount.set(tx.accountId, []);
      perAccount.get(tx.accountId).push(tx);
    } catch (err) {
      log.warn(`fetch transaction ${txId} failed: ${err.message}`);
    }
  }

  const allIds = [];
  for (const [accountId, txs] of perAccount.entries()) {
    const accountType = mapAccountType(accountIndex.get(accountId));
    const ids = await upsertTransactions(userId, accountId, 'pluggy_webhook', accountType, txs);
    allIds.push(...ids);
  }

  await runDownstreamPipeline(userId, allIds);

  log.info(`ingested ${allIds.length}/${transactionIds.length} webhook tx for user ${userId}`);
  return { inserted: allIds.length };
}

export { resolveUserIdForItem };
