/** One integer a day: how many events the diary held, merged across runs so the past survives. */
import { describe, expect, it } from 'vitest';
import { dayCounts, coveredDays } from '../../../../api/services/money/calendar.js';

const ev = (start) => ({ id: start, title: 'Class', start });

describe('dayCounts', () => {
  it('counts a day\'s events and keeps what earlier runs saw', () => {
    const first = dayCounts([ev('2026-09-22T08:30:00+02:00'), ev('2026-09-22T10:00:00+02:00'), ev('2026-09-23T09:30:00+02:00')]);
    expect(first).toEqual({ '2026-09-22': 2, '2026-09-23': 1 });
    /* a later run sees a shorter window; June must not vanish */
    const later = dayCounts([ev('2026-10-05T12:00:00+02:00')], { ...first, '2026-06-11': 4 });
    expect(later).toEqual({ '2026-06-11': 4, '2026-09-22': 2, '2026-09-23': 1, '2026-10-05': 1 });
  });
  it('rewrites a day it saw again rather than adding to it', () => {
    expect(dayCounts([ev('2026-09-22T08:30:00+02:00')], { '2026-09-22': 9 })).toEqual({ '2026-09-22': 1 });
  });
  it('writes a covered day with no event as a zero, which is the answer, not a gap', () => {
    const covered = coveredDays('2026-09-20T00:00:00Z', '2026-09-22T00:00:00Z');
    expect(Object.keys(covered)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
    expect(dayCounts([ev('2026-09-21T10:00:00+02:00')], covered)).toEqual({ '2026-09-20': 0, '2026-09-21': 1, '2026-09-22': 0 });
  });
});
