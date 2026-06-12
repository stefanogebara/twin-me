/**
 * Sandbox Render Guard — replan-2026-06-10 Track D P0
 * =====================================================
 * On 2026-06-10 the live /money page was rendering 644 Plaid SANDBOX
 * transactions (ins_109508 "First Platypus Bank", +1,234,467% P&L) as real
 * money. The data purge is a separate operation; this module is the
 * permanent guard: when the runtime is production-grade (NODE_ENV=production
 * or PLAID_ENV != sandbox), connections and transactions that originate from
 * a Plaid sandbox item must never reach user-facing responses.
 *
 * Sandbox-ness is derived two ways (belt and suspenders):
 *   - stored `is_sandbox` flag on user_bank_connections (set at link time
 *     by plaidIngestion when PLAID_ENV=sandbox);
 *   - the well-known Plaid sandbox institution ids, which cover rows created
 *     before the flag existed.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('sandbox-guard');

// Plaid's canonical sandbox test institutions (First Platypus Bank et al).
// These ids only ever exist in sandbox — a production item can never carry one.
export const PLAID_SANDBOX_INSTITUTION_IDS = new Set([
  'ins_109508', // First Platypus Bank
  'ins_109509', // First Gingham Credit Union
  'ins_109510', // Tattersall Federal Credit Union
  'ins_109511', // Tartan Bank
  'ins_109512', // Houndstooth Bank
]);

/**
 * True when sandbox data must be hidden from user-facing responses:
 * production deploys always, and any deploy whose Plaid runtime is not
 * sandbox (a production-Plaid runtime cannot have produced sandbox rows,
 * so any present are stale pollution).
 */
export function shouldHideSandboxData(env = process.env) {
  if (env.NODE_ENV === 'production') return true;
  return (env.PLAID_ENV || 'sandbox').toLowerCase() !== 'sandbox';
}

/** True when a user_bank_connections row is a Plaid sandbox item. */
export function isSandboxConnection(row) {
  if (!row) return false;
  if (row.is_sandbox === true) return true;
  return row.provider === 'plaid' && PLAID_SANDBOX_INSTITUTION_IDS.has(row.plaid_institution_id);
}

/**
 * Per-user sandbox state for the money routes.
 *
 * Returns:
 *   hideActive               — shouldHideSandboxData() for this runtime
 *   sandboxConnectionIds     — Set of user_bank_connections.id flagged sandbox
 *                              (soft-deleted rows included: their transactions
 *                              survive deletion and must stay hidden)
 *   excludePlaidTransactions — true when plaid-sourced user_transactions rows
 *                              must be filtered out. user_transactions has no
 *                              connection FK, so this is conservative: exclude
 *                              unless at least one NON-sandbox Plaid connection
 *                              exists for the user (honest empty beats fake full).
 */
export async function getPlaidSandboxState(userId) {
  const hideActive = shouldHideSandboxData();
  if (!hideActive || !userId) {
    return { hideActive, sandboxConnectionIds: new Set(), excludePlaidTransactions: false };
  }

  let rows = null;
  // is_sandbox ships in migration 20260610_bank_connection_is_sandbox.sql; if
  // a deploy races the migration, retry without the column rather than 500ing
  // every money endpoint. Fallback still catches the known sandbox institutions.
  const { data, error } = await supabaseAdmin
    .from('user_bank_connections')
    .select('id, provider, plaid_institution_id, is_sandbox')
    .eq('user_id', userId)
    .eq('provider', 'plaid');
  if (error) {
    const { data: retryData, error: retryError } = await supabaseAdmin
      .from('user_bank_connections')
      .select('id, provider, plaid_institution_id')
      .eq('user_id', userId)
      .eq('provider', 'plaid');
    if (retryError) {
      // Fail closed: with no way to prove a live Plaid connection exists,
      // treat plaid rows as sandbox-era. Visible in logs, not to attackers.
      log.error(`sandbox state lookup failed for user ${userId}: ${retryError.message}`);
      return { hideActive, sandboxConnectionIds: new Set(), excludePlaidTransactions: true };
    }
    rows = retryData;
  } else {
    rows = data;
  }

  const sandboxConnectionIds = new Set(
    (rows || []).filter(isSandboxConnection).map((r) => r.id),
  );
  const hasLivePlaid = (rows || []).some((r) => !isSandboxConnection(r));

  return { hideActive, sandboxConnectionIds, excludePlaidTransactions: !hasLivePlaid };
}

/**
 * Apply the plaid-row exclusion to a user_transactions query builder.
 * source_bank is nullable (CSV uploads predate the column being mandatory),
 * and PostgREST drops NULL rows on a bare neq — keep them explicitly.
 */
export function excludePlaidRows(query) {
  return query.or('source_bank.neq.plaid,source_bank.is.null');
}
