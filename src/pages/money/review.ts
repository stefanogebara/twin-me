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
    .filter((t) => { const at = new Date(t.occurred_at).getTime(); return Number.isFinite(at) && at >= since && at <= now.getTime() + 60000; })
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, max);
}
