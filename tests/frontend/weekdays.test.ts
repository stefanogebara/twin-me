/** By day of the week on Month: the last full weeks, Monday first, today's weekday marked. */
import { describe, expect, it } from 'vitest';
import { weekdayTotals } from '../../src/pages/money/weekdays';

const now = new Date(2026, 8, 21, 12); // Monday 21 September 2026, local
const row = (iso: string, amount: number, extra: Record<string, unknown> = {}) => ({ occurred_at: iso, amount, currency: 'EUR', ...extra });

describe('weekdayTotals', () => {
  it('sums the last eight full weeks by weekday, Monday first, and skips this week, refunds and not-mine', () => {
    const rows = [
      row('2026-09-18T20:00:00', -60),        // Friday, last week
      row('2026-09-11T20:00:00', -40),        // Friday, two weeks ago
      row('2026-09-14T10:00:00', -10),        // Monday, last week
      row('2026-09-21T10:00:00', -999),       // this Monday: not a full week
      row('2026-07-20T10:00:00', -500),       // nine weeks back: outside
      row('2026-09-15T10:00:00', 25),         // money in
      row('2026-09-16T10:00:00', -33, { verdict: 'not_me' }),
      row('2026-09-17T10:00:00', -5, { currency: 'USD' }),
    ];
    const pts = weekdayTotals(rows, now, 'en-GB');
    expect(pts.map((p) => p.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(pts.map((p) => p.value)).toEqual([10, 0, 0, 0, 100, 0, 0]);
    expect(pts.find((p) => p.current)?.label).toBe('Mon');
  });
  it('is empty with nothing in the window', () => {
    expect(weekdayTotals([row('2026-09-21T10:00:00', -5)], now, 'en-GB')).toEqual([]);
  });
});
