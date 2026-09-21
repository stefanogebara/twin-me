/**
 * The two lines with evidence behind them: a charge ahead the month cannot carry, and a
 * named expense on its way; and the rule that retires a kind people mute.
 */
import { describe, it, expect } from 'vitest';
import { upcoming, chargeAhead, namedExpense, nudgeFindings, retiredKinds, CHARGE_AHEAD, NAMED_EXPENSE } from '../../../../api/services/money/nudges.js';

const NOW = new Date('2026-09-14T12:00:00Z'); // a Monday
const cast = {
  committed: 114.12,
  committed_items: [
    { merchant_key: 'higgsfield', merchant_name: 'Higgsfield', typical_amount: 53.96, next_expected: '2026-09-16' },
    { merchant_key: 'vercel', merchant_name: 'Vercel', typical_amount: 73.34, next_expected: '2026-09-23' },
  ],
  commitment_items: [{ subject: 'Habitacion', amount: 600, due_on: '2026-10-01' }],
  calendar_items: [{ title: 'Dinner with Ana', day: '2026-09-15', amount: 24 }, { title: 'Lecture', day: '2026-09-15', amount: 0 }],
};

describe('upcoming', () => {
  it('lists every dated charge ahead in one shape, soonest first, past ones dropped', () => {
    const items = upcoming({ ...cast, committed_items: cast.committed_items.concat([{ merchant_key: 'old', merchant_name: 'Old', typical_amount: 5, next_expected: '2026-09-10' }]) }, NOW);
    expect(items.map((i) => [i.name, i.amount, i.on, i.source])).toEqual([
      ['Dinner with Ana', 24, '2026-09-15', 'calendar'],
      ['Higgsfield', 53.96, '2026-09-16', 'series'],
      ['Vercel', 73.34, '2026-09-23', 'series'],
      ['Habitacion', 600, '2026-10-01', 'stated'],
    ]);
  });

  it('takes the calendar in its own shape, and still reads the older one', () => {
    /* calendarForecast sends { title, day, amount }; an earlier reader asked for e.on and
       e.expected.amount, so a priced day in the diary was never a charge ahead. */
    const own = upcoming({ ...cast, committed_items: [], commitment_items: [], calendar_items: [{ title: 'Trip to Valencia', day: '2026-09-26', amount: 48.5 }] }, NOW);
    expect(own.map((i) => [i.name, i.amount, i.on, i.source])).toEqual([['Trip to Valencia', 48.5, '2026-09-26', 'calendar']]);

    const older = upcoming({ ...cast, committed_items: [], commitment_items: [], calendar_items: [{ label: 'Trip to Valencia', on: '2026-09-26T09:00:00Z', expected: { amount: 48.5 } }] }, NOW);
    expect(older.map((i) => [i.name, i.amount, i.on, i.source])).toEqual([['Trip to Valencia', 48.5, '2026-09-26', 'calendar']]);
  });
});

describe('chargeAhead', () => {
  it('speaks when the week\'s charges outrun what is left before them, naming them', () => {
    /* free is what is left after the month's committed charges; before this week's two
       land there is free + committed = 60, and they come to 77,96. */
    const f = chargeAhead({ cast, allowance: { free: -54.12 }, now: NOW });
    expect(f.kind).toBe(CHARGE_AHEAD);
    expect(f.month).toBe('2026-09-16');
    expect(f.numbers).toMatchObject({ total: 77.96, left_before: 60, count: 2, by: '2026-09-16' });
    expect(f.sentence).toMatch(/77,96/);
    expect(f.sentence).toMatch(/by Wednesday/);
    expect(f.detail).toMatch(/Dinner with Ana .*24,00.*Higgsfield .*53,96/);
  });
  it('says nothing when the month can carry them, or when there is no basis', () => {
    expect(chargeAhead({ cast, allowance: { free: 200 }, now: NOW })).toBeNull();
    expect(chargeAhead({ cast, allowance: { free: null }, now: NOW })).toBeNull();
    expect(chargeAhead({ cast: null, allowance: { free: -100 }, now: NOW })).toBeNull();
  });
});

describe('namedExpense', () => {
  it('names the largest charge due within three days, above the floor', () => {
    const f = namedExpense({ cast, now: NOW });
    expect(f).toMatchObject({ kind: NAMED_EXPENSE, month: '2026-09-16', numbers: { name: 'Higgsfield', amount: 53.96 } });
    expect(f.sentence).toBe('Higgsfield, 53,96\u00a0\u20ac, leaves Wednesday.');
  });
  it('is quiet under the floor and beyond three days', () => {
    expect(namedExpense({ cast: { committed_items: [{ merchant_name: 'Metro', typical_amount: 1.7, next_expected: '2026-09-15' }] }, now: NOW })).toBeNull();
    expect(namedExpense({ cast: { commitment_items: [{ subject: 'Habitacion', amount: 600, due_on: '2026-10-01' }] }, now: NOW })).toBeNull();
  });
  it('does not repeat a charge the shortfall line already names', () => {
    const lines = nudgeFindings({ cast, allowance: { free: -54.12 }, now: NOW });
    expect(lines.map((l) => l.kind)).toEqual([CHARGE_AHEAD]);
    const calm = nudgeFindings({ cast, allowance: { free: 200 }, now: NOW });
    expect(calm.map((l) => l.kind)).toEqual([NAMED_EXPENSE]);
  });
});

describe('retiredKinds', () => {
  const rows = (kind, n, muted, acted) => Array.from({ length: n }, (_, i) => ({ kind, verdict: i < muted ? 'not_me' : i < muted + acted ? 'true' : null }));
  it('retires a kind muted more than acted on, only after thirty deliveries', () => {
    expect(retiredKinds(rows('small_payments', 30, 5, 2))).toEqual(new Set(['small_payments']));
    expect(retiredKinds(rows('small_payments', 29, 10, 0))).toEqual(new Set());
    expect(retiredKinds(rows('small_payments', 40, 3, 3))).toEqual(new Set());
    expect(retiredKinds(rows('month_pace', 40, 0, 0).concat(rows('named_expense', 31, 4, 1)))).toEqual(new Set(['named_expense']));
  });
});

describe('what a nudge may not say', () => {
  it('stays silent about the month on a balance basis, and a dated nudge expires once its day has passed', async () => {
    const { chargeAhead, expiredNudge, CHARGE_AHEAD, NAMED_EXPENSE } = await import('../../../../api/services/money/nudges.js');
    const cast = { committed_items: [{ merchant_key: 'higgsfield', merchant_name: 'Higgsfield', typical_amount: 53.96, next_expected: '2026-09-22' }], committed: 53.96, month: '2026-09-01' };
    expect(chargeAhead({ cast, allowance: { free: -54.12, basis: 'balance' }, now: new Date('2026-09-21T10:00:00Z') })).toBeNull();
    expect(chargeAhead({ cast, allowance: { free: -54.12, basis: 'income' }, now: new Date('2026-09-21T10:00:00Z') })).not.toBeNull();
    const now = new Date('2026-09-21T10:00:00Z');
    expect(expiredNudge({ kind: NAMED_EXPENSE, month: '2026-09-16', numbers: { on: '2026-09-16' } }, now)).toBe(true);
    expect(expiredNudge({ kind: CHARGE_AHEAD, month: '2026-09-22', numbers: { by: '2026-09-22' } }, now)).toBe(false);
    expect(expiredNudge({ kind: 'month_pace', month: '2026-09-01', numbers: {} }, now)).toBe(false);
  });
});
