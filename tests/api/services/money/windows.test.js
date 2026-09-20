/** What a stretch of time cost, in the person's own days: today, yesterday, last night, the weeks, each day. */
import { describe, expect, it } from 'vitest';
import { spendWindows, windowLines, breakdown } from '../../../../api/services/money/windows.js';

/* Saturday 2026-09-19 at 10:00 in Madrid (08:00 UTC). */
const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, iso, amount, extra = {}) => ({ id, occurred_at: iso, amount, currency: 'EUR', merchant_raw: id, merchant_key: id, ...extra });
const ledger = [
  tx('coffee-today', '2026-09-19T06:30:00Z', -2.5),          // today 08:30 Madrid
  tx('dinner', '2026-09-18T19:30:00Z', -34),                  // yesterday 21:30: last night
  tx('bar', '2026-09-19T00:30:00Z', -12),                     // 02:30 today Madrid: last night, and today
  tx('lunch', '2026-09-18T11:00:00Z', -11.4),                 // yesterday 13:00: not last night
  tx('groceries', '2026-09-15T16:00:00Z', -48.2),             // Tuesday this week
  tx('rent', '2026-09-10T09:00:00Z', -500),                   // last week
  tx('refund', '2026-09-18T20:00:00Z', 20),                   // money in: never spending
  tx('not-mine', '2026-09-18T20:10:00Z', -99, { verdict: 'not_me' }),
  tx('usd', '2026-09-18T20:20:00Z', -5, { currency: 'USD' }),
];

describe('spendWindows', () => {
  it('sums today, yesterday and last night in Madrid time, spending only', () => {
    const w = Object.fromEntries(spendWindows(ledger, now).windows.map((x) => [x.key, x]));
    expect(w.today).toMatchObject({ total: 14.5, count: 2 });
    expect(w.yesterday).toMatchObject({ total: 45.4, count: 2, biggest: { name: 'dinner', amount: 34 } });
    expect(w.last_night).toMatchObject({ total: 46, count: 2 });
    expect(w.this_week).toMatchObject({ total: 108.1, count: 5 });
    expect(w.last_week).toMatchObject({ total: 500, count: 1 });
    expect(w.last_7_days.total).toBe(108.1);
  });
  it('says each of the last seven days on its own, and nothing for an empty one', () => {
    const { days } = spendWindows(ledger, now);
    expect(days.map((d) => d.day)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
    expect(days[2]).toMatchObject({ weekday: 'Tuesday', total: 48.2, count: 1 });
    expect(days[3].count).toBe(0);
  });
  it('writes lines the model can quote, with the amounts as the context writes them', () => {
    const lines = windowLines(ledger, now);
    expect(lines).toContain('Yesterday: spent 45,40 EUR in 2 payments, the largest dinner 34,00 EUR.');
    expect(lines).toContain('Last night (yesterday 18:00 to 06:00 today): spent 46,00 EUR in 2 payments, the largest dinner 34,00 EUR.');
    expect(lines.at(-1)).toMatch(/^Spent per day, last 7 days: Sunday 09-13 nothing; .*Saturday 09-19 14,50 EUR \(2\)\.$/);
    expect(windowLines([], now)[0]).toBe('Today so far: nothing spent.');
  });

  it('breaks a window down by kind of place and by place when told how', () => {
    const kind = (t) => ({ dinner: 'eating out', bar: 'eating out', lunch: 'eating out', 'coffee-today': 'coffee', groceries: 'groceries', rent: 'home' }[t.merchant_key] || null);
    const lines = windowLines(ledger, now, { categoryOf: kind });
    expect(lines.find((l) => l.startsWith('Yesterday:'))).toBe('Yesterday: spent 45,40 EUR in 2 payments, the largest dinner 34,00 EUR. By kind: eating out 45,40 EUR (2). By place: dinner 34,00 EUR (1); lunch 11,40 EUR (1).');
    expect(breakdown(ledger.filter((t) => Number(t.amount) < 0 && !t.verdict && t.currency === 'EUR'), kind)).toEqual([{ key: 'home', total: 500, count: 1 }, { key: 'eating out', total: 57.4, count: 3 }, { key: 'groceries', total: 48.2, count: 1 }, { key: 'coffee', total: 2.5, count: 1 }]);
  });
});
