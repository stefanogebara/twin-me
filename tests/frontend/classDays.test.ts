/**
 * A day with class against a day without: the middle day of each, never the average, and
 * silence unless they are genuinely far apart. The average was measured lying on a real
 * ledger (2026-09-22) - see the module's own note.
 */
import { describe, expect, it } from 'vitest';
import { classSplit } from '../../src/pages/money/classDays';

const cell = (day: string, spent: number, events: number, past = true) => ({ day, dom: Number(day.slice(8)), weekday: 1, past, today: false, spent, count: 1, received: 0, said: null, hit: null, expected: 0, items: [], events, rows: [], note: null });

describe('classSplit', () => {
  it('takes the middle day of each kind', () => {
    const cells = [
      cell('2026-09-01', 10, 3), cell('2026-09-02', 14, 2), cell('2026-09-03', 12, 1), cell('2026-09-04', 8, 4),
      cell('2026-09-05', 40, 0), cell('2026-09-06', 30, 0), cell('2026-09-07', 20, 0), cell('2026-09-08', 30, 0),
      cell('2026-09-30', 999, 0, false),
    ];
    expect(classSplit(cells)).toEqual({ withClass: 12, free: 30, withDays: 4, freeDays: 4, withFree: 0, freeFree: 0, ratio: 2.5 });
  });

  it('is not moved by one huge day, where the average was', () => {
    /* Four quiet days with class and one enormous one: the mean says 60, the middle says 10. */
    const cells = [
      cell('2026-09-01', 10, 2), cell('2026-09-02', 10, 2), cell('2026-09-03', 10, 2), cell('2026-09-04', 10, 2), cell('2026-09-09', 263, 2),
      cell('2026-09-05', 0, 0), cell('2026-09-06', 0, 0), cell('2026-09-07', 0, 0), cell('2026-09-08', 0, 0),
    ];
    const s = classSplit(cells)!;
    expect(s.withClass).toBe(10);
    expect(s.free).toBe(0);
    expect(s.freeFree).toBe(4);
  });

  it('says nothing when the two kinds of day are not far apart', () => {
    /* Stefano's own shape on 2026-09-22: middles of 0,70 and 0, half of each costing nothing. */
    const cells = [
      cell('2026-09-01', 0, 3), cell('2026-09-02', 0, 2), cell('2026-09-03', 4, 1), cell('2026-09-04', 263, 4),
      cell('2026-09-05', 0, 0), cell('2026-09-06', 0, 0), cell('2026-09-07', 3, 0), cell('2026-09-08', 146, 0),
    ];
    expect(classSplit(cells)).toBeNull();
    /* Two middles a coffee apart are not a pattern either. */
    const small = [
      cell('2026-09-01', 4, 3), cell('2026-09-02', 4, 2), cell('2026-09-03', 4, 1), cell('2026-09-04', 4, 4),
      cell('2026-09-05', 1, 0), cell('2026-09-06', 1, 0), cell('2026-09-07', 1, 0), cell('2026-09-08', 1, 0),
    ];
    expect(classSplit(small)).toBeNull();
  });

  it('says nothing until each side has four days, or when the diary knows nothing', () => {
    const few = [cell('2026-09-01', 10, 3), cell('2026-09-05', 40, 0), cell('2026-09-06', 30, 0), cell('2026-09-07', 20, 0), cell('2026-09-08', 30, 0)];
    expect(classSplit(few)).toBeNull();
    expect(classSplit([])).toBeNull();
  });
});
