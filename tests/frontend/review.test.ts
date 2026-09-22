/** The review is the week's heaviest spending without a verdict, five at most, largest first. */
import { describe, expect, it } from 'vitest';
import { reviewRows, groupReviewRows } from '../../src/pages/money/review';
import type { MoneyTransaction } from '../../src/services/api/moneyAPI';

const now = new Date('2026-09-20T12:00:00Z');
const row = (id: string, amount: number, daysAgo: number, extra: Partial<MoneyTransaction> = {}): MoneyTransaction => ({
  id, amount, occurred_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(), posted_at: null, currency: 'EUR', merchant_raw: id, merchant_key: id, merchant_name: null, category: null, channel: null, card_last4: null, is_recurring: false, verdict: null, ...extra,
});

describe('reviewRows', () => {
  it('takes the largest spending of the last seven days without a verdict, five at most', () => {
    const ledger = [row('a', -5, 1), row('b', -90, 2), row('c', -40, 3), row('d', -60, 8), row('e', 300, 1), row('f', -70, 1, { verdict: 'worth_it' }), row('g', -50, 4, { is_recurring: true }), row('h', -30, 5, { currency: 'USD' }), row('i', -20, 6), row('j', -25, 0), row('k', -22, 2)];
    expect(reviewRows(ledger, now).map((r) => r.id)).toEqual(['b', 'c', 'j', 'k', 'i']);
  });
  it('is empty when the week has nothing left to judge', () => {
    expect(reviewRows([row('a', -5, 9), row('b', -9, 1, { verdict: 'not_me' })], now)).toEqual([]);
  });
});

describe('groupReviewRows', () => {
  it('folds identical payments into one row that says how many, and keeps each for the verdict', () => {
    const a = { ...row('a', -15, 3), merchant_raw: 'Hayque Capital' };
    const b = { ...row('b', -15, 3), merchant_raw: 'Hayque Capital' };
    const c = { ...row('c', -22.47, 1), merchant_raw: 'La Fruteria' };
    const grouped = groupReviewRows([c, a, b]);
    /* Largest first after folding: the two of 15,00 make 30,00 and rise above 22,47. */
    expect(grouped.map((g) => [g.name, g.amount, g.rows.length])).toEqual([['Hayque Capital', 30, 2], ['La Fruteria', 22.47, 1]]);
  });
  it('keeps the same place on different days apart', () => {
    const a = { ...row('a', -15, 3), merchant_raw: 'Hayque Capital' };
    const b = { ...row('b', -15, 2), merchant_raw: 'Hayque Capital' };
    expect(groupReviewRows([a, b])).toHaveLength(2);
  });
});
