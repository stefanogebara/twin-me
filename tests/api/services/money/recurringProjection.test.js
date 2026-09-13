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

/**
 * What the person told the system has to change a number, or the questions were a survey.
 * These four are those numbers.
 */
describe('projectMonth: what the person said, made to count', () => {
  const NOW = new Date('2026-09-08T12:00:00Z');
  let n = 0;
  const t = (date, amount, merchant = 'Shop', channel = 'card') => {
    n += 1;
    return { id: `c${n}`, occurred_at: `${date}T12:00:00Z`, amount, merchant_raw: merchant, merchant_key: merchant.toLowerCase(), channel, is_recurring: false };
  };

  it('carries a stated commitment the ledger has never seen, instead of waiting to be surprised by rent', () => {
    const rows = [t('2026-09-02', -20)];
    const plain = projectMonth({ transactions: rows, recurring: [], now: NOW });
    const withRent = projectMonth({
      transactions: rows, recurring: [], now: NOW,
      commitments: [{ subject: 'rent', amount: 500, day: 28 }],
    });
    expect(withRent.commitments).toBe(500);
    expect(withRent.commitment_items[0]).toMatchObject({ subject: 'rent', due_on: '2026-09-28' });
    expect(withRent.projected_p50).toBe(Math.round((plain.projected_p50 + 500) * 100) / 100);
  });

  it('does not count rent twice when the ledger already detected it', () => {
    const rows = [t('2026-09-02', -20)];
    const r = projectMonth({
      transactions: rows, now: NOW,
      recurring: [{ merchant_key: 'rentals sl', typical_amount: 500, next_expected: '2026-09-28' }],
      commitments: [{ subject: 'rent', amount: 500, day: 28 }],
    });
    expect(r.commitments).toBe(0);
    expect(r.committed).toBe(500);
  });

  it('does not count a commitment already paid this month', () => {
    const rows = [t('2026-09-01', -500, 'Landlord', 'transfer')];
    const r = projectMonth({ transactions: rows, recurring: [], now: NOW, commitments: [{ subject: 'rent', amount: 500, day: 28 }] });
    expect(r.commitments).toBe(0);
  });

  it('gives the month its other side, so a reading is not always a warning', () => {
    const rows = [t('2026-09-02', -20), t('2026-09-03', 100, 'Family', 'transfer')];
    const r = projectMonth({
      transactions: rows, recurring: [], now: NOW,
      income: [{ subject: 'family', amount: 100, day: 25 }],
    });
    expect(r.received).toBe(100);
    expect(r.income_ahead).toBe(100);
    expect(r.income_items[0]).toMatchObject({ subject: 'family', due_on: '2026-09-25' });
  });

  it('counts only the share of a split cost that is actually theirs', () => {
    const rows = [t('2026-09-02', -120, 'Simply Alcala')];
    const whole = projectMonth({ transactions: rows, recurring: [], now: NOW });
    const shared = projectMonth({
      transactions: rows, recurring: [], now: NOW,
      shareOf: (x) => (x.merchant_key === 'simply alcala' ? 1 / 3 : 1),
    });
    expect(whole.spent).toBe(120);
    expect(shared.spent).toBe(40);
  });

  it('stops treating money handed to a flatmate as spending', () => {
    const rows = [t('2026-09-02', -250, 'Rafaella Van Der Graaff', 'transfer'), t('2026-09-03', -20)];
    const all = projectMonth({ transactions: rows, recurring: [], now: NOW });
    const named = projectMonth({
      transactions: rows, recurring: [], now: NOW,
      isSpending: (x) => x.merchant_key !== 'rafaella van der graaff',
    });
    expect(all.spent).toBe(270);
    expect(named.spent).toBe(20);
  });
});

