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
import { detectAndMarkRecurring } from './recurrenceDetector.js';
import {
  signedAmount,
  mapMerchant,
  mapAccountType,
  mapInvestmentType,
} from './plaidMappers.js';
import { tagTransactionsBatch } from './transactionEmotionTagger.js';
import { PLAID_SANDBOX_INSTITUTION_IDS } from './sandboxGuard.js';
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
// signedAmount, mapMerchant, mapAccountType imported from ./plaidMappers.js

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

  // Dual-write material transactions into the memory stream so the twin
  // can talk about them. Includes BOTH spending (negative amounts) AND
  // investment sells/dividends (positive amounts, account_type='investment')
  // because the moat is the cross-domain pattern: "you sold AAPL three
  // times this month on low-recovery days". Spending stays floored at
  // MEMORY_MIN_AMOUNT; investment events land regardless of direction
  // since even a small sell is signal for the emotional-context join.
  try {
    const { data: txRows } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        id, amount, currency, merchant_normalized, merchant_raw, category,
        transaction_date, account_type,
        emotional_context:transaction_emotional_context (
          computed_stress_score, emotion_label, recovery_score
        )
      `)
      .in('id', insertedIds)
      .eq('user_id', userId);

    const material = (txRows || []).filter((r) => {
      const abs = Math.abs(Number(r.amount) || 0);
      if (r.account_type === 'investment') return abs >= 10; // any non-trivial investment event
      return Number(r.amount) < 0 && abs >= MEMORY_MIN_AMOUNT; // spending floor stays
    });

    await Promise.all(
      material.map((r) => {
        const merchant = r.merchant_normalized || r.merchant_raw || 'unknown';
        const ccy = r.currency || 'USD';
        const amount = Number(r.amount) || 0;
        const amountStr = new Intl.NumberFormat('en-US', {
          style: 'currency', currency: ccy,
        }).format(Math.abs(amount));
        const date = (r.transaction_date || '').slice(0, 10) || 'unknown date';
        const ec = r.emotional_context;
        // Build a richer emotion note for investment events — recovery score
        // is the moat signal. For spending events keep the existing phrasing.
        const emotionParts = [];
        if (ec?.recovery_score != null && r.account_type === 'investment') {
          emotionParts.push(`Whoop recovery ${Math.round(ec.recovery_score)}%`);
        }
        if (ec?.emotion_label) emotionParts.push(ec.emotion_label);
        if (ec?.computed_stress_score != null) emotionParts.push(`stress ${Math.round(ec.computed_stress_score * 100)}%`);
        const emotionNote = emotionParts.length ? `; emotional context: ${emotionParts.join(', ')}` : '';

        let content;
        if (r.account_type === 'investment') {
          const action = (r.category || '').replace(/^investment_/, '').split('_')[0] || 'traded';
          // amount > 0 = cash arrived (sell / dividend), amount < 0 = cash out (buy)
          const verb = action === 'sell' ? 'Sold' : action === 'buy' ? 'Bought' : action === 'dividend' ? 'Received dividend on' : action === 'fee' ? 'Paid fee on' : `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
          content = `${verb} ${amountStr} of ${merchant} on ${date}${emotionNote}.`;
        } else {
          content = `Spent ${amountStr} at ${merchant} on ${date}${emotionNote}.`;
        }
        return addPlatformObservation(userId, content, 'plaid', {
          category: r.category,
          source_tx_id: r.id,
          account_type: r.account_type,
        }).catch((err) => log.warn(`memory write failed for tx ${r.id}: ${err.message}`));
      }),
    );

    if (material.length) {
      const spend = material.filter(r => r.account_type !== 'investment').length;
      const invest = material.filter(r => r.account_type === 'investment').length;
      log.info(`wrote ${material.length} tx observations to memory stream for user ${userId} (spend=${spend}, invest=${invest})`);
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
    // replan-2026-06-10 Track D P0: stamp sandbox items at link time so the
    // render guard (sandboxGuard.js) can exclude them in production runtimes
    // even when getItem failed and institutionId is null.
    is_sandbox: (process.env.PLAID_ENV || 'sandbox').toLowerCase() === 'sandbox'
      || PLAID_SANDBOX_INSTITUTION_IDS.has(institutionId),
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

  // 4. Investment-transactions seed (1-year lookback). Fire-and-forget so a
  //    slow Plaid sandbox doesn't push the exchange call past Vercel's 60s
  //    function budget. Failures are non-fatal — the daily cron will catch
  //    up. Empty result for items without the investments product is fine.
  syncInvestmentTransactions(userId, plaidItemId, { isBootstrap: true }).catch((err) => {
    log.warn(`investments seed failed for ${plaidItemId} (non-fatal): ${err.message}`);
  });

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

/**
 * Phase 2 of the Plaid integration — investment-transactions ingestion.
 *
 * Pulls /investments/transactions for an item and persists each buy / sell /
 * dividend / fee event into the SAME `user_transactions` table that the
 * Phase 2 emotion tagger already operates on. By tagging account_type =
 * 'investment' and category = 'investment_<type>', we get the emotional-
 * context join (Whoop recovery, music valence, calendar load) for FREE on
 * every investment event — that's the differentiated 'sold at the bottom
 * of a recovery dip' surface ChatGPT Personal Finance can't draw.
 *
 * Amount sign convention: Plaid sends positive=cash-leaving-account (a
 * buy spends cash) and negative=cash-arriving (a sell credits cash). Our
 * convention is negative=outflow, positive=inflow — so signedAmount()
 * flips Plaid's sign and we land in the right place.
 *
 * Idempotency: same (user_id, external_id) upsert pattern as regular tx;
 * external_id = `plaid_inv:<investment_transaction_id>` so the spending
 * and investing tx never collide.
 */
const INVESTMENT_LOOKBACK_DAYS = 365; // First-time bootstrap pulls 1 year of activity
const INVESTMENT_PAGE_SIZE = 250;     // Plaid caps at 500; we paginate generously
const INVESTMENT_MAX_PAGES = 20;

// mapInvestmentType imported from ./plaidMappers.js

async function upsertInvestmentTransactions(userId, plaidAccountId, accountCurrency, transactions, securitiesIndex) {
  if (!transactions.length) return [];

  const rows = transactions
    .map((t) => {
      if (!t.investment_transaction_id || !t.date) return null;
      const sec = securitiesIndex.get(t.security_id);
      const ticker = sec?.ticker_symbol || null;
      const securityName = sec?.name || t.name || 'Unknown security';
      // For investment events the most natural "merchant" is the security
      // (ticker / name) — keeps the existing memory-stream surface readable
      // ("Spent $1,234 at AAPL on May 5"). Category carries the buy/sell/
      // dividend semantic for filtering.
      const merchantRaw = ticker ? `${ticker} — ${securityName}` : securityName;
      const merchantNormalized = ticker || securityName;
      return {
        user_id: userId,
        plaid_transaction_id: t.investment_transaction_id,
        plaid_account_id: plaidAccountId,
        source: 'plaid_investments_sync',
        external_id: `plaid_inv:${t.investment_transaction_id}`,
        amount: -(Number(t.amount) || 0),     // Plaid +=cash out → our -=outflow
        currency: t.iso_currency_code || t.unofficial_currency_code || accountCurrency || 'USD',
        merchant_raw: merchantRaw,
        merchant_normalized: merchantNormalized,
        category: mapInvestmentType(t.type, t.subtype),
        transaction_date: t.date,
        source_bank: 'plaid',
        account_type: 'investment',
      };
    })
    .filter(Boolean);

  if (!rows.length) return [];

  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    log.error(`investment-tx upsert failed for user ${userId}: ${error.message}`);
    return [];
  }
  return (data || []).map((r) => r.id);
}

