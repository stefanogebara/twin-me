/**
 * The plan lays a month out as cells from what the ledger, the projection and the person
 * already said. It computes nothing new and never puts an item on a day of another month.
 */
import { describe, it, expect } from 'vitest';
import { monthPlan, planLine, NOTE_SUBJECT, isDayNote } from '../../../../api/services/money/plan.js';

const NOW = new Date('2026-09-15T12:00:00Z');
const t = (occurred_at, amount, extra = {}) => ({ id: occurred_at + amount, occurred_at, amount, merchant_key: 'x', ...extra });
const forecast = {
  month: '2026-09-01',
  days: { days: [
    { day: '2026-09-13', total: 42.1, count: 3, today: false, said: { value: 30, low: 10, high: 60 }, hit: true },
    { day: '2026-09-14', total: 120, count: 2, today: false, said: { value: 30, low: 10, high: 60 }, hit: false },
    { day: '2026-09-15', total: 5, count: 1, today: true, said: null, hit: null },
  ] },
  tomorrow: { day: '2026-09-16', value: 14.02, low: 0, high: 32.5 },
  committed_items: [
    { merchant_key: 'higgsfield', merchant_name: 'Higgsfield', typical_amount: '53.96', next_expected: '2026-09-22', cadence: 'monthly' },
    { merchant_key: 'spotify', merchant_name: 'Spotify', typical_amount: 11.99, next_expected: '2026-10-04', cadence: 'monthly' },
  ],
  commitment_items: [{ subject: 'Rent', amount: 200, due_on: '2026-10-05' }, { subject: 'Gym', amount: 35, due_on: '2026-09-28' }],
  income_items: [{ subject: 'Mauad G.', amount: 100, due_on: '2026-09-24', said: false, confidence: 0.83 }],
  /* The shape calendar.js sends: title, day, amount. This line used to carry a shape nothing
     produces, which is how a mismatch in plan.js survived (2026-09-16). */
  calendar_items: [{ title: 'Trip to Valencia', day: '2026-09-26', amount: 48.5 }, { title: 'Final exam', day: '2026-09-29', amount: 0 }],
};
const rows = [
  t('2026-09-13T10:00:00Z', -30), t('2026-09-13T18:00:00Z', -12.1), t('2026-09-14T09:00:00Z', -120),
  t('2026-09-15T08:00:00Z', -5), t('2026-09-02T08:00:00Z', 1750), t('2026-08-30T08:00:00Z', -99),
  t('2026-09-03T08:00:00Z', -60, { merchant_key: 'transfer to savings' }),
];
const facts = [{ id: 'f1', kind: 'note', subject: 'day-2026-09-26', value: 'Valencia with Ana, train booked' }, { id: 'f2', kind: 'note', subject: 'rent-abc', value: 'not a day' }];

