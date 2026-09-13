/**
 * The twin grades its own homework: the month and the day it writes down, how each is
 * scored, and how the record reads together with the charges the store already scores.
 */
import { describe, it, expect } from 'vitest';
import { predictionsFrom, scoreOne, summarise } from '../../../../api/services/money/predictions.js';

const NOW = new Date('2026-09-13T12:00:00Z');
const counts = () => true;
const t = (id, occurred_at, amount, merchant_key) => ({ id, occurred_at, amount, merchant_key, channel: 'card' });

describe('predictionsFrom', () => {
  it('keeps the month with its band, and today', () => {
    const rows = predictionsFrom({
      cast: { month: '2026-09-01', projected_p10: 900, projected_p50: 1075.86, projected_p90: 1318.21 },
      allowance: { amount: 51.95 },
      now: NOW,
    });
    expect(rows.map((r) => r.kind)).toEqual(['month_total', 'safe_today']);
    expect(rows[0]).toMatchObject({ predicted_for: '2026-09-30', predicted_on: '2026-09-13', value: 1075.86, low: 900, high: 1318.21 });
    expect(rows[1]).toMatchObject({ predicted_for: '2026-09-13', value: 51.95 });
  });
  it('writes nothing when there is nothing to say', () => {
    expect(predictionsFrom({ now: NOW })).toEqual([]);
    expect(predictionsFrom({ cast: { month: '2026-09-01' }, allowance: { amount: null }, now: NOW })).toEqual([]);
  });
});

describe('scoreOne', () => {
  it('leaves a running month alone and scores a finished one against its band', () => {
    const p = { kind: 'month_total', predicted_for: '2026-08-31', value: 600, low: 500, high: 700 };
    const rows = [t('a', '2026-08-03T10:00:00Z', -250, 'x'), t('b', '2026-08-20T10:00:00Z', -332.87, 'y'), t('c', '2026-09-02T10:00:00Z', -99, 'z')];
    expect(scoreOne({ ...p, predicted_for: '2026-09-30' }, rows, counts, NOW)).toBe(null);
    const s = scoreOne(p, rows, counts, NOW);
    expect(s.actual).toBe(582.87);
    expect(s.error).toBe(-17.13);
    expect(s.hit).toBe(true);
    expect(scoreOne({ ...p, low: 600, high: 700 }, rows, counts, NOW).hit).toBe(false);
  });
  it('scores a day as kept when the day stayed under what was safe', () => {
    const p = { kind: 'safe_today', predicted_for: '2026-09-12', value: 50 };
    const rows = [t('a', '2026-09-12T10:00:00Z', -19.99, 'cabify'), t('b', '2026-09-12T18:00:00Z', -9.5, 'oakberry'), t('c', '2026-09-13T10:00:00Z', -80, 'x')];
    const s = scoreOne(p, rows, counts, NOW);
    expect(s.actual).toBe(29.49);
    expect(s.hit).toBe(true);
    expect(scoreOne({ ...p, predicted_for: '2026-09-13' }, rows, counts, NOW)).toBe(null);
  });
  it('applies the spending rule, so a friend paid back is not a day\'s spending', () => {
    const p = { kind: 'safe_today', predicted_for: '2026-09-12', value: 50 };
    const rows = [t('a', '2026-09-12T10:00:00Z', -200, 'rafaella')];
    expect(scoreOne(p, rows, (x) => x.merchant_key !== 'rafaella', NOW).actual).toBe(0);
  });
  it('says nothing about a kind it does not score', () => {
    expect(scoreOne({ kind: 'next_charge', predicted_for: '2026-09-01' }, [], counts, NOW)).toBe(null);
  });
});

describe('summarise', () => {
  it('reads the store\'s scored charges beside the month and the days', () => {
    const charges = [
      { expected_on: '2026-09-04', typical_amount: 11.99, happened: true, happened_on: '2026-09-04', happened_amount: 11.99 },
      { expected_on: '2026-09-01', typical_amount: 18.63, happened: true, happened_on: '2026-09-03', happened_amount: 18.63 },
      { expected_on: '2026-09-02', typical_amount: 6.09, happened: false, happened_on: null, happened_amount: null },
      { expected_on: '2026-09-20', typical_amount: 53.96, happened: null },
      /* Kept to itself: below the confidence the twin speaks at, so not held as a miss. */
      { expected_on: '2026-09-09', typical_amount: 6, confidence: 0.17, happened: false, happened_on: null, happened_amount: null },
    ];
    const figures = [
      { kind: 'month_total', predicted_for: '2026-08-31', value: 600, low: 500, high: 700, actual: 582.87, hit: true, scored_at: 'x' },
      { kind: 'safe_today', predicted_for: '2026-09-12', value: 50, actual: 29.49, hit: true, scored_at: 'x' },
      { kind: 'safe_today', predicted_for: '2026-09-13', value: 50, actual: null, hit: null, scored_at: null },
    ];
    const s = summarise(figures, charges);
    expect(s.charges).toEqual({ expected: 3, arrived: 2, on_day: 1, on_amount: 2 });
    expect(s.last_month).toMatchObject({ month: '2026-08', said: 600, actual: 582.87, within_band: true });
    expect(s.days).toEqual({ counted: 1, kept: 1 });
  });
  it('is empty numbers, not a crash, with nothing scored', () => {
    expect(summarise([], []).last_month).toBe(null);
  });
});

describe('the day, written down and scored', () => {
  it('records tomorrow with its band, never a day already here', () => {
    const rows = predictionsFrom({ day: { predicted_for: '2026-09-14', value: 18, low: 4, high: 40 }, now: NOW });
    expect(rows).toEqual([{ kind: 'day_total', predicted_for: '2026-09-14', predicted_on: '2026-09-13', value: 18, low: 4, high: 40 }]);
    expect(predictionsFrom({ day: { predicted_for: '2026-09-13', value: 18, low: 4, high: 40 }, now: NOW })).toEqual([]);
  });
  it('scores the day on discretionary spending, recurring charges left out', () => {
    const p = { kind: 'day_total', predicted_for: '2026-09-12', value: 18, low: 4, high: 40 };
    const rows = [t('a', '2026-09-12T10:00:00Z', -12.5, 'cafe'), t('b', '2026-09-12T18:00:00Z', -20, 'shop'), { ...t('c', '2026-09-12T09:00:00Z', -9.99, 'spotify'), is_recurring: true }];
    expect(scoreOne(p, rows, counts, NOW)).toEqual({ actual: 32.5, error: 14.5, hit: true });
    expect(scoreOne(p, rows.concat([t('d', '2026-09-12T20:00:00Z', -30, 'bar')]), counts, NOW)).toMatchObject({ actual: 62.5, hit: false });
    expect(scoreOne({ ...p, predicted_for: '2026-09-13' }, rows, counts, NOW)).toBeNull();
  });
  it('summarises the band from the scored days', () => {
    const figures = Array.from({ length: 5 }, (_, i) => ({ kind: 'day_total', predicted_for: `2026-09-0${i + 1}`, value: 20, low: 10, high: 30, actual: 22, hit: true, scored_at: '2026-09-10T00:00:00Z' }));
    const s = summarise(figures, []);
    expect(s.band).toEqual({ days: 5, coverage: 1, widen: 0, trusted: false });
  });
});
