/**
 * Which sources saw each payment (idea 3 of 2026-09-19: reconciliation you can see).
 *
 * Every competitor merges its sources silently, and silent sync breakage is the first reason
 * people quit. A transaction is the reconciled fact; the sightings under it are what each
 * channel saw. This hands the page, per transaction, the sorted list of sources that saw it,
 * so a row can say "seen by the bank and your phone" or "phone only, not yet booked" in one
 * grey line. Computed from money_sightings, nothing guessed.
 */
import { supabaseAdmin } from '../database.js';
import { hasRealTime } from './clock.js';

/** @returns {Promise<Record<string, string[]>>} transaction id -> sources, sorted, distinct */
export async function seenBy(userId, { limit = 20000 } = {}) {
  if (!userId) throw new Error('userId required');
  const { data, error } = await supabaseAdmin.from('money_sightings')
    .select('transaction_id, source').eq('user_id', userId).not('transaction_id', 'is', null).limit(limit);
  if (error) throw new Error(`Cannot read the sightings: ${error.message}`);
  return fold(data || []);
}

/**
 * What each source has actually given, and what it cannot give (2026-09-21). A sources page
 * that says "connected" hides the interesting half: the bank has sent 216 payments and the
 * hour of none of them, the phone has sent nothing at all.
 */
export async function sourceCounts(userId, { now = new Date() } = {}) {
  if (!userId) throw new Error('userId required');
  const [sight, tx] = await Promise.all([
    supabaseAdmin.from('money_sightings').select('source').eq('user_id', userId),
    supabaseAdmin.from('money_transactions').select('occurred_at, merchant_raw').eq('user_id', userId).lt('amount', 0)
      .gte('occurred_at', new Date(now.getTime() - 30 * 86400000).toISOString()),
  ]);
  if (sight.error) throw new Error(`Cannot read the sightings: ${sight.error.message}`);
  const by = {};
  for (const r of sight.data || []) if (r?.source) by[r.source] = (by[r.source] || 0) + 1;
  const rows = tx.data || [];
  return {
    by,
    month: { payments: rows.length, named: rows.filter((t) => t.merchant_raw).length, timed: rows.filter(hasRealTime).length },
  };
}

/** Pure: rows of { transaction_id, source } to the per-transaction sorted source list. */
export function fold(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!r.transaction_id || !r.source) continue;
    if (!by.has(r.transaction_id)) by.set(r.transaction_id, new Set());
    by.get(r.transaction_id).add(r.source);
  }
  return Object.fromEntries([...by.entries()].map(([id, s]) => [id, [...s].sort()]));
}
