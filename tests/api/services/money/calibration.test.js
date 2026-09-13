/**
 * The band learns from its misses: a day is forecast from its weekday, scored the next day,
 * and the record of hits and misses turns into one widening in euros.
 */
import { describe, it, expect } from 'vitest';
import { dayForecast, dayActual, calibrate, intervalScore, widenOver, ALPHA } from '../../../../api/services/money/calibration.js';

const DAY = 86400000;
/* Twelve weeks ending Saturday 12 Sept 2026: weekdays cost 10, Fridays 40, Sundays 0. */
function ledger() {
  const rows = [];
  const end = new Date('2026-09-12T12:00:00Z');
  for (let i = 0; i < 84; i += 1) {
    const d = new Date(end.getTime() - i * DAY);
    const wd = d.getUTCDay();
    const amount = wd === 0 ? 0 : wd === 5 ? -40 : -10;
    if (amount) rows.push({ id: `t${i}`, occurred_at: d.toISOString(), amount, merchant_key: 'shop' });
    rows.push({ id: `r${i}`, occurred_at: d.toISOString(), amount: -9.99, merchant_key: 'spotify', is_recurring: true });
  }
  return rows;
}

describe('dayForecast', () => {
  it('reads a Friday from the Fridays, recurring charges left out', () => {
    const f = dayForecast(ledger(), '2026-09-18');
    expect(f).toMatchObject({ kind: 'day_total', predicted_for: '2026-09-18', value: 40, low: 40, high: 40 });
  });
  it('reads a Sunday as nothing, and says nothing before a fortnight', () => {
    expect(dayForecast(ledger(), '2026-09-13').value).toBe(0);
    expect(dayForecast(ledger().slice(0, 5), '2026-09-13')).toBeNull();
  });
  it('applies the spending rule the rest of the product uses', () => {
    const rows = ledger().concat([{ id: 'x', occurred_at: '2026-09-11T10:00:00Z', amount: -200, merchant_key: 'flatmate' }]);
    const strict = dayForecast(rows, '2026-09-18', { isSpending: (t) => t.merchant_key !== 'flatmate' });
    expect(strict.high).toBe(40);
    expect(dayActual(rows, '2026-09-11', { isSpending: (t) => t.merchant_key !== 'flatmate' })).toBe(40);
    expect(dayActual(rows, '2026-09-11')).toBe(240);
  });
});

describe('intervalScore', () => {
  it('is the width when the actual is inside, and pays 2/alpha per euro outside', () => {
    expect(intervalScore(10, 30, 20)).toBe(20);
    expect(intervalScore(10, 30, 35)).toBe(20 + (2 / ALPHA) * 5);
    expect(intervalScore(10, 30, 4)).toBe(20 + (2 / ALPHA) * 6);
  });
});

describe('calibrate', () => {
  const day = (i, value, low, high, actual) => ({ predicted_for: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), value, low, high, actual });
  it('is zero with no record, and stays near zero when the band keeps its promise', () => {
    expect(calibrate([])).toEqual({ widen: 0, days: 0, coverage: null, interval_score: null, trusted: false });
    const kept = Array.from({ length: 20 }, (_, i) => day(i, 20, 10, 30, 20));
    const c = calibrate(kept);
    expect(c.widen).toBe(0);
    expect(c.coverage).toBe(1);
    expect(c.trusted).toBe(false);
  });
  it('widens after misses, in this person\'s euros, and narrows again on hits', () => {
    const missed = Array.from({ length: 10 }, (_, i) => day(i, 20, 10, 30, 60));
    const after = calibrate(missed);
    expect(after.widen).toBeGreaterThan(0);
    expect(after.coverage).toBeLessThan(0.5);
    const recovered = calibrate(missed.concat(Array.from({ length: 30 }, (_, i) => day(10 + i, 20, 10, 30, 20))));
    expect(recovered.widen).toBeLessThan(after.widen);
    expect(recovered.coverage).toBeGreaterThan(after.coverage);
  });
  it('counts a day as a hit once the widening it earned covers it', () => {
    const rows = Array.from({ length: 30 }, (_, i) => day(i, 20, 10, 30, 34));
    const c = calibrate(rows);
    expect(c.widen).toBeGreaterThanOrEqual(4);
    expect(c.coverage).toBeGreaterThan(0);
  });
  it('is trusted after sixty scored days', () => {
    expect(calibrate(Array.from({ length: 60 }, (_, i) => day(i, 20, 10, 30, 21))).trusted).toBe(true);
  });
});

describe('widenOver', () => {
  it('grows with the square root of the days', () => {
    expect(widenOver(4, 16)).toBe(16);
    expect(widenOver(4, 0)).toBe(0);
    expect(widenOver(null, 9)).toBe(0);
  });
});
