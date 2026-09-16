/**
 * What day it is, where the person is.
 *
 * The product is for students in Spain and every day in the ledger was computed in UTC, so
 * between local midnight and two in the morning it was still yesterday: a payment at 00:30
 * landed on the day before on the plan's squares and against the day before's allowance.
 * These tests hold the boundary at local midnight, in summer and in winter.
 */
import { describe, it, expect } from 'vitest';
import { dayIn, monthIn, partsIn, weekdayIn, dayOfMonthIn, startOfDayIn, offsetAt, daysBetweenIn, LEDGER_TZ } from '../../../../api/services/money/zone.js';
import { monthPlan } from '../../../../api/services/money/plan.js';
import { safeToSpend } from '../../../../api/services/money/allowance.js';

describe('the ledger zone', () => {
  it('is Spain unless the environment says otherwise', () => {
    expect(LEDGER_TZ).toBe('Europe/Madrid');
  });

  it('puts half past midnight on the day the person is living', () => {
    /* 22:30 UTC on the 16th is 00:30 on the 17th in Madrid. */
    expect(dayIn('2026-09-16T22:30:00Z')).toBe('2026-09-17');
    expect(monthIn('2026-09-30T22:30:00Z')).toBe('2026-10');
    expect(dayIn('2026-09-16T12:00:00Z')).toBe('2026-09-16');
  });

  it('follows the clocks, two hours ahead in summer and one in winter', () => {
    expect(offsetAt('2026-09-16T12:00:00Z') / 3600000).toBe(2);
    expect(offsetAt('2026-01-10T12:00:00Z') / 3600000).toBe(1);
    /* An hour before midnight in January is still the same day; in September it is not. */
    expect(dayIn('2026-01-10T23:30:00Z')).toBe('2026-01-11');
    expect(dayIn('2026-01-10T22:30:00Z')).toBe('2026-01-10');
  });

  it('reads a local time in pieces, and finds where a day begins', () => {
    expect(partsIn('2026-09-16T22:30:00Z')).toEqual({ year: 2026, month: 9, day: 17, weekday: 4, hour: 0, minute: 30 });
    expect(weekdayIn('2026-09-16T22:30:00Z')).toBe(4); // a Thursday
    expect(dayOfMonthIn('2026-09-16T22:30:00Z')).toBe(17);
    expect(startOfDayIn('2026-09-17').toISOString()).toBe('2026-09-16T22:00:00.000Z');
    expect(startOfDayIn('2026-01-11').toISOString()).toBe('2026-01-10T23:00:00.000Z');
  });

  it('counts calendar days between two instants', () => {
    expect(daysBetweenIn('2026-09-16T22:30:00Z', '2026-09-18T01:00:00Z')).toBe(1);
    expect(daysBetweenIn('2026-09-16T12:00:00Z', '2026-09-16T23:00:00Z')).toBe(1);
  });
});

describe('what the boundary changes on the screen', () => {
  const rows = [
    /* Half past midnight on the 17th, in Madrid. */
    { id: 't1', occurred_at: '2026-09-16T22:30:00Z', amount: -18.4, merchant_key: 'bar pepe', merchant_raw: 'Bar Pepe' },
    { id: 't2', occurred_at: '2026-09-16T11:00:00Z', amount: -12, merchant_key: 'mercadona', merchant_raw: 'Mercadona' },
  ];

  it('puts a payment after midnight on the day it was made, on the plan', () => {
    const plan = monthPlan({ transactions: rows, now: new Date('2026-09-17T09:00:00Z') });
    const day = (key) => plan.cells.find((c) => c.day === key);
    expect(day('2026-09-17').spent).toBe(18.4);
    expect(day('2026-09-16').spent).toBe(12);
  });

  it("counts it against the day it was made, in the day's allowance", () => {
    /* At one in the morning in Madrid it is the 17th, so the 18,40 EUR is today's. */
    const now = new Date('2026-09-16T23:00:00Z');
    const cast = { month: '2026-09-01', spent: 30.4, committed: 0, days_left: 13, calendar_ahead: 0, calendar_items: [] };
    const a = safeToSpend({ cast, segments: [], facts: [{ kind: 'income', amount: 900 }], now });
    expect(a.amount).not.toBeNull();
    /* The day the allowance is speaking about is the one the person is in. */
    expect(a.today_events).toEqual([]);
  });
});
