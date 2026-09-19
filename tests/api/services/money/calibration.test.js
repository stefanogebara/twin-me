/**
 * The band learns from its misses: a day is forecast from its weekday, scored the next day,
 * and the record of hits and misses turns into one widening in euros.
 */
import { describe, it, expect } from 'vitest';
import { dayForecast, dayActual, calibrate, carriedWiden, intervalScore, widenOver, dayStrip, ALPHA, STRIP_DAYS } from '../../../../api/services/money/calibration.js';

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
  /* Three weeks of this ledger are three Fridays at 40, three Sundays at nothing and fifteen
     days at 10: 270 EUR over 21 days. The band is the spread of the whole twelve weeks, where
     a tenth of the days cost nothing and a tenth cost 40. Recurring charges are left out of
     both, so the 9,99 every day never appears. */
  it('reads a day as what a day has cost lately, and bands it by the whole history', () => {
    const f = dayForecast(ledger(), '2026-09-13');
    expect(f).toMatchObject({ kind: 'day_total', predicted_for: '2026-09-13', value: 12.86, low: 0, high: 40 });
  });
  /* The figure no longer changes with the weekday. It read that weekday's median until
     2026-09-18 and was nearly always nothing, because most days cost nothing: measured over
     66 days it missed by 28,41 EUR where saying nothing at all missed by 28,67. Which days
     are heavier is weekdayShare's business, not this one's. */
  /* A Friday said 40 and a Sunday nothing while the weekday chose the figure. Now neither the
     Friday nor the Sunday is asked about: both read what the three weeks behind them cost, and
     they differ only by which days those windows hold -- the quiet days after the ledger ends
     pull the later one down, 10,95 against 8,57. */
  it('no longer lets the weekday choose the figure', () => {
    const friday = dayForecast(ledger(), '2026-09-18');
    const sunday = dayForecast(ledger(), '2026-09-20');
    expect([friday.value, sunday.value]).toEqual([10.95, 8.57]);
    expect(friday.high).toBe(sunday.high);
  });
  it('says nothing before a fortnight', () => {
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

/* A band that has no scored days has no widening, and after the settling rule of 18 September
   that is true for four days after every correction: the widening went from 50,19 EUR to
   nothing the moment the ledger was repaired, and the day's range lost everything it had
   learned. The widening a band was issued with is written on the row it was issued for
   (issued_low, issued_high), so the last one it earned can be read back until a new one exists. */
describe('carriedWiden', () => {
  const row = (on, low, high, issuedLow, issuedHigh) => ({ kind: 'day_total', predicted_on: on, predicted_for: on, value: 10, low, high, issued_low: issuedLow, issued_high: issuedHigh });
  it('reads the widening the newest row was issued with', () => {
    const rows = [row('2026-09-16', 0, 40, 0, 88.3), row('2026-09-18', 0, 52.33, 0, 102.52)];
    expect(carriedWiden(rows)).toEqual({ widen: 50.19, from: '2026-09-18' });
  });
  it('is nothing when no row was ever issued with one', () => {
    expect(carriedWiden([])).toBeNull();
    expect(carriedWiden([{ kind: 'day_total', predicted_on: '2026-09-18', low: 0, high: 50 }])).toBeNull();
    expect(carriedWiden([row('2026-09-18', 0, 50, 0, 50)])).toBeNull();
  });
  it('ignores rows of other kinds', () => {
    expect(carriedWiden([{ ...row('2026-09-18', 0, 50, 0, 90), kind: 'month_total' }])).toBeNull();
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