/**
 * Pull investment transactions for a single Plaid item over [startDate, endDate]
 * and persist them. Returns the count of newly-touched rows so the caller can
 * gate downstream pipeline runs.
 *
 * Plaid investment-tx history depth varies by institution (typically 24 months
 * available); we cap our seed window at INVESTMENT_LOOKBACK_DAYS on bootstrap
 * and let subsequent syncs catch only the trailing 30 days for delta updates.
 */
export async function syncInvestmentTransactions(userId, plaidItemId, { isBootstrap = false } = {}) {
  if (!userId || !plaidItemId) throw new Error('syncInvestmentTransactions: userId + plaidItemId required');

  const ctx = await resolveItemContext(plaidItemId);
  if (!ctx?.accessToken) {
    log.warn(`syncInvestmentTransactions: no access_token for item ${plaidItemId}`);
    return { inserted: 0 };
  }

  const today = new Date();
  const startDays = isBootstrap ? INVESTMENT_LOOKBACK_DAYS : 30;
  const startDate = new Date(today.getTime() - startDays * 86400_000).toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  let offset = 0;
  let pages = 0;
  const totalIds = [];
  let accountsIndex = null;
  let securitiesIndex = null;

  while (pages < INVESTMENT_MAX_PAGES) {
    pages += 1;
    let resp;
    try {
      resp = await plaid.getInvestmentTransactions(ctx.accessToken, {
        startDate, endDate, count: INVESTMENT_PAGE_SIZE, offset,
      });
    } catch (err) {
      // Most common cause when an institution doesn't support /investments
      // for this item: PRODUCT_NOT_READY or INVALID_PRODUCT. Non-fatal —
      // checking-only items don't have investment activity.
      log.info(`investments/transactions page ${pages} unavailable for ${plaidItemId}: ${err.plaidErrorCode || err.message}`);
      break;
    }

    const accounts = resp.accounts || [];
    const securities = resp.securities || [];
    if (!accountsIndex) accountsIndex = new Map(accounts.map(a => [a.account_id, a]));
    if (!securitiesIndex) securitiesIndex = new Map(securities.map(s => [s.security_id, s]));

    const txs = resp.investment_transactions || [];
    if (!txs.length) break;

    // Group by account so currency lookup runs once per account, not per tx
    const byAccount = new Map();
    for (const t of txs) {
      if (!byAccount.has(t.account_id)) byAccount.set(t.account_id, []);
      byAccount.get(t.account_id).push(t);
    }

    for (const [accountId, accountTxs] of byAccount.entries()) {
      const acc = accountsIndex.get(accountId);
      const ccy = acc?.balances?.iso_currency_code || acc?.balances?.unofficial_currency_code || 'USD';
      const ids = await upsertInvestmentTransactions(userId, accountId, ccy, accountTxs, securitiesIndex);
      totalIds.push(...ids);
    }

    offset += txs.length;
    if (offset >= (resp.total_investment_transactions || offset)) break;
  }

  // Run the SAME downstream pipeline as regular tx — that's the moat. The
  // emotion tagger will join each investment event with Whoop / music /
  // calendar signals at the event's date. Nudges are skipped: a sell that
  // happened 6 months ago shouldn't trigger a 'don't shop stressed' nudge.
  await runDownstreamPipeline(userId, totalIds, { allowNudge: false });

  // Phase 4.3: targeted correlation generator. Deterministic, no LLM,
  // runs ONLY on investment activity + emotional context. Surfaces the
  // moat insight ('5 of 7 sells were on low-recovery days') as a
  // proactive_insights row that shows up on the dashboard automatically,
  // without the user needing to ask the twin. Self-throttled by 48h
  // cooldown so re-syncing the same item doesn't generate dup insights.
  if (totalIds.length > 0) {
    try {
      const { generateInvestmentCorrelationInsights } = await import('../investmentCorrelationInsights.js');
      const result = await generateInvestmentCorrelationInsights(userId);
      log.info(`investment-correlation insights for user ${userId}: ${result.stored} stored${result.reason ? ` (${result.reason})` : ''}`);
    } catch (err) {
      // Non-fatal — the existing generic insight generator still runs via
      // observationIngestion. Log + continue.
      log.warn(`investment-correlation generation failed for user ${userId}: ${err.message}`);
    }
  }

  log.info(`investments sync done for item ${plaidItemId}: ${pages} pages, ${totalIds.length} events`);
  return { inserted: totalIds.length, pages };
}

export { resolveItemContext };