describe('monthPlan', () => {
  const plan = monthPlan({ forecast, transactions: rows, facts, now: NOW });
  const cell = (d) => plan.cells.find((c) => c.day === d);

  it('lays September out Monday-first with every day once', () => {
    expect(plan.month).toBe('2026-09-01');
    expect(plan.days_in_month).toBe(30);
    expect(plan.first_weekday).toBe(1); /* 1 Sept 2026 is a Tuesday */
    expect(plan.cells.map((c) => c.dom)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(cell('2026-09-15').today).toBe(true);
    expect(cell('2026-09-14').past).toBe(true);
    expect(cell('2026-09-16').past).toBe(false);
    expect(plan.today).toBe('2026-09-15');
  });

  it('a past day carries what it cost, its count, and the range it was given', () => {
    expect(cell('2026-09-13')).toMatchObject({ spent: 42.1, count: 2, said: { low: 10, high: 60 }, hit: true });
    expect(cell('2026-09-13').rows.map((r) => r.amount)).toEqual([-30, -12.1]);
    expect(cell('2026-09-02').rows[0]).toMatchObject({ amount: 1750 });
    expect(cell('2026-09-14')).toMatchObject({ spent: 120, count: 1, hit: false });
    expect(cell('2026-09-02')).toMatchObject({ spent: 0, received: 1750 });
    expect(cell('2026-09-16').said).toEqual({ low: 0, high: 32.5 });
  });

  it('a coming day carries the items due on it, and only this month\'s', () => {
    expect(cell('2026-09-22').items).toEqual([{ kind: 'charge', label: 'Higgsfield', amount: 53.96, cadence: 'monthly' }]);
    expect(cell('2026-09-22').expected).toBe(53.96);
    expect(cell('2026-09-28').items[0]).toMatchObject({ kind: 'commitment', label: 'Gym', amount: 35 });
    expect(cell('2026-09-24').items[0]).toMatchObject({ kind: 'income', label: 'Mauad G.', amount: 100, said: false, confidence: 0.83 });
    expect(cell('2026-09-24').expected).toBe(0);
    expect(cell('2026-09-26').items[0]).toMatchObject({ kind: 'calendar', label: 'Trip to Valencia', amount: 48.5 });
    expect(cell('2026-09-29').items[0]).toMatchObject({ kind: 'calendar', label: 'Final exam', amount: 0 });
    expect(plan.cells.flatMap((c) => c.items).some((i) => i.label === 'Spotify' || i.label === 'Rent')).toBe(false);
  });

  it('the note on a day is the person\'s, and only day notes are read', () => {
    expect(cell('2026-09-26').note).toEqual({ id: 'f1', text: 'Valencia with Ana, train booked' });
    expect(plan.cells.filter((c) => c.note).length).toBe(1);
    expect(NOTE_SUBJECT('2026-09-26')).toBe('day-2026-09-26');
    expect(isDayNote(facts[0])).toBe(true);
    expect(isDayNote(facts[1])).toBe(false);
  });

  it('totals are sums of the cells, and the peak is the costliest day', () => {
    expect(plan.totals).toEqual({ spent_to_day: 227.1, expected_rest: 137.46, income_ahead: 100, days_ahead: 4 });
    expect(plan.peak).toEqual({ day: '2026-09-14', amount: 120 });
  });

  it('a spending rule keeps transfers out of the day', () => {
    const p = monthPlan({ forecast, transactions: rows, facts, now: NOW, isSpending: (x) => !/transfer/.test(x.merchant_key) });
    expect(p.cells.find((c) => c.day === '2026-09-03').spent).toBe(0);
    expect(cell('2026-09-03').spent).toBe(60);
  });

  it('another month gets its own rows and none of the projection\'s items', () => {
    const p = monthPlan({ forecast, transactions: rows, facts, month: '2026-08', now: NOW });
    expect(p.month).toBe('2026-08-01');
    expect(p.days_in_month).toBe(31);
    expect(p.today).toBe(null);
    expect(p.cells.find((c) => c.day === '2026-08-30').spent).toBe(99);
    expect(p.cells.every((c) => c.past)).toBe(true);
    expect(p.cells.flatMap((c) => c.items)).toEqual([]);
  });

  it('says the month in one computed sentence', () => {
    expect(planLine(plan, { now: NOW })).toBe('September: 227,10 EUR so far; 137,46 EUR expected on 4 days ahead, 100,00 EUR coming in.');
    expect(planLine(monthPlan({ forecast, transactions: rows, facts, month: '2026-08', now: NOW }), { now: NOW })).toBe('August: 99,00 EUR.');
    expect(planLine(monthPlan({ forecast: null, transactions: [], now: NOW }), { now: NOW })).toBe('September: 0,00 EUR so far.');
  });
});

/* 2026-09-16: a day in the diary with a learned cost never reached a square, because the plan
   read fields the calendar does not send. Both shapes are covered now, so neither side can
   drift away alone again. */
describe('a day in the diary lands on its square', () => {
  it('takes the shape calendar.js sends', () => {
    const p = monthPlan({ forecast: { month: '2026-09-01', calendar_items: [{ title: 'Trip to Valencia', day: '2026-09-26', amount: 120 }] }, transactions: [], facts: [], now: NOW });
    const cell = p.cells.find((c) => c.day === '2026-09-26');
    expect(cell.items.map((i) => [i.kind, i.label, i.amount])).toEqual([['calendar', 'Trip to Valencia', 120]]);
    expect(cell.expected).toBe(120);
  });
  it('still takes the older shape, so a caller that sends it is not silently dropped', () => {
    const p = monthPlan({ forecast: { month: '2026-09-01', calendar_items: [{ title: 'Exam week', on: '2026-09-24', expected: { amount: 40 } }] }, transactions: [], facts: [], now: NOW });
    const cell = p.cells.find((c) => c.day === '2026-09-24');
    expect(cell.items.map((i) => [i.kind, i.amount])).toEqual([['calendar', 40]]);
  });
});

describe('the diary on the plan', () => {
  it('lists a coming event of the month even when its kind of day has no learned cost', async () => {
    const { monthPlan } = await import('../../../../api/services/money/plan.js');
    const now = new Date('2026-09-21T10:00:00Z');
    const facts = [{ kind: 'event_spend_meta', subject: '', value: JSON.stringify({ snapshot: [
      { id: 'e1', title: 'R Homework', start: '2026-09-24T12:00:00+02:00', end: '2026-09-24T13:00:00+02:00', all_day: false },
      { id: 'e2', title: 'Old thing', start: '2026-09-02T12:00:00+02:00', end: '2026-09-02T13:00:00+02:00', all_day: false },
      { id: 'e3', title: 'October', start: '2026-10-02T12:00:00+02:00', end: '2026-10-02T13:00:00+02:00', all_day: false },
    ] }) }];
    const plan = monthPlan({ forecast: null, transactions: [], facts, now });
    const items = plan.cells.flatMap((c) => c.items.map((i) => ({ day: c.day, ...i })));
    expect(items).toEqual([{ day: '2026-09-24', kind: 'calendar', label: 'R Homework', amount: 0 }]);
  });
});
