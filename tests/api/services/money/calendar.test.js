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
/* The platform's key is not in a test: a reversible stand-in with the same shape (three parts). */
vi.mock('../../../../api/services/encryption.js', () => ({
  encryptToken: (t) => `iv:tag:${Buffer.from(String(t)).toString('base64')}`,
  decryptToken: (v) => { const p = String(v).split(':'); if (p.length !== 3) throw new Error('bad'); return Buffer.from(p[2], 'base64').toString(); },
}));
/* A test never asks the real resolver: every name is public unless a test says otherwise. */
vi.mock('node:dns/promises', () => ({ default: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } }));
const token = vi.fn();
vi.mock('../../../../api/services/tokenRefreshService.js', () => ({ getValidAccessToken: (...a) => token(...a) }));
const get = vi.fn();
vi.mock('../../../../api/services/calendar/client.js', () => ({ createCalendarClient: () => ({ get: (...a) => get(...a) }) }));
const store = { listTransactions: vi.fn(), listFacts: vi.fn(), categoriesFor: vi.fn(async () => new Map([['la tasca', 'restaurant']])) };
vi.mock('../../../../api/services/money/store.js', () => store);
vi.mock('../../../../api/services/money/transactionRepository.js', () => store);
vi.mock('../../../../api/services/money/factsRepository.js', () => store);

