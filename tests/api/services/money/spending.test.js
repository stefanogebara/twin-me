/**
 * One rule for what counts as spending. It once lived inside the forecast alone, and the
 * hero and the reading under it disagreed by exactly one friend's transfer.
 */
import { describe, it, expect } from 'vitest';
import { spendingRule, markCounted, isOutflow, personRoles, roleOf } from '../../../../api/services/money/spending.js';
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

describe('the person the rent goes to', () => {
  it('reads as the landlord once the rent question was answered rent, and the transfer counts as spending', async () => {
    const { personRoles, spendingRule } = await import('../../../../api/services/money/spending.js');
    const facts = [
      { kind: 'person', subject: 'ana lopez', value: 'flatmate' },
      { kind: 'commitment', subject: 'ana lopez', value: 'rent', amount: 150, day: 1 },
    ];
    expect(personRoles(facts).get('ana lopez')).toBe('landlord');
    expect(spendingRule(facts)({ merchant_key: 'ana lopez', channel: 'bizum', amount: -150, currency: 'EUR' })).toBe(true);
    expect(spendingRule([facts[0]])({ merchant_key: 'ana lopez', channel: 'bizum', amount: -150, currency: 'EUR' })).toBe(false);
  });
});

describe('roleOf: the bank\'s short form of a person is that person', () => {
  const roles = new Map([['mauad gebara christian', 'family'], ['maria dolores tomas obon', 'other'], ['ana lopez', 'friend']]);
  it('matches "Mauad G." to Mauad Gebara Christian, and a Bizum from a family member is not spending', () => {
    expect(roleOf(roles, 'mauad g')).toBe('family');
    expect(roleOf(roles, 'mauad gebara')).toBe('family');
    expect(roleOf(roles, 'maria dolores t')).toBe('other');
    expect(roleOf(roles, 'mauad gebara christian')).toBe('family');
  });
  it('never matches a stranger, a one-letter first word, or a longer name', () => {
    expect(roleOf(roles, 'mauro g')).toBe(null);
    expect(roleOf(roles, 'm gebara')).toBe(null);
    expect(roleOf(roles, 'ana lopez garcia')).toBe(null);
    expect(roleOf(roles, '')).toBe(null);
  });
});
