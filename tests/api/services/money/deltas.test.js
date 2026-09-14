/**
 * What changed: the person against their own past, said only when the change is large in
 * ratio and in euros, with the rows that make it so.
 */
import { describe, it, expect } from 'vitest';
import { categoryDeltas, silenceDeltas, weekdayDelta, paceDelta, deltaFindings, notable, windows } from '../../../../api/services/money/deltas.js';

const NOW = new Date('2026-09-14T12:00:00Z'); // Monday noon
const DAY = 86400000;
const tx = (daysAgo, amount, merchant, category, extra = {}) => ({ id: `${merchant}-${daysAgo}-${amount}`, occurred_at: new Date(NOW.getTime() - daysAgo * DAY + 3600000).toISOString(), amount: -amount, merchant_raw: merchant, merchant_key: merchant.toLowerCase(), category, ...extra });
/* Four baseline weeks of 40\u00a0\u20ac eating out (two 20s a week), then a 96\u00a0\u20ac week. */
function eatingOut() {
  const rows = [];
  for (let w = 1; w <= 4; w += 1) { rows.push(tx(w * 7 + 1, 20, 'La Tasca', 'eating out')); rows.push(tx(w * 7 + 4, 20, 'Bar Pepe', 'eating out')); }
  rows.push(tx(1, 48, 'La Tasca', 'eating out')); rows.push(tx(3, 30, 'Bar Pepe', 'eating out')); rows.push(tx(5, 18, 'Cafe Sol', 'eating out'));
  return rows;
}

describe('notable', () => {
  it('needs both a ratio and euros', () => {
    expect(notable(96, 40)).toBe(true);
    expect(notable(12, 40)).toBe(true);
    expect(notable(50, 40)).toBe(false);
    expect(notable(9, 3)).toBe(false);
    expect(notable(20, 0)).toBe(true);
  });
  it('cuts the last seven days and four weeks before them', () => {
    const w = windows(NOW);
    expect(w.baseline.length).toBe(4);
    expect(w.current.to).toBe(NOW.getTime());
    expect(w.baseline[3].from).toBe(NOW.getTime() - 35 * DAY);
  });
});

describe('categoryDeltas', () => {
  it('says a kind of place is up against its usual week, with the receipts', () => {
    const [f] = categoryDeltas(eatingOut(), { categoryOf: (t) => t.category, now: NOW });
    expect(f.kind).toBe('delta_category');
    expect(f.sentence).toBe('Eating out: 96,00\u00a0\u20ac this week, usually 40,00\u00a0\u20ac.');
    expect(f.detail).toBe('3 payments in seven days; usually 2.');
    expect(f.receipts.map((r) => r.merchant_raw)).toEqual(['La Tasca', 'Bar Pepe', 'Cafe Sol']);
    expect(f.numbers).toMatchObject({ category: 'eating out', current: 96, usual: 40, ratio: 2.4 });
  });
  it('stays quiet inside the noise, without a baseline, and on recurring charges', () => {
    /* A week like the others: two twenties. */
    const calm = eatingOut().filter((t) => ![-48, -30, -18].includes(Number(t.amount))).concat([tx(1, 20, 'La Tasca', 'eating out'), tx(4, 20, 'Bar Pepe', 'eating out')]);
    expect(categoryDeltas(calm, { categoryOf: (t) => t.category, now: NOW })).toEqual([]);
    expect(categoryDeltas([tx(1, 96, 'La Tasca', 'eating out')], { categoryOf: (t) => t.category, now: NOW })).toEqual([]);
    expect(categoryDeltas(eatingOut().map((t) => ({ ...t, is_recurring: true })), { categoryOf: (t) => t.category, now: NOW })).toEqual([]);
  });
});

describe('silenceDeltas', () => {
  const renfe = { merchant_key: 'renfe', name: 'Renfe Cercanias', times: 8, median_gap_days: 3, typical_amount: 1.7, first_seen: '2026-06-22T08:00:00Z', last_seen: new Date(NOW.getTime() - 9 * DAY).toISOString() };
  it('names a habit gone quiet, in days and usual gap', () => {
    const [f] = silenceDeltas([renfe], { now: NOW });
    expect(f.sentence).toBe('No Renfe Cercanias in 9 days; usually every 3 days.');
    expect(f.numbers).toMatchObject({ days_since: 9, usual_gap_days: 3 });
  });
  it('does not count days away against a habit, and says so', () => {
    const away = [{ from: '2026-09-06', to: '2026-09-12', title: 'Viaje' }];
    expect(silenceDeltas([renfe], { now: NOW, away })).toEqual([]);
    const tenDays = { ...renfe, last_seen: new Date(NOW.getTime() - 16 * DAY).toISOString() };
    const [f] = silenceDeltas([tenDays], { now: NOW, away });
    expect(f.sentence).toBe('No Renfe Cercanias in 10 days, 6 away not counted; usually every 3 days.');
    expect(f.numbers).toMatchObject({ days_since: 10, away_days: 6 });
  });
  it('ignores a merchant seen recently, a rare one, and a slow rhythm', () => {
    expect(silenceDeltas([{ ...renfe, last_seen: new Date(NOW.getTime() - 4 * DAY).toISOString() }], { now: NOW })).toEqual([]);
    expect(silenceDeltas([{ ...renfe, times: 3 }], { now: NOW })).toEqual([]);
    expect(silenceDeltas([{ ...renfe, median_gap_days: 30, last_seen: new Date(NOW.getTime() - 61 * DAY).toISOString() }], { now: NOW })).toEqual([]);
  });
});

describe('weekdayDelta and paceDelta', () => {
  it('reads yesterday against the six same weekdays before', () => {
    /* Sundays cost 40 for six weeks; yesterday, Sunday, cost 12. */
    const rows = [];
    for (let w = 1; w <= 6; w += 1) rows.push(tx(1 + 7 * w, 40, 'Mercado', 'groceries'));
    rows.push(tx(1, 12, 'Mercado', 'groceries'));
    const f = weekdayDelta(rows, { now: NOW });
    expect(f.sentence).toBe('Sunday cost 12,00\u00a0\u20ac; the six before, 40,00\u00a0\u20ac in the middle.');
    expect(f.detail).toBe('1 payment: Mercado.');
    expect(weekdayDelta(rows.slice(0, 3), { now: NOW })).toBeNull();
  });
  it('reads the week against a usual week', () => {
    const f = paceDelta(eatingOut(), { now: NOW });
    expect(f.sentence).toBe('96,00\u00a0\u20ac in the last seven days; a usual week of yours is 40,00\u00a0\u20ac.');
  });
  it('keeps three at most, largest change first', () => {
    const rows = eatingOut();
    const out = deltaFindings({ transactions: rows, profiles: [], categoryOf: (t) => t.category, now: NOW });
    expect(out.length).toBeLessThanOrEqual(3);
    /* Category and pace tie at 56\u00a0\u20ac of change and keep their order; yesterday's Sunday (48 against 20) comes third. */
    expect(out.map((f) => f.kind)).toEqual(['delta_category', 'delta_pace', 'delta_weekday']);
    expect(out[0]).not.toHaveProperty('change');
  });
});

describe('the calendar\'s word for the week', () => {
  it('goes on the week comparisons and nowhere else', () => {
    const [f] = deltaFindings({ transactions: eatingOut(), categoryOf: (t) => t.category, now: NOW, week: 'an exam week' });
    expect(f.kind).toBe('delta_category');
    expect(f.detail).toBe('3 payments in seven days; usually 2. It was an exam week.');
    expect(f.numbers.week).toBe('an exam week');
  });
});
