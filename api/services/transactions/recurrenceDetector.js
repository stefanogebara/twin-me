/**
 * Recurrence Detector
 * ====================
 * Separates recurring charges (Netflix monthly, gym membership, Friday iFood
 * habit) from genuine one-off impulses. Needed because the stress-shop
 * detector was flagging any discretionary charge on a high-stress day — but
 * a subscription bill happens regardless of how stressed you are that day.
 *
 * Heuristic: a transaction is recurring if the same user has 3+ charges to
 * the same merchant_normalized, with amounts clustered within ±20% of the
 * median, across the last 120 days.
 *
 * Pure SQL + JS aggregation. No LLM.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { DEFAULT_CURRENCY } from '../../config/financialThresholds.js';

const log = createLogger('recurrence-detector');

const WINDOW_DAYS = 120;
const MIN_OCCURRENCES = 3;
const AMOUNT_STDDEV_THRESHOLD = 0.20; // 20% coefficient of variation

/**
 * Detect recurring charges across all of a user's transactions and update
 * the `is_recurring` flag. Idempotent — safe to run after every upload or retag.
 *
 * Only considers transactions with a non-null `merchant_normalized` — the
 * grouping key. Transactions where the normalizer couldn't match a brand
 * stay marked non-recurring (we can't cluster unknown strings reliably).
 *
 * @returns {{ scanned: number, marked_recurring: number, groups: number }}
 */
export async function detectAndMarkRecurring(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('user_transactions')
    .select('id, merchant_normalized, amount, currency, transaction_date, is_recurring')
    .eq('user_id', userId)
    .lt('amount', 0) // outflows only
    .not('merchant_normalized', 'is', null)
    .gte('transaction_date', since);

  if (error) {
    log.warn(`fetch failed for user ${userId}: ${error.message}`);
    return { scanned: 0, marked_recurring: 0, groups: 0 };
  }

  if (!rows?.length) return { scanned: 0, marked_recurring: 0, groups: 0 };

  // Group by (merchant_normalized, currency). Cross-currency merchants
  // (e.g. Netflix BR R$55 + Netflix ES €13) are separate groups so each
  // can qualify as recurring independently — the amount CV threshold makes
  // no sense across currencies.
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.merchant_normalized}|${(r.currency || DEFAULT_CURRENCY).toUpperCase()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const recurringIds = [];
  const nonRecurringIds = [];
  let recurringGroupCount = 0;

  for (const [merchant, txs] of groups.entries()) {
    if (txs.length < MIN_OCCURRENCES) {
      // Can't be recurring without 3+ occurrences
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }

    // Amount clustering: coefficient of variation < threshold
    const amounts = txs.map(t => Math.abs(t.amount));
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (mean === 0) {
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);
    const cv = stddev / mean;

    if (cv <= AMOUNT_STDDEV_THRESHOLD) {
      // Same merchant + tight amount clustering + 3+ occurrences = recurring
      recurringGroupCount++;
      for (const t of txs) recurringIds.push(t.id);
    } else {
      // Same merchant but varied amounts (e.g. different iFood restaurants) = one-off
      for (const t of txs) nonRecurringIds.push(t.id);
    }
  }

  // Apply updates in two batches. Skip no-op writes.
  const toMarkRecurring = recurringIds.filter(id => {
    const r = rows.find(x => x.id === id);
    return r && !r.is_recurring;
  });
  const toMarkNonRecurring = nonRecurringIds.filter(id => {
    const r = rows.find(x => x.id === id);
    return r && r.is_recurring;
  });

  if (toMarkRecurring.length > 0) {
    const { error: e1 } = await supabaseAdmin
      .from('user_transactions')
      .update({ is_recurring: true })
      .in('id', toMarkRecurring);
    if (e1) log.warn(`mark recurring failed: ${e1.message}`);
  }
  if (toMarkNonRecurring.length > 0) {
    const { error: e2 } = await supabaseAdmin
      .from('user_transactions')
      .update({ is_recurring: false })
      .in('id', toMarkNonRecurring);
    if (e2) log.warn(`mark non-recurring failed: ${e2.message}`);
  }

  log.info(
    `user ${userId}: scanned ${rows.length} tx across ${groups.size} merchants; ` +
    `${recurringGroupCount} recurring groups; +${toMarkRecurring.length}/-${toMarkNonRecurring.length} flags updated`,
  );

  return {
    scanned: rows.length,
    marked_recurring: toMarkRecurring.length,
    unmarked_recurring: toMarkNonRecurring.length,
    groups: groups.size,
    recurring_groups: recurringGroupCount,
  };
}
