/**
 * The user_transactions table's two readers that stay (audit M2-D, 2026-09-22): the phone's
 * purchase notification writes a line, and the statement nag asks who has fresh ones. The
 * money product's ledger is money_transactions; this is the earlier table the phone channel
 * still writes to.
 */
import { supabaseAdmin } from '../database.js';

/** Upsert on the person and the external id; answers the ids written. */
export function upsertUserTransactions(rows) {
  return supabaseAdmin.from('user_transactions').upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false }).select('id');
}
/** Who among these people has a transaction dated on or after the cutoff. */
export function usersWithTransactionsSince(userIds, cutoffIso) {
  return supabaseAdmin.from('user_transactions').select('user_id').in('user_id', userIds).gte('transaction_date', cutoffIso);
}