describe('a band that has earned a widening', () => {
  it('widens by the square root of the days left, never below what is already spent', () => {
    const now = new Date('2026-09-14T12:00:00Z');
    const transactions = Array.from({ length: 60 }, (_, i) => ({ occurred_at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), amount: -10, merchant_key: 'shop', is_recurring: false }));
    const plain = projectMonth({ transactions, recurring: [], now });
    const wide = projectMonth({ transactions, recurring: [], now, widen: 3 });
    expect(wide.band_widened_by).toBe(Math.round(3 * Math.sqrt(plain.days_left) * 100) / 100);
    expect(wide.projected_p90 - plain.projected_p90).toBeCloseTo(wide.band_widened_by, 2);
    expect(wide.projected_p10).toBeGreaterThanOrEqual(plain.spent);
    expect(wide.projected_p50).toBe(plain.projected_p50);
  });
});

describe('one merchant, more than one kind of charge', () => {
  const NOW = new Date('2026-09-13T12:00:00Z');
  const row = (id, d, amount) => ({ id, merchant_key: 'amazon', amount: -amount, occurred_at: `${d}T10:00:00Z` });
  it('finds the monthly charge behind an odd purchase at the same name, and names its rows', () => {
    const rows = [row('a', '2026-06-04', 4.99), row('b', '2026-07-04', 4.99), row('c', '2026-08-04', 4.99), row('d', '2026-09-04', 4.99), row('e', '2026-08-19', 89)];
    const [s] = detectRecurring(rows, { now: NOW });
    expect(s).toMatchObject({ merchant_key: 'amazon', cadence: 'monthly', typical_amount: 4.99, occurrences: 4, variants: 1, variant_amounts: [89] });
    expect(s.transaction_ids).toEqual(['a', 'b', 'c', 'd']);
  });
  it('picks the larger group when two plans run at one name', () => {
    const rows = [
      row('a', '2026-06-01', 12), row('b', '2026-07-01', 12), row('c', '2026-08-01', 12), row('d', '2026-09-01', 12),
      row('e', '2026-07-15', 54), row('f', '2026-08-15', 54), row('g', '2026-09-15', 54),
    ];
    const [s] = detectRecurring(rows, { now: NOW });
    expect(s).toMatchObject({ typical_amount: 12, occurrences: 4, variants: 3, variant_amounts: [54] });
  });
  it('still says nothing when no group keeps a rhythm', () => {
    const rows = [row('a', '2026-06-01', 12), row('b', '2026-06-03', 12), row('c', '2026-09-01', 12), row('d', '2026-08-19', 89)];
    expect(detectRecurring(rows, { now: NOW })).toEqual([]);
  });
});

describe('the rest of the month is the median of three readings', () => {
  const now = new Date('2026-09-14T12:00:00Z');
  const flat = (perDay) => Array.from({ length: 70 }, (_, i) => ({ occurred_at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), amount: -perDay, merchant_key: 'shop', is_recurring: false }));
  it('agrees with itself on a flat history and shows the three', () => {
    const r = projectMonth({ transactions: flat(10), recurring: [], now });
    expect(r.baseline_readings.weekday).toBe(10 * r.days_left);
    expect(r.baseline_readings.recent).toBe(10 * r.days_left);
    expect(r.baseline_readings.same_days_last_month).toBe(10 * r.days_left);
    expect(r.baseline_rest).toBe(10 * r.days_left);
    expect(r.projected_p50).toBe(r.spent + r.baseline_rest);
  });
  it('moves with the middle reading when the recent weeks run hot, and the band moves with it', () => {
    /* Ten a day for ten weeks, then thirty a day for the last four: the weekday medians
       still say ten, the recent level and last month say more; the median is the middle. */
    const rows = flat(10).map((t, i) => (i < 28 ? { ...t, amount: -30 } : t));
    const r = projectMonth({ transactions: rows, recurring: [], now });
    const readings = [r.baseline_readings.weekday, r.baseline_readings.recent, r.baseline_readings.same_days_last_month].sort((a, b) => a - b);
    expect(r.baseline_rest).toBe(readings[1]);
    expect(r.baseline_rest).toBeGreaterThan(r.baseline_readings.weekday);
    expect(r.projected_p50).toBe(Math.round((r.spent + r.baseline_rest) * 100) / 100);
    expect(r.projected_p90).toBeGreaterThan(r.projected_p50);
    expect(r.projected_p10).toBeLessThanOrEqual(r.projected_p50);
  });
});
