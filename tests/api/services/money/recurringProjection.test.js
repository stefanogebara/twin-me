/**
 * recurring + projection: what comes back on its own, and this month with a band.
 */
import { describe, it, expect } from 'vitest';
import { detectRecurring, cadenceOf, subscriptionsAgainstUse } from '../../../../api/services/money/recurring.js';
import { projectMonth, scenario, dailyTotals } from '../../../../api/services/money/projection.js';

const monthly = (key, amount, months, day = 3) => months.map((m) => ({ merchant_key: key, amount: -amount, occurred_at: `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}T08:00:00Z` }));

describe('detectRecurring', () => {
  it('finds a monthly subscription and dates the next charge', () => {
    const rows = monthly('spotify', 10.99, [5, 6, 7, 8]);
    const series = detectRecurring(rows, { now: '2026-08-20T00:00:00Z', platforms: { spotify: 'spotify' } });
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ merchant_key: 'spotify', cadence: 'monthly', typical_amount: 10.99, occurrences: 4, is_subscription: true, platform: 'spotify' });
    expect(series[0].next_expected).toBe('2026-09-03'); // 3 Aug + the median 31-day interval
  });
  it('ignores a merchant with chaotic intervals or amounts, and inflows', () => {
    const uber = [
      { merchant_key: 'uber', amount: -7, occurred_at: '2026-07-01T10:00:00Z' }, { merchant_key: 'uber', amount: -19, occurred_at: '2026-07-03T10:00:00Z' },
      { merchant_key: 'uber', amount: -4, occurred_at: '2026-07-30T10:00:00Z' }, { merchant_key: 'uber', amount: -11, occurred_at: '2026-08-02T10:00:00Z' },
    ];
    const salary = monthly('nomina', 850, [5, 6, 7, 8]).map((r) => ({ ...r, amount: 850 }));
    expect(detectRecurring([...uber, ...salary], { now: '2026-08-20T00:00:00Z' })).toHaveLength(0);
  });
  it('names cadences', () => {
    expect(cadenceOf(7)).toBe('weekly'); expect(cadenceOf(30)).toBe('monthly'); expect(cadenceOf(91)).toBe('quarterly'); expect(cadenceOf(365)).toBe('yearly'); expect(cadenceOf(45)).toBeNull();
  });
  it('measures subscriptions against use', () => {
    const series = detectRecurring(monthly('youtube premium', 12.99, [5, 6, 7, 8]), { now: '2026-08-20T00:00:00Z', platforms: { 'youtube premium': 'youtube' } });
    const out = subscriptionsAgainstUse(series, { youtube: 5 });
    expect(out[0]).toMatchObject({ uses: 5, cost_per_use: 2.6 });
  });
});

describe('projectMonth', () => {
  // Twelve weeks of history: 8 € on weekdays, 30 € on Saturdays, nothing on Sundays; then September up to the 10th.
  const history = [];
  for (let d = new Date('2026-06-01T00:00:00Z'); d <= new Date('2026-09-10T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
    const wd = d.getUTCDay();
    const amt = wd === 0 ? 0 : wd === 6 ? 30 : 8;
    if (amt) history.push({ merchant_key: 'shop', amount: -amt, occurred_at: `${d.toISOString().slice(0, 10)}T12:00:00Z` });
  }
  const recurring = [{ merchant_key: 'spotify', typical_amount: 10.99, next_expected: '2026-09-20', cadence: 'monthly' }, { merchant_key: 'gym', typical_amount: 35, next_expected: '2026-10-01', cadence: 'monthly' }];

  it('adds what is spent, what is committed this month, and a baseline for the days left', () => {
    const p = projectMonth({ transactions: history, recurring, now: '2026-09-10T15:00:00Z' });
    expect(p.month).toBe('2026-09-01');
    expect(p.days_left).toBe(20);
    expect(p.spent).toBe(history.filter((t) => t.occurred_at >= '2026-09-01' && t.occurred_at <= '2026-09-10T15').reduce((s, t) => s - t.amount, 0));
    expect(p.committed).toBe(10.99);                 // the gym is in October
    expect(p.committed_items.map((c) => c.merchant_key)).toEqual(['spotify']);
    // 20 days left from the 11th to the 30th: 14 weekdays × 8 + 3 Saturdays × 30 + 3 Sundays × 0 = 202
    expect(p.baseline_rest).toBe(202);
    expect(p.projected_p50).toBeCloseTo(p.spent + p.committed + 202, 0);
    expect(p.projected_p10).toBeLessThanOrEqual(p.projected_p50);
    expect(p.projected_p90).toBeGreaterThanOrEqual(p.projected_p50);
  });
  it('is deterministic for a seed and widens with an added purchase', () => {
    const a = projectMonth({ transactions: history, recurring, now: '2026-09-10T15:00:00Z', seed: 7 });
    const b = projectMonth({ transactions: history, recurring, now: '2026-09-10T15:00:00Z', seed: 7 });
    expect(a).toEqual(b);
    const s = scenario({ transactions: history, recurring, now: '2026-09-10T15:00:00Z', seed: 7 }, { amount: 900, label: 'chair' });
    expect(s.projected_p50).toBeCloseTo(a.projected_p50 + 900, 2);
  });
  it('dailyTotals zero-fills and skips recurring and inflows', () => {
    const days = dailyTotals([
      { amount: -5, occurred_at: '2026-09-01T10:00:00Z' }, { amount: -99, occurred_at: '2026-09-01T11:00:00Z', is_recurring: true }, { amount: 50, occurred_at: '2026-09-02T10:00:00Z' },
    ], '2026-09-01', '2026-09-03');
    expect(days.map((d) => d.total)).toEqual([5, 0, 0]);
  });
});
