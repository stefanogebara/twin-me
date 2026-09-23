/** What a stretch of time cost, in the person's own days: today, yesterday, last night, the weeks, each day. */
import { describe, expect, it } from 'vitest';
import { spendWindows, windowLines, breakdown } from '../../../../api/_app/services/money/windows.js';

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
    expect(windowLines([], now)[0]).toBe('Today so far: nothing spent, not one payment in that stretch.');
  });

  it('breaks a window down by kind of place and by place when told how', () => {
    const kind = (t) => ({ dinner: 'eating out', bar: 'eating out', lunch: 'eating out', 'coffee-today': 'coffee', groceries: 'groceries', rent: 'home' }[t.merchant_key] || null);
    const lines = windowLines(ledger, now, { categoryOf: kind });
    expect(lines.find((l) => l.startsWith('Yesterday:'))).toBe('Yesterday: spent 45,40 EUR in 2 payments, the largest dinner 34,00 EUR. By kind: eating out 45,40 EUR (2, largest dinner 34,00 EUR). By place: dinner 34,00 EUR (1); lunch 11,40 EUR (1).');
    expect(breakdown(ledger.filter((t) => Number(t.amount) < 0 && !t.verdict && t.currency === 'EUR'), kind).map(({ biggest, ...b }) => b)).toEqual([{ key: 'home', total: 500, count: 1 }, { key: 'eating out', total: 57.4, count: 3 }, { key: 'groceries', total: 48.2, count: 1 }, { key: 'coffee', total: 2.5, count: 1 }]);
  });
});

describe('weekAverageLine', () => {
  it('averages the last four full weeks, Monday to Sunday, and names each', async () => {
    const { weekAverageLine } = await import('../../../../api/_app/services/money/windows.js');
    const rows = [
      tx('w1', '2026-09-08T10:00:00Z', -100), // week of 7 Sep
      tx('w2', '2026-09-02T10:00:00Z', -50),  // week of 31 Aug
      tx('w3', '2026-08-26T10:00:00Z', -30),  // week of 24 Aug
      tx('w4', '2026-08-18T10:00:00Z', -20),  // week of 17 Aug
      tx('old', '2026-08-10T10:00:00Z', -999), // week of 10 Aug: outside
      tx('this', '2026-09-15T10:00:00Z', -77), // this week: not full, outside
    ];
    expect(weekAverageLine(rows, now)).toBe('Average week, last 4 full weeks (Monday to Sunday): 50,00 EUR; the weeks: 17 Aug 20,00 EUR; 24 Aug 30,00 EUR; 31 Aug 50,00 EUR; 7 Sep 100,00 EUR.');
  });
  it('names a payment without a name honestly', () => {
    const lines = windowLines([tx('x', '2026-09-19T06:30:00Z', -3, { merchant_raw: null, merchant_key: null })], now);
    expect(lines[0]).toBe('Today so far: spent 3,00 EUR in 1 payment, the largest a payment without a name 3,00 EUR.');
  });
});

describe('dayTotals', () => {
  it('clips the first and last day to the instants given', async () => {
    const { dayTotals } = await import('../../../../api/_app/services/money/windows.js');
    const from = new Date('2026-09-18T16:00:00Z').getTime(); // Friday 18:00 Madrid
    const to = new Date('2026-09-19T04:00:00Z').getTime();   // Saturday 06:00 Madrid
    const days = dayTotals(ledger, from, to);
    expect(days.map((d) => `${d.day.slice(8)}:${d.total}`)).toEqual(['18:34', '19:12']); // dinner at 21:30; the bar at 02:30; not lunch, not the coffee at 08:30
  });
});

describe('costliestDayLine and weekdayLine', () => {
  it('names the costliest day of the month with its largest payment', async () => {
    const { costliestDayLine } = await import('../../../../api/_app/services/money/windows.js');
    expect(costliestDayLine(ledger, now)).toBe('Costliest day this month: Thursday 10 Sep 500,00 EUR (1), the largest rent 500,00 EUR.');
    expect(costliestDayLine([], now)).toBe('Costliest day this month: nothing spent yet.');
  });
  it('totals the last full weeks by day of the week, costliest first', async () => {
    const { weekdayLine } = await import('../../../../api/_app/services/money/windows.js');
    const rows = [tx('m1', '2026-09-07T10:00:00Z', -30), tx('m2', '2026-08-31T10:00:00Z', -20), tx('f1', '2026-09-11T20:00:00Z', -60), tx('this', '2026-09-15T10:00:00Z', -999)];
    expect(weekdayLine(rows, now, 8)).toBe('Spent by day of the week, last 8 full weeks, costliest first: Friday 60,00 EUR; Monday 50,00 EUR; Tuesday 0,00 EUR; Wednesday 0,00 EUR; Thursday 0,00 EUR; Saturday 0,00 EUR; Sunday 0,00 EUR.');
    expect(weekdayLine([], now)).toBe('Spent by day of the week, last 8 full weeks: nothing.');
  });
});

describe('cheapestDayLine and monthPaceLine', () => {
  it('names the cheapest day with a payment and counts the empty ones, and the average per day so far', async () => {
    const { cheapestDayLine, monthPaceLine } = await import('../../../../api/_app/services/money/windows.js');
    expect(cheapestDayLine(ledger, now)).toBe('Cheapest day with a payment this month: Saturday 19 Sep 14,50 EUR (2); days with nothing spent: 15.');
    expect(monthPaceLine(ledger, now)).toBe('Average per day this month: 32,01 EUR over 19 days (spent 608,10 EUR so far).');
    expect(monthPaceLine([], now)).toBe('Average per day this month: 0,00 EUR over 19 days (spent 0,00 EUR so far).');
  });
});
