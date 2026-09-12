/**
 * One rule for what counts as spending. It once lived inside the forecast alone, and the
 * hero and the reading under it disagreed by exactly one friend's transfer.
 */
import { describe, it, expect } from 'vitest';
import { spendingRule, markCounted, isOutflow, personRoles } from '../../../../api/services/money/spending.js';
import { monthSegments, readLedger } from '../../../../api/services/money/analyst.js';

const t = (id, occurred_at, amount, merchant_key, extra = {}) => ({ id, occurred_at, amount, merchant_key, merchant_raw: merchant_key, channel: 'card', ...extra });
const facts = [
  { kind: 'person', subject: 'rafaella van der graaff', value: 'friend' },
  { kind: 'person', subject: 'landlord sl', value: 'landlord' },
];
const rows = [
  t('a', '2026-09-07T10:00:00Z', -116.76, 'el corte ingles'),
  t('b', '2026-09-04T10:00:00Z', -49.25, 'rafaella van der graaff', { channel: 'transfer' }),
  t('c', '2026-09-03T10:00:00Z', -600, 'landlord sl', { channel: 'transfer' }),
  t('d', '2026-09-02T10:00:00Z', 15.15, 'bizum in', { channel: 'bizum' }),
  t('e', '2026-09-01T10:00:00Z', -4, 'frederico', { channel: 'transfer' }),
];

describe('spendingRule', () => {
  it('sets aside a transfer to a friend, keeps the landlord, and keeps a stranger', () => {
    const counts = spendingRule(facts);
    expect(counts(rows[0])).toBe(true);
    expect(counts(rows[1])).toBe(false);
    expect(counts(rows[2])).toBe(true);
    expect(counts(rows[4])).toBe(true);
  });
  it('counts everything when nothing has been said', () => {
    expect(rows.every(spendingRule([]))).toBe(true);
    expect(personRoles(undefined).size).toBe(0);
  });
  it('marks rows once so every reader agrees', () => {
    const marked = markCounted(rows, facts);
    expect(marked.map((r) => r.counts)).toEqual([true, false, true, true, true]);
    expect(marked.filter(isOutflow).map((r) => r.id)).toEqual(['a', 'c', 'e']);
  });
});

describe('the month, with the rule', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  it('keeps the transfer as a line of the month and no part of its sum', () => {
    const [sep] = monthSegments(rows, now, spendingRule(facts));
    expect(sep.lines).toBe(5);
    expect(sep.spent).toBeCloseTo(720.76, 2);
    expect(sep.received).toBe(15.15);
    const [plain] = monthSegments(rows, now);
    expect(plain.spent).toBeCloseTo(770.01, 2);
  });
  it('never names a set-aside transfer as the biggest payment', () => {
    const only = [rows[1], t('f', '2026-09-05T10:00:00Z', -9.5, 'oakberry')];
    const { segments } = readLedger({ transactions: only, now, isSpending: spendingRule(facts) });
    expect(segments[0].biggest.merchant).toBe('oakberry');
  });
});
