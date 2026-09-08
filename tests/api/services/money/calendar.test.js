/**
 * The calendar lens is deterministic: given events and payments it must always join, learn
 * and read the week ahead the same way, and it must never carry a name or a description into
 * the rows it keeps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
const del = vi.fn();
const inFn = vi.fn();
vi.mock('../../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: (table) => ({
      upsert: (rows, opts) => { upsert(table, rows, opts); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: () => ({ eq: () => ({ not: () => { del(table); return Promise.resolve({ error: null }); }, then: (r) => { del(table); return Promise.resolve({ error: null }).then(r); } }) }) }),
      select: () => ({ in: (col, keys) => { inFn(table, col, keys); return Promise.resolve({ data: [{ merchant_key: 'la tasca', category: 'restaurant', category_override: null }] }); } }),
    }),
  },
}));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
const token = vi.fn();
vi.mock('../../../../api/services/tokenRefreshService.js', () => ({ getValidAccessToken: (...a) => token(...a) }));
const get = vi.fn();
vi.mock('../../../../api/services/calendar/client.js', () => ({ createCalendarClient: () => ({ get: (...a) => get(...a) }) }));
const store = { listTransactions: vi.fn(), listFacts: vi.fn() };
vi.mock('../../../../api/services/money/store.js', () => store);

const cal = await import('../../../../api/services/money/calendar.js');
const {
  normaliseEvent, shapeKey, joinEventsToPayments, learnShapes, expectFor, aheadFrom, routineSummary,
  calendarFromFacts, calendarForecast, calendarLines, learnEventSpend, ahead, MIN_OCCURRENCES, MIN_PAID, FACT_KIND, META_KIND,
} = cal;

const NOW = new Date('2026-09-08T12:00:00Z');
const ev = (id, title, start, end, extra = {}) => ({ id, title, start, end, location: null, attendees_count: 0, recurring: null, all_day: false, ...extra });
const pay = (id, occurred_at, amount, merchant_key, extra = {}) => ({ id, occurred_at, amount, merchant_key, merchant_raw: merchant_key, channel: 'card', ...extra });

/* Four Thursday dinners, three of them paid; two lectures never paid for. */
const dinners = [
  ev('d1', 'Dinner with the flat', '2026-08-13T19:30:00Z', '2026-08-13T22:00:00Z'),
  ev('d2', 'Dinner with the flat', '2026-08-20T19:30:00Z', '2026-08-20T22:00:00Z'),
  ev('d3', 'Dinner with the flat', '2026-08-27T19:30:00Z', '2026-08-27T22:00:00Z'),
  ev('d4', 'Dinner with the flat', '2026-09-03T19:30:00Z', '2026-09-03T22:00:00Z'),
];
const lectures = [
  ev('l1', 'Macro 101', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'),
  ev('l2', 'Macro 101', '2026-09-03T09:00:00Z', '2026-09-03T11:00:00Z'),
  ev('l3', 'Macro 101', '2026-09-08T09:00:00Z', '2026-09-08T11:00:00Z'),
];
const future = [
  ev('f1', 'Dinner with the flat', '2026-09-10T19:30:00Z', '2026-09-10T22:00:00Z'),
  ev('f2', 'Dentist', '2026-09-12T10:00:00Z', '2026-09-12T11:00:00Z'),
];
const payments = [
  pay('p1', '2026-08-13T21:40:00Z', -34.5, 'la tasca'),
  pay('p2', '2026-08-20T22:50:00Z', -41.0, 'la tasca'),      /* 50 minutes after the end: inside the margin */
  pay('p3', '2026-08-27T19:00:00Z', -38.2, 'la tasca'),      /* 30 minutes before the start */
  pay('p4', '2026-08-27T21:00:00Z', -20.0, 'flatmate', { channel: 'bizum' }), /* money moved, not spent */
  pay('p5', '2026-09-03T14:00:00Z', -9.9, 'oakberry'),        /* a Thursday lunch, near nothing */
  pay('p6', '2026-09-01T10:30:00Z', 15.0, 'bizum in', { channel: 'bizum' }),
];

describe('normaliseEvent', () => {
  it('keeps a count of attendees and drops the description', () => {
    const e = normaliseEvent({ id: 'x', summary: 'Dinner', description: 'Ana and Luis, bring wine', attendees: [{ email: 'ana@x' }, { email: 'luis@x' }], start: { dateTime: '2026-09-10T19:30:00Z' }, end: { dateTime: '2026-09-10T22:00:00Z' } });
    expect(e.attendees_count).toBe(2);
    expect(JSON.stringify(e)).not.toMatch(/ana|luis|wine/i);
  });
  it('reads an all-day event and skips a cancelled one', () => {
    expect(normaliseEvent({ id: 'a', summary: 'Trip', start: { date: '2026-09-20' }, end: { date: '2026-09-21' } }).all_day).toBe(true);
    expect(normaliseEvent({ id: 'c', status: 'cancelled', start: { dateTime: '2026-09-10T19:30:00Z' } })).toBeNull();
  });
});

describe('shapeKey', () => {
  it('lowercases, strips dates, times and numbers, keeps three words', () => {
    expect(shapeKey(ev('a', 'Dinner with the flat 12/09 at 19:30', '2026-09-10T19:30:00Z', '2026-09-10T22:00:00Z'))).toBe('dinner with the');
    expect(shapeKey(ev('b', 'Macro 101', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'))).toBe('macro');
  });
  it('keeps recurring series apart', () => {
    const a = ev('a', 'Weekly sync', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z', { recurring: 'r1' });
    const b = ev('b', 'Weekly sync', '2026-09-05T09:00:00Z', '2026-09-05T10:00:00Z', { recurring: 'r2' });
    expect(shapeKey(a)).not.toBe(shapeKey(b));
  });
});

describe('joinEventsToPayments', () => {
  it('joins payments inside the window and within 90 minutes of it, and nothing else', () => {
    const pairs = joinEventsToPayments([...dinners, ...lectures], payments);
    const byPayment = Object.fromEntries(pairs.map((p) => [p.transaction.id, p.event.id]));
    expect(byPayment).toEqual({ p1: 'd1', p2: 'd2', p3: 'd3' });
  });
  it('ignores transfers, bizums, incoming money and payments marked not mine', () => {
    const pairs = joinEventsToPayments(dinners, [
      pay('x1', '2026-08-13T20:00:00Z', -20, 'flatmate', { channel: 'transfer' }),
      pay('x2', '2026-08-13T20:00:00Z', 20, 'la tasca'),
      pay('x3', '2026-08-13T20:00:00Z', -20, 'la tasca', { verdict: 'not_me' }),
    ]);
    expect(pairs).toEqual([]);
  });
  it('prefers the closer of two events', () => {
    const a = ev('a', 'Coffee', '2026-09-01T09:00:00Z', '2026-09-01T09:30:00Z');
    const b = ev('b', 'Lunch', '2026-09-01T13:00:00Z', '2026-09-01T14:00:00Z');
    const [pair] = joinEventsToPayments([a, b], [pay('p', '2026-09-01T12:00:00Z', -12, 'bar')]);
    expect(pair.event.id).toBe('b');
  });
  it('joins an all-day event by date', () => {
    const trip = ev('t', 'Trip to Toledo', '2026-08-30T00:00:00Z', '2026-08-31T00:00:00Z', { all_day: true });
    const [pair] = joinEventsToPayments([trip], [pay('p', '2026-08-30T16:00:00Z', -22, 'renfe')]);
    expect(pair.event.id).toBe('t');
  });
});

describe('learnShapes', () => {
  it('learns a shape that clears the floors, with the median of the paid occurrences', () => {
    const learned = learnShapes([...dinners, ...lectures, ...future], payments, { now: NOW, categoryOf: (t) => (t.merchant_key === 'la tasca' ? 'restaurant' : null) });
    expect(learned).toHaveLength(1);
    const d = learned[0];
    expect(d.key).toBe('dinner with the');
    expect(d.occurrences).toBe(4);
    expect(d.paid).toBe(3);
    expect(d.median).toBe(38.2);
    expect(d.categories).toEqual(['restaurant']);
    expect(d.usual_weekday).toBe(4);
  });
  it('does not learn a shape seen fewer than MIN_OCCURRENCES times or paid fewer than MIN_PAID', () => {
    expect(MIN_OCCURRENCES).toBe(3);
    expect(MIN_PAID).toBe(2);
    const two = dinners.slice(0, 2);
    expect(learnShapes(two, payments, { now: NOW })).toEqual([]);
    const onePaid = [...dinners];
    expect(learnShapes(onePaid, payments.slice(0, 1), { now: NOW })).toEqual([]);
  });
  it('ignores events older than the learning window and events still to come', () => {
    const old = ev('o', 'Dinner with the flat', '2026-05-01T19:30:00Z', '2026-05-01T22:00:00Z');
    const learned = learnShapes([old, ...dinners, ...future], payments, { now: NOW });
    expect(learned[0].occurrences).toBe(4);
  });
});

describe('expectFor and aheadFrom', () => {
  const learned = learnShapes([...dinners, ...lectures], payments, { now: NOW });
  it('expects the median, with a band from the quartiles or a spread when few', () => {
    const e = expectFor(learned[0]);
    expect(e.amount).toBe(38.2);
    expect(e.low).toBeLessThan(e.amount);
    expect(e.high).toBeGreaterThan(e.amount);
    expect(e.basis).toMatch(/3 similar times before, usually around 38,20 EUR/);
    expect(expectFor(null)).toBeNull();
  });
  it('reads the week ahead with expectations, free days and a total', () => {
    const w = aheadFrom([...dinners, ...future], learned, { now: NOW, days: 7 });
    expect(w.ahead.map((i) => i.id)).toEqual(['f1', 'f2']);
    expect(w.ahead[0].expected.amount).toBe(38.2);
    expect(w.ahead[1].expected).toBeNull();
    expect(w.total_expected).toBe(38.2);
    expect(w.free_days).toHaveLength(5);
    expect(w.free_days).not.toContain('2026-09-10');
  });
  it('says nothing about routine until there are enough events', () => {
    expect(routineSummary(dinners, { now: NOW })).toBeNull();
    const line = routineSummary([...dinners, ...lectures], { now: NOW });
    expect(line).toMatch(/events a week, most on Thursday/);
  });
});

describe('the persisted form', () => {
  const facts = [
    { kind: FACT_KIND, subject: 'dinner with the', value: JSON.stringify({ label: 'dinner with the', occurrences: 4, paid: 3, median: 38.2, p25: 36, p75: 40, categories: ['restaurant'] }) },
    { kind: META_KIND, subject: '', value: JSON.stringify({ learned_at: '2026-09-08T11:00:00Z', routine: 'About 2 events a week.', snapshot: [
      { id: 'f1', label: 'dinner with the', title: 'Dinner with the flat', start: '2026-09-10T19:30:00Z', end: '2026-09-10T22:00:00Z', all_day: false, expected: { amount: 38.2, low: 22.92, high: 53.48, basis: '3 similar times before, usually around 38,20 EUR.' } },
      { id: 'f9', label: 'dentist', title: 'Dentist', start: '2026-10-02T10:00:00Z', end: '2026-10-02T11:00:00Z', all_day: false, expected: { amount: 60, low: 36, high: 84, basis: '2 similar times before, usually around 60,00 EUR.' } },
      { id: 'gone', label: 'dinner with the', title: 'Dinner with the flat', start: '2026-09-03T19:30:00Z', end: '2026-09-03T22:00:00Z', all_day: false, expected: null },
    ] }) },
    { kind: 'home_area', subject: '', value: 'Chamberi' },
  ];
  it('reads shapes and the snapshot back, dropping what has already happened', () => {
    const c = calendarFromFacts(facts, { now: NOW });
    expect(c.connected).toBe(true);
    expect(c.learned[0].median).toBe(38.2);
    expect(c.snapshot.map((i) => i.id)).toEqual(['f1', 'f9']);
  });
  it('adds to the forecast only what lands before the month ends', () => {
    const f = calendarForecast(facts, { now: NOW });
    expect(f.calendar_ahead).toBe(38.2);
    expect(f.calendar_items).toEqual([{ title: 'dinner with the', day: '2026-09-10', amount: 38.2 }]);
  });
  it('writes short prompt lines with the numbers it holds', () => {
    const lines = calendarLines(facts, { now: NOW }).join('\n');
    expect(lines).toMatch(/Calendar, next 7 days: Thu 10 "dinner with the" usually about 38,20 EUR/);
    expect(lines).toMatch(/Kinds of event and what they cost: "dinner with the" 4 times, paid 3, usually 38,20 EUR \(restaurant\)/);
    expect(lines).toMatch(/Routine: About 2 events a week/);
    expect(lines).not.toMatch(/f9|Dentist/);
  });
  it('is empty when nothing has been read', () => {
    expect(calendarFromFacts([], { now: NOW })).toMatchObject({ connected: false, learned: [], snapshot: [] });
    expect(calendarLines([], { now: NOW })).toEqual([]);
  });
});

describe('learnEventSpend and ahead against Google and the store', () => {
  const raw = (e, extra = {}) => ({ id: e.id, summary: e.title, start: { dateTime: e.start }, end: { dateTime: e.end }, description: 'Ana, Luis and Marta, bring the wine', attendees: [{ email: 'ana@x.es', displayName: 'Ana Perez' }], ...extra });
  beforeEach(() => {
    upsert.mockReset(); del.mockReset(); token.mockReset(); get.mockReset();
    store.listTransactions.mockReset(); store.listFacts.mockReset();
    token.mockResolvedValue({ success: true, accessToken: 'tok' });
    get.mockResolvedValue({ items: [...dinners, ...lectures, ...future].map((e) => raw(e)) });
    store.listTransactions.mockResolvedValue(payments);
    store.listFacts.mockResolvedValue([]);
  });

  it('persists shapes and a snapshot without attendee names or descriptions', async () => {
    const r = await learnEventSpend('u1', { now: NOW });
    expect(r).toEqual({ learned: 1, events: 9, snapshot: 2 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toMatch(/\/calendars\/primary\/events\?/);
    const [table, rows] = upsert.mock.calls[0];
    expect(table).toBe('money_facts');
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/Ana|Luis|Marta|wine|ana@x|Perez/);
    const shape = rows.find((x) => x.kind === FACT_KIND);
    expect(shape.subject).toBe('dinner with the');
    expect(shape.amount).toBe(38.2);
    const meta = rows.find((x) => x.kind === META_KIND);
    expect(JSON.parse(meta.value).snapshot).toHaveLength(2);
    expect(del).toHaveBeenCalledWith('money_facts');
  });

  it('reads the week ahead with one request to Google, learning on the same events when stale', async () => {
    const r = await ahead('u1', 7, { now: NOW });
    expect(get).toHaveBeenCalledTimes(1);
    expect(r.connected).toBe(true);
    expect(r.ahead.map((i) => i.id)).toEqual(['f1', 'f2']);
    expect(r.total_expected).toBe(0); /* learned rows are read back from the store mock, which is empty */
    expect(upsert).toHaveBeenCalled();
  });

  it('does not learn again when the last pass is fresh', async () => {
    store.listFacts.mockResolvedValue([{ kind: META_KIND, subject: '', value: JSON.stringify({ learned_at: '2026-09-08T11:30:00Z', routine: null, snapshot: [] }) }]);
    await ahead('u1', 7, { now: NOW });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('answers without Google when there is no connection', async () => {
    token.mockResolvedValue({ success: false, error: 'not connected', requiresReauth: false });
    const r = await ahead('u1', 7, { now: NOW });
    expect(r.connected).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
});
