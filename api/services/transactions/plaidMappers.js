/**
 * Pure mappers between Plaid wire shapes and our DB conventions.
 *
 * Extracted from plaidIngestion.js so unit tests can exercise the
 * shape-conversion logic without booting supabaseAdmin / encryption /
 * the Plaid SDK at module load.
 *
 * These functions are intentionally:
 *   - Pure: same inputs → same outputs, no I/O, no side effects.
 *   - Defensive: every input shape that Plaid has ever sent us is
 *     handled (including the "subtype is null" and "amount is a string"
 *     edge cases that hit prod in 2026-04).
 *
 * Sign convention note for signedAmount:
 *   - Plaid: positive amount = money LEAVING the account (debit).
 *     A $42.31 grocery purchase shows up as amount: 42.31.
 *     Refunds and deposits are negative.
 *   - Ours: negative = outflow, positive = inflow.
 *   - So we flip the sign. Documented in Plaid docs: "Amounts are
 *     positive when money is removed from the account; negative when
 *     money is being added."
 */
import { normalizeMerchant } from './merchantNormalizer.js';

/**
 * Flip Plaid's debit-positive sign convention into our inflow-positive one.
 * Returns 0 when the amount is missing or non-finite — caller decides
 * whether to filter; we don't drop rows here.
 */
export function signedAmount(plaidTx) {
  const raw = Number(plaidTx?.amount);
  if (!Number.isFinite(raw)) return 0;
  // `-raw || 0` collapses the -0 case to +0 — `-0` is falsy, so the OR
  // picks `0`. Any nonzero finite raw flows through unchanged.
  return -raw || 0;
}

/**
 * Plaid merchant → our (merchantRaw, brand, category). Prefers the
 * cleaned `merchant_name` field when present, otherwise falls back to
 * the raw `name` then the legacy `original_description`. The brand +
 * category are derived by the shared normalizeMerchant.
 */
export function mapMerchant(plaidTx) {
  const merchantRaw =
    plaidTx?.merchant_name ||
    plaidTx?.name ||
    plaidTx?.original_description ||
    'unknown';
  const { brand, category } = normalizeMerchant(merchantRaw);
  return { merchantRaw, brand, category };
}

/**
 * Plaid account.type ∈ { depository, credit, loan, investment, brokerage,
 * other }; subtype narrows further (checking, savings, credit card, etc.).
 * Map to our enum: checking | savings | credit_card | investment.
 *
 * Default is 'checking' rather than throwing — keeps the row in the DB
 * (where it surfaces in the UI as a checking-style line) instead of
 * silently dropping the connection on a Plaid schema change.
 */
export function mapAccountType(account) {
  const type = String(account?.type || '').toLowerCase();
  const subtype = String(account?.subtype || '').toLowerCase();
  if (type === 'credit' || subtype.includes('credit card')) return 'credit_card';
  if (subtype === 'savings') return 'savings';
  if (subtype === 'checking') return 'checking';
  if (type === 'investment' || type === 'brokerage') return 'investment';
  return 'checking';
}

/**
 * Plaid investment_transactions.type ∈ { buy, sell, cash, fee, transfer, cancel }.
 * subtype narrows further (e.g. type=buy + subtype=purchased = a plain purchase).
 * Our category convention keeps the prefix for filtering + the type for analytics.
 *
 * @returns {string} e.g. "investment_buy_purchased", "investment_sell", "investment_unknown"
 */
export function mapInvestmentType(type, subtype) {
  const safeType = String(type || 'unknown').toLowerCase();
  const safeSubtype = String(subtype || '').toLowerCase();
  return safeSubtype ? `investment_${safeType}_${safeSubtype}` : `investment_${safeType}`;
}
