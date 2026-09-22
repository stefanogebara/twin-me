/**
 * Ninety seconds, not a ledger scroll (idea 5 of 2026-09-19). The manual review ritual is
 * what changes behaviour (YNAB, the HN threads), and its cost is the scroll. This picks the
 * few payments that weighed most on the week and still have no verdict, so the review is
 * five presses. Pure: the ledger in, the rows out.
 */
import type { MoneyTransaction } from '../../services/api/moneyAPI';

export const REVIEW_DAYS = 7;
export const REVIEW_MAX = 5;

export function reviewRows(ledger: MoneyTransaction[], now = new Date(), { days = REVIEW_DAYS, max = REVIEW_MAX } = {}): MoneyTransaction[] {
  const since = now.getTime() - days * 86400000;
  return ledger
    .filter((t) => Number(t.amount) < 0 && !t.verdict && (!t.currency || t.currency === 'EUR') && !t.is_recurring)
    /* "Was it worth it?" about a payment the bank sent without a name cannot be answered:
       two of the five rows were "a payment without a name" (2026-09-21). */
    .filter((t) => { const n = String(t.merchant_name || t.merchant_raw || '').trim(); return n !== '' && !/^unknown$/i.test(n); })
    .filter((t) => { const at = new Date(t.occurred_at).getTime(); return Number.isFinite(at) && at >= since && at <= now.getTime() + 60000; })
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, max);
}

/** One row per payment, or per set of identical payments. */
export type ReviewRow = { id: string; rows: MoneyTransaction[]; name: string; amount: number; occurred_at: string };

/**
 * Two identical adjacent rows look like a bug on a screen whose promise is that it
 * understands the money (2026-09-22): the same place, the same day, the same figure are one
 * row saying "2 payments", and a verdict on it is a verdict on each. Pure.
 */
export function groupReviewRows(rows: MoneyTransaction[]): ReviewRow[] {
  const out = new Map<string, ReviewRow>();
  for (const t of rows) {
    const name = String(t.merchant_name || t.merchant_raw || '').trim();
    const key = `${name.toLowerCase()}|${Math.abs(Number(t.amount)).toFixed(2)}|${String(t.occurred_at).slice(0, 10)}`;
    const got = out.get(key);
    if (got) { got.rows.push(t); got.amount += Math.abs(Number(t.amount)); continue; }
    out.set(key, { id: t.id, rows: [t], name, amount: Math.abs(Number(t.amount)), occurred_at: t.occurred_at });
  }
  /* Largest first, after folding: two of 15,00 are 30,00 and belong above 22,47 (2026-09-22). */
  return [...out.values()].sort((a, b) => b.amount - a.amount);
}
