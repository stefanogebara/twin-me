/** The stretch of time a question names, in the past: a weekday, a night, a weekend, a date, a range, since a date. */
import { describe, expect, it } from 'vitest';
import { askedAhead, askedWindows, askedLines, askedDays } from '../../../../api/services/money/asked.js';

/* Sunday 2026-09-20 at 12:00 in Madrid (10:00 UTC). */
const sun = new Date('2026-09-20T10:00:00Z');
const wed = new Date('2026-09-16T10:00:00Z');
const madrid = (day, hh = '00') => new Date(`${day}T${hh}:00:00+02:00`).getTime();

describe('askedWindows', () => {
  it('reads the most recent weekday, in three languages, and "last" from the same weekday', () => {
    expect(askedWindows('How much did I spend on Saturday?', sun)).toEqual([{ key: 'asked', label: 'Saturday 19 September', from: madrid('2026-09-19'), to: madrid('2026-09-20') }]);
    expect(askedWindows('cuanto gaste el sabado', sun)[0].label).toBe('Saturday 19 September');
    expect(askedWindows('quanto gastei no sabado', sun)[0].label).toBe('Saturday 19 September');
    expect(askedWindows('what did I spend last Sunday', sun)[0].label).toBe('Sunday 13 September');
    expect(askedWindows('how much on Sunday', sun)[0].label).toBe('Sunday 20 September, so far');
  });
  it('reads a weekday night as 18:00 to 06:00 the next day', () => {
    expect(askedWindows('How much did I spend last Friday night?', sun)).toEqual([{ key: 'asked', label: 'Friday 18 September night (18:00 to 06:00)', from: madrid('2026-09-18', '18'), to: madrid('2026-09-19', '06') }]);
    expect(askedWindows('quanto gastei na sexta a noite', sun)[0].label).toBe('Friday 18 September night (18:00 to 06:00)');
    expect(askedWindows('cuanto gaste el viernes por la noche', sun)[0].label).toBe('Friday 18 September night (18:00 to 06:00)');
  });
  it('reads a morning and an afternoon', () => {
    expect(askedWindows('How much did I spend on Sunday morning?', sun)[0]).toEqual({ key: 'asked', label: 'Sunday 20 September morning (06:00 to 12:00)', from: madrid('2026-09-20', '06'), to: madrid('2026-09-20', '12') });
    expect(askedWindows('que gaste el sabado por la tarde', sun)[0].label).toBe('Saturday 19 September afternoon (12:00 to 18:00)');
    expect(askedWindows('quanto gastei sexta de manha', sun)[0].label).toBe('Friday 18 September morning (06:00 to 12:00)');
  });
  it('reads this weekend and last weekend as Saturday to Monday 06:00, and both for a comparison', () => {
    const w = askedWindows('This weekend versus last weekend?', sun);
    expect(w.map((x) => x.label)).toEqual(['This weekend (19 and 20 September, so far)', 'Last weekend (12 and 13 September)']);
    expect(w[1]).toMatchObject({ from: madrid('2026-09-12'), to: madrid('2026-09-14', '06') });
    expect(w[0].to).toBe(sun.getTime() + 60000);
    expect(askedWindows('and the weekend before?', sun)[0]).toMatchObject({ label: 'The weekend before last (5 and 6 September)', from: madrid('2026-09-05'), to: madrid('2026-09-07', '06') });
    expect(askedWindows('two weekends ago', wed)[0].label).toBe('The weekend before last (5 and 6 September)');
    expect(askedWindows('o fim de semana anterior', sun)[0].label).toBe('The weekend before last (5 and 6 September)');
    /* midweek, this weekend has not happened: only last weekend is a stretch */
    expect(askedWindows('what did this weekend cost', wed)).toEqual([]);
    expect(askedAhead('what did this weekend cost', wed)).toEqual(['Asked stretch, This weekend: has not come yet; it starts Saturday 19 September.']);
    expect(askedAhead('what did this weekend cost', sun)).toEqual([]);
    expect(askedLines([], 'This weekend versus last weekend?', wed)).toEqual(['Asked stretch, Last weekend (12 and 13 September): nothing spent, not one payment in that stretch.', 'Asked stretch, This weekend: has not come yet; it starts Saturday 19 September.']);
    expect(askedWindows('what did last weekend cost', wed)[0].label).toBe('Last weekend (12 and 13 September)');
  });
  it('reads a date of this month, or the last month when it has not come yet', () => {
    expect(askedWindows('What did I spend on the 15th?', sun)).toEqual([{ key: 'asked', label: '15 September', from: madrid('2026-09-15'), to: madrid('2026-09-16') }]);
    expect(askedWindows('que gaste el dia 15', sun)[0].label).toBe('15 September');
    expect(askedWindows('o que gastei dia 15 de setembro', sun)[0].label).toBe('15 September');
    expect(askedWindows('what did I spend on the 25th', sun)[0].label).toBe('25 August');
    expect(askedWindows('can I afford 60 tonight', sun)).toEqual([]); // a bare number is an amount
  });
  it('reads a range between two dates and since a date', () => {
    expect(askedWindows('How much did I spend between the 8th and the 14th?', sun)).toEqual([{ key: 'asked', label: '8 to 14 September', from: madrid('2026-09-08'), to: madrid('2026-09-15') }]);
    expect(askedWindows('cuanto gaste del 8 al 14', sun)[0].label).toBe('8 to 14 September');
    expect(askedWindows('quanto gastei de 8 a 14 de setembro', sun)[0].label).toBe('8 to 14 September');
    expect(askedWindows('How much have I spent since the 1st?', sun)).toEqual([{ key: 'asked', label: 'Since 1 September', from: madrid('2026-09-01'), to: sun.getTime() + 60000 }]);
    expect(askedWindows('cuanto llevo gastado desde el lunes', sun)[0].label).toBe('Since Monday 14 September');
  });
  it('leaves the fixed windows to windows.js', () => {
    expect(askedWindows('how much did I spend yesterday', sun)).toEqual([]);
    expect(askedWindows('how much last night', sun)).toEqual([]);
    expect(askedWindows('and this week?', sun)).toEqual([]);
    expect(askedWindows('what comes back every month', sun)).toEqual([]);
  });
});

