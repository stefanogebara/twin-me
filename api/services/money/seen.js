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

/** @returns {Promise<Record<string, string[]>>} transaction id -> sources, sorted, distinct */
export async function seenBy(userId, { limit = 20000 } = {}) {
  if (!userId) throw new Error('userId required');
  const { data, error } = await supabaseAdmin.from('money_sightings')
    .select('transaction_id, source').eq('user_id', userId).not('transaction_id', 'is', null).limit(limit);
  if (error) throw new Error(`Cannot read the sightings: ${error.message}`);
  return fold(data || []);
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
