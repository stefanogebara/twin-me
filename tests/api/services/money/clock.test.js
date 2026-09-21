/** Which payments know their hour, and the line that says when they do not. */
import { describe, expect, it } from 'vitest';
import { hasRealTime, timedShare, clockLine } from '../../../../api/services/money/clock.js';

const at = (iso) => ({ id: iso, occurred_at: iso, amount: -10 });

describe('hasRealTime', () => {
  it('reads midday UTC as the bank booking a date, and any other time as an hour', () => {
    expect(hasRealTime(at('2026-09-18T12:00:00.000Z'))).toBe(false);
    expect(hasRealTime(at('2026-09-18T12:00:00Z'))).toBe(false);
    expect(hasRealTime(at('2026-09-18T20:30:00.000Z'))).toBe(true);
    expect(hasRealTime(at('2026-09-18T12:00:01.000Z'))).toBe(true);
    expect(hasRealTime({})).toBe(false);
  });
  it('counts the share', () => {
    expect(timedShare([at('2026-09-18T12:00:00Z'), at('2026-09-18T20:30:00Z'), at('2026-09-18T21:00:00Z')])).toEqual({ timed: 2, total: 3 });
  });
});

describe('clockLine', () => {
  const from = new Date('2026-09-18T16:00:00Z').getTime();
  const to = new Date('2026-09-19T04:00:00Z').getTime();
  it('says how many payments around the stretch know their hour', () => {
    const rows = [at('2026-09-18T12:00:00Z'), at('2026-09-18T12:00:00Z'), at('2026-09-18T20:30:00Z')];
    expect(clockLine(rows, from, to)).toMatch(/^Hours are not complete: of the 3 payments around that stretch, 1 carry the hour they happened and 2 carry only the day/);
  });
  it('is silent when every payment knows its hour, and when there are none', () => {
    expect(clockLine([at('2026-09-18T20:30:00Z')], from, to)).toBeNull();
    expect(clockLine([], from, to)).toBeNull();
  });
});