const cal = await import('../../../../api/services/money/calendar.js');
const {
  normaliseEvent, shapeKey, joinEventsToPayments, learnShapes, expectFor, aheadFrom, routineSummary,
  calendarFromFacts, calendarForecast, calendarLines, learnEventSpend, ahead, MIN_OCCURRENCES, MIN_PAID, FACT_KIND, META_KIND,
  feedsFromFacts, eventsFor, calendarStatus, FEED_KIND, spendable, fetchFeed, isPrivateAddress, publicFeeds, FEED_UNREADABLE, FEED_NOT_CALENDAR, sealFeedUrl, readFeedUrl,
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

describe('calendarFromFacts, notes on days', () => {
  it('a note written on a day of the plan is an away window and a week word when its words say so', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const facts = [
      { kind: 'note', subject: 'day-2026-09-26', value: 'Trip to Valencia with Ana' },
      { kind: 'note', subject: 'day-2026-09-12', value: 'Final exam, statistics' },
      { kind: 'note', subject: 'rent-abc', value: 'trip that is not on a day' },
    ];
    const c = calendarFromFacts(facts, { now });
    expect(c.away).toEqual([{ from: '2026-09-26', to: '2026-09-27', title: 'Trip to Valencia with Ana' }]);
    expect(c.week).toMatch(/exam/i);
  });
});

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
  it('reads the same words as the same kind of day, whichever series they came from', () => {
    /* A rescheduled series gets a new recurring id; keyed on it, one kind of day was learned
       twice with two costs (2026-09-21). */
    const a = ev('a', 'Weekly sync', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z', { recurring: 'r1' });
    const b = ev('b', 'Weekly sync', '2026-09-05T09:00:00Z', '2026-09-05T10:00:00Z', { recurring: 'r2' });
    expect(shapeKey(a)).toBe(shapeKey(b));
    expect(shapeKey(a)).toBe('weekly sync');
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
    expect(c.away).toEqual([]);
    expect(c.week).toBeNull();
  });
  it('reads the away windows and the week\'s word from the slim past kept in the meta', () => {
    const meta = JSON.parse(facts[1].value);
    meta.past = [{ title: 'Viaje a Lisboa', start: '2026-09-04T00:00:00Z', end: '2026-09-08T00:00:00Z', all_day: true }, { title: 'Examen final', start: '2026-09-07T09:00:00Z', end: '2026-09-07T11:00:00Z', all_day: false }];
    const c = calendarFromFacts([facts[0], { kind: META_KIND, subject: '', value: JSON.stringify(meta) }], { now: NOW });
    expect(c.away).toEqual([{ from: '2026-09-04', to: '2026-09-08', title: 'Viaje a Lisboa' }]);
    expect(c.week).toBe('an exam week');
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

describe('pasted calendar links', () => {
  const ICS = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a1\nDTSTART;VALUE=DATE:20260910\nSUMMARY:Assignment 1\nEND:VEVENT\nBEGIN:VEVENT\nUID:far\nDTSTART;VALUE=DATE:20270101\nSUMMARY:Next year\nEND:VEVENT\nEND:VCALENDAR';
  const feedFact = { kind: FEED_KIND, subject: 'abc123', subject_label: 'canvas', value: 'https://ie.instructure.com/feeds/calendars/user_x.ics', answered_at: '2026-09-01T00:00:00Z' };
  it('reads the links back from the facts, as a label and never more', () => {
    const [f] = feedsFromFacts([feedFact, { kind: 'home_area', value: 'x' }]);
    expect(f).toMatchObject({ id: 'abc123', kind: 'canvas', label: 'Canvas', url: feedFact.value });
  });
  it('counts a link as a calendar source, and merges its events with Google\'s inside the window', async () => {
    token.mockResolvedValue({ success: false });
    store.listFacts.mockResolvedValue([feedFact]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => '0' }, text: async () => ICS });
    try {
      const status = await calendarStatus('u1');
      expect(status).toMatchObject({ connected: true, google: false });
      expect(status.feeds).toHaveLength(1);
      const events = await eventsFor('u1', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z');
      expect(events.map((e) => e.title)).toEqual(['Assignment 1']);
      expect(events[0].source).toBe('canvas');
    } finally { globalThis.fetch = realFetch; }
  });
  it('skips a link that does not answer with a calendar, without failing the read', async () => {
    token.mockResolvedValue({ success: false });
    store.listFacts.mockResolvedValue([feedFact]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => '0' }, text: async () => '<html>login</html>' });
    try { expect(await eventsFor('u1', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')).toEqual([]); }
    finally { globalThis.fetch = realFetch; }
  });
});

describe('a class is not a plan', () => {
  it('never joins a payment to a timetable event, from a link or by its title', () => {
    const lecture = { id: 'l1', title: 'DATA ANALYSIS FOR ECONOMICS (Ses. 27) Live in-person', start: '2026-09-08T09:30:00Z', end: '2026-09-08T11:00:00Z', all_day: false, source: 'blackboard' };
    const seminar = { id: 'l2', title: 'Marketing seminar', start: '2026-09-08T09:30:00Z', end: '2026-09-08T11:00:00Z', all_day: false };
    const dinner = { id: 'd1', title: 'Dinner with the flat', start: '2026-09-08T19:30:00Z', end: '2026-09-08T22:00:00Z', all_day: false };
    expect(spendable(lecture)).toBe(false);
    expect(spendable(seminar)).toBe(false);
    expect(spendable({ ...lecture, title: 'Final Exam', source: 'blackboard' })).toBe(false);
    expect(spendable(dinner)).toBe(true);
    const coffee = { id: 't1', occurred_at: '2026-09-08T10:05:00Z', amount: -2.2, merchant_key: 'cafe', channel: 'card' };
    const tapas = { id: 't2', occurred_at: '2026-09-08T20:10:00Z', amount: -38.2, merchant_key: 'la tasca', channel: 'card' };
    const pairs = joinEventsToPayments([lecture, seminar, dinner], [coffee, tapas]);
    expect(pairs.map((p) => [p.event.id, p.transaction.id])).toEqual([['d1', 't2']]);
  });
});

describe('fetchFeed refuses to be pointed inside', () => {
  const ICS = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20260910\nSUMMARY:Assignment 1\nEND:VEVENT\nEND:VCALENDAR';
  const ok = (body, extra = {}) => ({ status: 200, ok: true, headers: { get: (h) => (h === 'content-length' ? String(extra.length ?? Buffer.byteLength(body)) : null) }, text: async () => body });
  const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
  it('knows the private ranges', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '172.32.0.1']) expect(isPrivateAddress(ip)).toBe(false);
  });
  it('refuses a name that resolves to a private address, whatever it is called', async () => {
    const lookupImpl = async () => [{ address: '127.0.0.1', family: 4 }];
    await expect(fetchFeed('https://127.0.0.1.nip.io/x.ics', { fetchImpl: async () => ok(ICS), lookupImpl })).rejects.toThrow(FEED_UNREADABLE);
    await expect(fetchFeed('http://ie.instructure.com/x.ics', { fetchImpl: async () => ok(ICS), lookupImpl: publicLookup })).rejects.toThrow(FEED_UNREADABLE);
  });
  it('follows a redirect only to another public https address, and at most twice', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url === 'https://a.example.edu/x.ics') return { status: 302, ok: false, headers: { get: (h) => (h === 'location' ? 'http://169.254.169.254/latest' : null) } };
      if (url === 'https://b.example.edu/x.ics') return { status: 302, ok: false, headers: { get: (h) => (h === 'location' ? 'https://c.example.edu/y.ics' : null) } };
      if (url === 'https://c.example.edu/y.ics') return ok(ICS);
      if (url.startsWith('https://loop')) return { status: 302, ok: false, headers: { get: (h) => (h === 'location' ? url + '/again' : null) } };
      return ok(ICS);
    };
    await expect(fetchFeed('https://a.example.edu/x.ics', { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow(FEED_UNREADABLE);
    expect(calls.filter((u) => u.startsWith('http://'))).toEqual([]);
    const r = await fetchFeed('https://b.example.edu/x.ics', { fetchImpl, lookupImpl: publicLookup });
    expect(r.events).toHaveLength(1);
    await expect(fetchFeed('https://loop.example.edu/x', { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow(FEED_UNREADABLE);
  });
  it('says one of two sentences: unreadable for a status, a timeout or a size; not a calendar for a page', async () => {
    await expect(fetchFeed('https://x.example.edu/a.ics', { fetchImpl: async () => ({ status: 403, ok: false, headers: { get: () => null } }), lookupImpl: publicLookup })).rejects.toThrow(FEED_UNREADABLE);
    await expect(fetchFeed('https://x.example.edu/a.ics', { fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }, lookupImpl: publicLookup })).rejects.toThrow(FEED_UNREADABLE);
    await expect(fetchFeed('https://x.example.edu/a.ics', { fetchImpl: async () => ok(ICS, { length: 5 * 1024 * 1024 }), lookupImpl: publicLookup })).rejects.toThrow(FEED_UNREADABLE);
    await expect(fetchFeed('https://x.example.edu/a.ics', { fetchImpl: async () => ok('<html>login</html>'), lookupImpl: publicLookup })).rejects.toThrow(FEED_NOT_CALENDAR);
  });
  it('never hands the link itself back', () => {
    expect(publicFeeds([{ id: 'a', kind: 'canvas', label: 'Canvas', url: 'https://secret', added_at: null }])).toEqual([{ id: 'a', kind: 'canvas', label: 'Canvas', added_at: null }]);
  });
});

describe('the link rests sealed', () => {
  it('reads a sealed link and a plain one from before, and drops what it cannot read', () => {
    const url = 'https://ie.instructure.com/feeds/calendars/user_x.ics';
    const sealed = sealFeedUrl(url);
    expect(sealed).not.toContain('instructure');
    expect(readFeedUrl(sealed)).toBe(url);
    expect(readFeedUrl(url)).toBe(url);
    expect(readFeedUrl('garbage')).toBeNull();
    const feeds = feedsFromFacts([
      { kind: FEED_KIND, subject: 'a', subject_label: 'canvas', value: sealed, answered_at: null },
      { kind: FEED_KIND, subject: 'b', subject_label: 'ics', value: 'https://example.edu/c.ics', answered_at: null },
      { kind: FEED_KIND, subject: 'c', subject_label: 'ics', value: 'broken', answered_at: null },
    ]);
    expect(feeds.map((f) => [f.id, f.url])).toEqual([['a', url], ['b', 'https://example.edu/c.ics']]);
  });
});

describe('the week ahead without a calendar', () => {
  it('still lists the days the person wrote on, as away when their words say so', async () => {
    const { ahead } = await import('../../../../api/services/money/calendar.js');
    /* The status reads the facts once for the feeds and the week reads them again: the same rows both times. */
    token.mockResolvedValue({ accessToken: null, needsReconnect: false });
    store.listFacts.mockResolvedValue([
      { kind: 'note', subject: 'day-2026-09-25', value: 'Trip: I am going to Bilbao next Friday to Sunday' },
      { kind: 'note', subject: 'day-2026-09-26', value: 'Trip: I am going to Bilbao next Friday to Sunday' },
      { kind: 'note', subject: 'i-am-going-to-bilbao-abc', value: 'I am going to Bilbao next Friday to Sunday' },
    ]);
    const r = await ahead('u1', 7, { now: new Date('2026-09-21T10:00:00Z') });
    expect(r.connected).toBe(false);
    expect(r.ahead.map((e) => e.start.slice(0, 10))).toEqual(['2026-09-25', '2026-09-26']);
    expect(r.ahead[0].title).toMatch(/^Trip:/);
    expect(r.free_days).not.toContain('2026-09-25');
  });
});

describe('the week ahead with a calendar', () => {
  it('lists the days the person wrote on beside the calendar\'s own events', async () => {
    const { ahead } = await import('../../../../api/services/money/calendar.js');
    token.mockResolvedValue({ success: true, accessToken: 'tok' });
    get.mockResolvedValue({ items: [{ id: 'g1', summary: 'Class', start: { dateTime: '2026-09-22T09:00:00Z' }, end: { dateTime: '2026-09-22T11:00:00Z' } }] });
    store.listFacts.mockResolvedValue([
      { kind: 'event_spend_meta', subject: 'meta', value: JSON.stringify({ learned_at: new Date().toISOString(), snapshot: [], past: [] }) },
      { kind: 'note', subject: 'day-2026-09-25', value: 'Trip: Bilbao with two friends' },
    ]);
    const r = await ahead('u1', 7, { now: new Date('2026-09-21T10:00:00Z') });
    expect(r.connected).toBe(true);
    expect(r.ahead.map((e) => `${e.start.slice(0, 10)} ${e.title}`)).toEqual(['2026-09-22 Class', '2026-09-25 Trip: Bilbao with two friends']);
  });
});

describe('the term as weeks', () => {
  const { termWeeks } = cal;
  /* Monday 2026-08-24 through Sunday 2026-10-25: nine weeks around the week of 21 September. */
  const now = new Date('2026-09-23T10:00:00Z');
  const daysFrom = (first, last, per) => {
    const out = {};
    for (let t = Date.parse(`${first}T12:00:00Z`); t <= Date.parse(`${last}T12:00:00Z`); t += 86400000) {
      const day = new Date(t).toISOString().slice(0, 10);
      out[day] = per(day);
    }
    return out;
  };
  const facts = (days, learnedAt = '2026-09-23T06:00:00Z') => ([
    { kind: META_KIND, subject: 'meta', value: JSON.stringify({ learned_at: learnedAt, snapshot: [], past: [], days }) },
  ]);

  it('counts one week a bar and marks the week we are in', () => {
    /* Two events every Tuesday, nothing else. */
    const days = daysFrom('2026-06-25', '2026-10-24', (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() === 2 ? 2 : 0));
    const term = termWeeks(facts(days), { now });
    expect(term.weeks).toHaveLength(9);
    expect(term.weeks.every((w) => w.known)).toBe(true);
    expect(term.weeks.map((w) => w.events)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2]);
    /* Five weeks behind, this one, three ahead: the read reaches a month out, no further. */
    expect(term.weeks[0].start).toBe('2026-08-17');
    const current = term.weeks.find((w) => w.current);
    expect(current.start).toBe('2026-09-21');
    expect(current.end).toBe('2026-09-27');
    expect(term.this_week.start).toBe('2026-09-21');
    expect(term.next_week.start).toBe('2026-09-28');
  });

  it('leaves a week nothing was read for unknown rather than empty', () => {
    /* The read reached 24 October; the ninth week runs past it. */
    const days = daysFrom('2026-09-14', '2026-10-24', () => 1);
    const term = termWeeks(facts(days), { now });
    const unread = term.weeks.filter((w) => !w.known).map((w) => w.start);
    /* Every week before the first day the diary counted. */
    expect(unread).toEqual(['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']);
    expect(term.weeks.filter((w) => !w.known).every((w) => w.events === null)).toBe(true);
    expect(term.weeks.find((w) => w.start === '2026-09-14').events).toBe(7);
  });

  it('finds the busiest and the quietest week read', () => {
    const days = daysFrom('2026-08-17', '2026-10-24', (d) => (d >= '2026-10-05' && d <= '2026-10-11' ? 0 : 1));
    const term = termWeeks(facts(days), { now });
    expect(term.quietest.start).toBe('2026-10-05');
    expect(term.quietest.events).toBe(0);
    expect(term.busiest.events).toBe(7);
  });

  it('says nothing when the diary has never been read, or barely', () => {
    expect(termWeeks([], { now })).toBe(null);
    /* One read of one day is not a term: it would draw every week ahead as an empty one. */
    expect(termWeeks(facts({ '2026-09-22': 3 }), { now })).toBe(null);
  });
});