describe('askedLines', () => {
  const tx = (id, iso, amount, extra = {}) => ({ id, occurred_at: iso, amount, currency: 'EUR', merchant_raw: id, merchant_key: id, ...extra });
  const ledger = [
    tx('bar', '2026-09-18T20:30:00Z', -22.36),   // Friday 22:30 Madrid: Friday night
    tx('taxi', '2026-09-19T01:10:00Z', -7.1),    // Saturday 03:10: Friday night, and Saturday
    tx('brunch', '2026-09-19T10:00:00Z', -18.5, { merchant_raw: null, merchant_key: null }), // Saturday, no name
    tx('shop', '2026-09-15T10:00:00Z', -134.62), // the 15th
  ];
  it('totals the asked stretch with its kinds and places, and names an unnamed payment honestly', () => {
    const lines = askedLines(ledger, 'How much did I spend on Saturday?', sun, { categoryOf: (t) => (t.id === 'taxi' ? 'transport' : 'food') });
    expect(lines).toEqual(['Asked stretch, Saturday 19 September: spent 25,60 EUR in 2 payments, the largest a payment without a name 18,50 EUR. By kind: food 18,50 EUR (1); transport 7,10 EUR (1). By place: a payment without a name 18,50 EUR (1); taxi 7,10 EUR (1).']);
  });
  it('says nothing spent, and nothing at all when the question names no stretch', () => {
    expect(askedLines(ledger, 'what did I spend on the 16th', sun)).toEqual(['Asked stretch, 16 September: nothing spent, not one payment in that stretch.']);
    expect(askedLines(ledger, 'how much did I spend last Friday night', sun)[0]).toMatch(/^Asked stretch, Friday 18 September night \(18:00 to 06:00\): spent 29,46 EUR in 2 payments, the largest bar 22,36 EUR\./);
    expect(askedLines(ledger, 'am I on track', sun)).toEqual([]);
  });
});

describe('askedDays', () => {
  const tx = (id, iso, amount) => ({ id, occurred_at: iso, amount, currency: 'EUR', merchant_raw: id, merchant_key: id });
  const ledger = [tx('a', '2026-09-08T10:00:00Z', -10), tx('b', '2026-09-12T10:00:00Z', -20), tx('c', '2026-09-13T23:30:00Z', -5) /* 01:30 Monday in Madrid */, tx('d', '2026-09-14T02:00:00Z', -7), tx('e', '2026-09-14T10:00:00Z', -99)];
  it('draws a range a bar per day, and a weekend clipped to Monday 06:00', () => {
    const range = askedDays(ledger, 'graph what I spent between the 8th and the 14th', sun);
    expect(range.label).toBe('8 to 14 September');
    expect(range.days.map((d) => `${d.day.slice(8)}:${d.total}`)).toEqual(['08:10', '09:0', '10:0', '11:0', '12:20', '13:0', '14:111']);
    const weekend = askedDays(ledger, 'a chart of last weekend', sun);
    expect(weekend.days.map((d) => `${d.day.slice(8)}:${d.total}`)).toEqual(['12:20', '13:0', '14:12']); // Monday: the 01:30 and 04:00 payments, before 06:00
  });
  it('is nothing for a single day or a night', () => {
    expect(askedDays(ledger, 'what did I spend on the 12th', sun)).toBeNull();
    expect(askedDays(ledger, 'last friday night', sun)).toBeNull();
    expect(askedDays(ledger, 'am I on track', sun)).toBeNull();
  });
});
