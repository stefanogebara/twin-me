/** A day with class against a day without: silent until both sides have enough days. */
import { describe, expect, it } from 'vitest';
import { classSplit } from '../../src/pages/money/classDays';

const cell = (day: string, spent: number, events: number, past = true) => ({ day, dom: Number(day.slice(8)), weekday: 1, past, today: false, spent, count: 1, received: 0, said: null, hit: null, expected: 0, items: [], events, rows: [], note: null });

describe('classSplit', () => {
  it('averages the days with something in the diary against the days with nothing', () => {
    const cells = [
      cell('2026-09-01', 10, 3), cell('2026-09-02', 14, 2), cell('2026-09-03', 12, 1), cell('2026-09-04', 8, 4),
      cell('2026-09-05', 40, 0), cell('2026-09-06', 30, 0), cell('2026-09-07', 20, 0), cell('2026-09-08', 30, 0),
      cell('2026-09-30', 999, 0, false),
    ];
    expect(classSplit(cells)).toEqual({ withClass: 11, free: 30, withDays: 4, freeDays: 4, ratio: 2.7 });
  });
  it('says nothing until each side has four days, or when the diary knows nothing', () => {
    const few = [cell('2026-09-01', 10, 3), cell('2026-09-05', 40, 0), cell('2026-09-06', 30, 0), cell('2026-09-07', 20, 0), cell('2026-09-08', 30, 0)];
    expect(classSplit(few)).toBeNull();
    expect(classSplit([])).toBeNull();
  });
});
