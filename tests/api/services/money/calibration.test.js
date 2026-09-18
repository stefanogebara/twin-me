/**
 * The band learns from its misses: a day is forecast from its weekday, scored the next day,
 * and the record of hits and misses turns into one widening in euros.
 */
import { describe, it, expect } from 'vitest';
import { dayForecast, dayActual, calibrate, intervalScore, widenOver, dayStrip, ALPHA, STRIP_DAYS } from '../../../../api/services/money/calibration.js';

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
    expect(calibrate([])).toEqual({ widen: 0, days: 0, coverage: null, interval_score: null, trusted: false, record: [] });
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
  it('keeps the record of each day as it was judged, widening included', () => {
    const rows = Array.from({ length: 30 }, (_, i) => day(i, 20, 10, 30, 34));
    const { record } = calibrate(rows);
    expect(record).toHaveLength(30);
    expect(record[0]).toMatchObject({ predicted_for: '2026-09-01', value: 20, low: 10, high: 30, actual: 34, hit: false });
    expect(record[29].high).toBeGreaterThan(30);
    expect(record.some((r) => r.hit)).toBe(true);
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

describe('dayStrip', () => {
  const NOW = new Date('2026-09-14T15:00:00Z');
  it('lays out the last thirty days, today partial, each with its count and the range it was given', () => {
    const record = [
      { predicted_for: '2026-09-12', value: 10, low: 0, high: 15, actual: 10, hit: true },
      { predicted_for: '2026-09-13', value: 0, low: 0, high: 5, actual: 0, hit: true },
      { predicted_for: '2026-09-11', value: 40, low: 30, high: 50, actual: 40, hit: true },
    ];
    const strip = dayStrip(ledger(), record, { now: NOW });
    expect(strip.days).toHaveLength(STRIP_DAYS);
    expect(strip).toMatchObject({ from: '2026-08-16', to: '2026-09-14', said_days: 3, held: 3 });
    const last = strip.days[STRIP_DAYS - 1];
    expect(last).toMatchObject({ day: '2026-09-14', today: true, total: 0, count: 0, said: null, hit: null });
    const friday = strip.days.find((d) => d.day === '2026-09-11');
    expect(friday).toMatchObject({ weekday: 5, total: 40, count: 1, said: { value: 40, low: 30, high: 50 }, hit: true });
    /* Recurring charges are left out of the day, as the forecast leaves them out. */
    expect(strip.days.find((d) => d.day === '2026-09-13')).toMatchObject({ total: 0, count: 0 });
    expect(strip.days_with_spend).toBe(24);
    expect(strip.total).toBe(360);
  });
  it('marks a day whose range broke, and applies the spending rule', () => {
    const record = [{ predicted_for: '2026-09-11', value: 10, low: 0, high: 15, actual: 40, hit: false }];
    const strip = dayStrip(ledger(), record, { now: NOW, isSpending: (t) => t.merchant_key !== 'shop' });
    expect(strip.days.find((d) => d.day === '2026-09-11')).toMatchObject({ total: 0, hit: false });
    expect(strip).toMatchObject({ said_days: 1, held: 0, total: 0, days_with_spend: 0 });
  });
});


it('keeps an issued interval unchanged when an earlier corrected day changes training',()=>{
  const rows=[{predicted_for:'2026-09-11',value:20,low:10,high:30,issued_low:10,issued_high:30,actual:100},
    {predicted_for:'2026-09-12',value:20,low:10,high:30,issued_low:5,issued_high:35,actual:20}];
  const before=calibrate(rows);
  const after=calibrate([{...rows[0],actual:200},rows[1]]);
  expect(after.widen).toBeGreaterThan(before.widen);
  expect(after.record[1]).toMatchObject({low:5,high:35,actual:20,hit:true});
  expect(after.coverage).toBe(0.5);
});
