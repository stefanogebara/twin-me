import { expect, it } from 'vitest';
import { projectMonth } from '../../../../api/services/money/projection.js';
import { awayWindows, weekWord } from '../../../../api/services/money/covariates.js';
import { spendingRule } from '../../../../api/services/money/spending.js';

it('does not include a payment the person explicitly rejected in spending', () => {
  expect(spendingRule([])({ amount: -500, currency: 'EUR', channel: 'card', verdict: 'not_me' })).toBe(false);
});

it('keeps a named bill when an unrelated series or transfer has the same price', () => {
  const base = { now: '2026-09-18T12:00:00Z', commitments: [{ subject: 'landlord', amount: 500, day: 28 }] };
  const series = projectMonth({ ...base, transactions: [], recurring: [{ merchant_key: 'tuition', typical_amount: 500, next_expected: '2026-09-28' }] });
  expect(series.commitments).toBe(500);
  const transfer = projectMonth({ ...base, recurring: [], transactions: [{ merchant_key: 'friend', channel: 'transfer', amount: -500, occurred_at: '2026-09-15T12:00:00Z' }] });
  expect(transfer.commitments).toBe(500);
});

it('does not interpret a multi-day assignment as travel', () => {
  const events = [{ title: 'Assignment project', start: '2026-09-14', end: '2026-09-18', all_day: true, source: 'blackboard' }];
  expect(awayWindows(events)).toEqual([]);
  expect(weekWord(events, new Date('2026-09-18T12:00:00Z'))).toBeNull();
});

it('uses the same personal share and spending exclusions in the future baseline as in actual spending', () => {
  const now = new Date('2026-09-18T12:00:00Z');
  const transactions = Array.from({ length: 84 }, (_, i) => ({
    amount: -100, merchant_key: i % 2 ? 'shared meal' : 'family',
    occurred_at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(),
  }));
  const options = { now, recurring: [], commitments: [], income: [] };
  const personal = projectMonth({ ...options, transactions, shareOf: () => 0.5, isSpending: (t) => t.merchant_key !== 'family' });
  const explicit = projectMonth({ ...options, transactions: transactions.filter((t) => t.merchant_key !== 'family').map((t) => ({ ...t, amount: t.amount / 2 })) });
  expect(personal.baseline_rest).toBe(explicit.baseline_rest);
  expect(personal.projected_p50).toBe(explicit.projected_p50);
});
