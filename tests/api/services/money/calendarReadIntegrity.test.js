import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(), remove: vi.fn(), token: vi.fn(), get: vi.fn(),
  facts: vi.fn(), transactions: vi.fn(), categories: vi.fn(),
}));
vi.mock('../../../../api/_app/services/database.js', () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: (...args) => mocks.upsert(...args),
      delete: () => {
        const query = {
          eq: () => query,
          not: () => query,
          then: (...args) => mocks.remove().then(...args),
        };
        return query;
      },
    }),
  },
}));
vi.mock('../../../../api/_app/services/logger.js', () => ({
  createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }),
}));
vi.mock('../../../../api/_app/services/encryption.js', () => ({
  encryptToken: (value) => `iv:tag:${Buffer.from(value).toString('base64')}`,
  decryptToken: () => { throw new Error('cannot decrypt'); },
}));
vi.mock('node:dns/promises', () => ({
  default: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
}));
vi.mock('../../../../api/_app/services/tokenRefreshService.js', () => ({
  getValidAccessToken: (...args) => mocks.token(...args),
}));
vi.mock('../../../../api/_app/services/calendar/client.js', () => ({
  createCalendarClient: () => ({ get: (...args) => mocks.get(...args) }),
}));
vi.mock('../../../../api/_app/services/money/transactionRepository.js', () => ({
  listTransactions: (...args) => mocks.transactions(...args),
}));
vi.mock('../../../../api/_app/services/money/factsRepository.js', () => ({
  listFacts: (...args) => mocks.facts(...args),
  categoriesFor: (...args) => mocks.categories(...args),
}));

const { addFeed, ahead, calendarStatus, eventsFor, feedEvents, learnEventSpend, listFeeds, refreshIfStale, FEED_NOT_CALENDAR, FEED_UNREADABLE } =
  await import('../../../../api/_app/services/money/calendar.js');
const crypto = await import('node:crypto');

const now = new Date('2026-09-25T10:00:00Z');
const lastSuccess = '2026-09-23T10:00:00Z';
const feed = (id) => ({
  kind: 'calendar_feed', subject: id, subject_label: 'canvas',
  value: `https://${id}.instructure.com/feeds/calendars/test.ics`,
});
const meta = {
  kind: 'event_spend_meta', subject: '',
  value: JSON.stringify({
    learned_at: lastSuccess, routine: 'The previous routine.', snapshot: [],
    days: { '2026-01-01': 4 },
  }),
};
const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20260926T090000Z\nSUMMARY:Class\nEND:VEVENT\nEND:VCALENDAR';
const response = (body) => ({ ok: true, headers: { get: () => null }, text: async () => body });
const derivedWrites = () => mocks.upsert.mock.calls.flatMap(([rows]) => Array.isArray(rows) ? rows : [rows])
  .filter((row) => ['event_spend', 'event_spend_meta'].includes(row.kind));
const savedLinks = () => mocks.upsert.mock.calls.flatMap(([rows]) => Array.isArray(rows) ? rows : [rows])
  .filter((row) => row.kind === 'calendar_feed');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.token.mockResolvedValue({ success: false, code: 'not_connected', error: 'not connected' });
  mocks.get.mockResolvedValue({ items: [] });
  mocks.facts.mockResolvedValue([feed('first'), meta]);
  mocks.transactions.mockResolvedValue([]);
  mocks.categories.mockResolvedValue(new Map());
  vi.stubGlobal('fetch', vi.fn(async () => response(ics)));
});
afterEach(() => vi.unstubAllGlobals());

describe('calendar reads must be complete before replacing learned state', () => {
  it.each([
    { error: 'Lookup failed for google_calendar: database unavailable' },
    { error: 'Token refresh failed: provider unavailable' },
    { error: 'Token decryption failed', requiresReauth: true },
  ])('preserves the full aggregate when Google cannot supply credentials: $error', async (failure) => {
    mocks.token.mockResolvedValue({ success: false, ...failure });
    await expect(learnEventSpend('user', { now })).rejects.toThrow();
    expect(derivedWrites()).toEqual([]);
    await expect(calendarStatus('user')).rejects.toThrow();
  });

  it.each([
    'BEGIN:VCALENDAR\n',
    ics.replace('END:VCALENDAR', 'BEGIN:VEVENT\nUID:incomplete\nDTSTART:20260927T090000Z'),
    ics.replace('END:VEVENT\n', ''),
  ])('refuses a truncated ICS response before replacing history', async (body) => {
    globalThis.fetch.mockResolvedValue(response(body));
    await expect(learnEventSpend('user', { now })).rejects.toThrow();
    expect(derivedWrites()).toEqual([]);
  });

  it('retains the prior aggregate when its only feed returns a login page', async () => {
    globalThis.fetch.mockResolvedValue(response('<html>Sign in</html>'));
    await expect(refreshIfStale('user', { now })).rejects.toThrow();
    expect(derivedWrites()).toEqual([]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('refuses a partial aggregate when one feed works and another fails', async () => {
    mocks.facts.mockResolvedValue([feed('first'), feed('second'), meta]);
    globalThis.fetch.mockImplementation(async (url) => {
      if (url.includes('second.')) throw new Error('network down');
      return response(ics);
    });
    await expect(learnEventSpend('user', { now })).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(derivedWrites()).toEqual([]);
  });

  it.each(['status', 'events'])('propagates source-list failure through %s instead of reporting no calendars', async (read) => {
    mocks.facts.mockRejectedValue(new Error('facts unavailable'));
    const result = read === 'status' ? calendarStatus('user') : eventsFor('user', now.toISOString(), '2026-10-25T10:00:00Z');
    await expect(result).rejects.toThrow('facts unavailable');
    expect(derivedWrites()).toEqual([]);
  });

  it('refuses a registered link that cannot be decrypted', async () => {
    mocks.facts.mockResolvedValue([{ ...feed('first'), value: 'corrupt-sealed-link' }, meta]);
    await expect(listFeeds('user')).rejects.toThrow();
  });

  /* Changed 2026-09-26 (Claude): this asserted that a failing existing source refuses the new
     link, which answered a valid Canvas link with "That link could not be read" whenever an
     older link or Google failed. A new link is judged by reading it alone. The #587 half is
     kept: a partial aggregate still never replaces the learned history. */
  it('keeps a valid new link when an existing source cannot be read, without replacing history', async () => {
    globalThis.fetch.mockRejectedValue(new Error('other source offline'));
    await expect(addFeed('user', feed('new').value, {
      now, fetchImpl: async () => response(ics),
    })).resolves.toMatchObject({ already: false, events: 1 });
    expect(savedLinks()).toHaveLength(1);
    expect(derivedWrites()).toEqual([]);
  });

  it.each([
    ['Google wants a reconnect', () => mocks.token.mockResolvedValue({ success: false, error: 'Token refresh failed', requiresReauth: true })],
    ['Google cannot be read', () => { mocks.token.mockResolvedValue({ success: true, accessToken: 'token' }); mocks.get.mockRejectedValue(new Error('Google 503')); }],
    ['a saved link cannot be decrypted', () => mocks.facts.mockResolvedValue([{ ...feed('first'), value: 'corrupt-sealed-link' }, meta])],
  ])('keeps a valid new link when %s, without replacing history', async (_why, arrange) => {
    arrange();
    await expect(addFeed('user', feed('new').value, {
      now, fetchImpl: async () => response(ics),
    })).resolves.toMatchObject({ already: false, events: 1 });
    expect(savedLinks()).toHaveLength(1);
    expect(derivedWrites()).toEqual([]);
  });

  it.each([
    ['answers a login page', async () => response('<html>Sign in</html>'), FEED_NOT_CALENDAR],
    ['does not answer', async () => { throw new Error('offline'); }, FEED_UNREADABLE],
  ])('still refuses a new link that %s, and keeps nothing', async (_why, fetchImpl, message) => {
    await expect(addFeed('user', feed('new').value, { now, fetchImpl })).rejects.toThrow(message);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('knows a link already saved without reading any other, even one that cannot be decrypted', async () => {
    const url = feed('new').value;
    const id = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    mocks.facts.mockResolvedValue([{ kind: 'calendar_feed', subject: id, subject_label: 'canvas', value: 'sealed', answered_at: lastSuccess }, { ...feed('first'), value: 'corrupt-sealed-link' }, meta]);
    const fetchNew = vi.fn(async () => response(ics));
    await expect(addFeed('user', url, { now, fetchImpl: fetchNew })).resolves.toEqual({ id, kind: 'canvas', label: 'Canvas', added_at: lastSuccess, events: null, already: true });
    expect(fetchNew).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('counts every saved link toward the four, readable or not', async () => {
    mocks.facts.mockResolvedValue([feed('a'), feed('b'), feed('c'), { ...feed('d'), value: 'corrupt-sealed-link' }, meta]);
    await expect(addFeed('user', feed('new').value, { now, fetchImpl: async () => response(ics) })).rejects.toMatchObject({ code: 'feed_limit' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not replace history when prior day counts cannot be loaded', async () => {
    mocks.facts.mockRejectedValue(new Error('prior facts unavailable'));
    await expect(learnEventSpend('user', { now, events: [] })).rejects.toThrow('prior facts unavailable');
    expect(derivedWrites()).toEqual([]);
  });

  it('does not certify a truncated Google page as a complete read', async () => {
    mocks.token.mockResolvedValue({ success: true, accessToken: 'token' });
    mocks.get.mockResolvedValue({ items: [], nextPageToken: 'more-events' });
    await expect(learnEventSpend('user', { now })).rejects.toThrow();
    expect(derivedWrites()).toEqual([]);
  });

  it('keeps the prior learning timestamp and routine when persistence fails', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'write unavailable' } });
    const result = await ahead('user', 7, { now });
    expect(result.ahead).toHaveLength(1);
    expect(result.learned_at).toBe(lastSuccess);
    expect(result.routine).toBe('The previous routine.');
  });

  it('does not invent a first learning timestamp when the first write fails', async () => {
    mocks.facts.mockResolvedValue([feed('first')]);
    mocks.upsert.mockResolvedValue({ error: { message: 'write unavailable' } });
    const result = await ahead('user', 7, { now });
    expect(result.learned_at).toBeNull();
  });

  it('reports a successful persisted refresh and retains older day counts', async () => {
    const result = await ahead('user', 7, { now });
    expect(result.learned_at).toBe(now.toISOString());
    const saved = derivedWrites().find((row) => row.kind === 'event_spend_meta');
    expect(JSON.parse(saved.value).days['2026-01-01']).toBe(4);
  });

  it('saves a valid new link and learns both sources without fetching the new one twice', async () => {
    const fetchNew = vi.fn(async () => response(ics.replace('UID:a', 'UID:b')));
    await expect(addFeed('user', feed('new').value, { now, fetchImpl: fetchNew })).resolves.toMatchObject({ already: false, events: 1 });
    expect(fetchNew).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const saved = derivedWrites().find((row) => row.kind === 'event_spend_meta');
    expect(JSON.parse(saved.value).snapshot.map((event) => event.id)).toEqual(['a', 'b']);
  });

  it('allows a genuinely empty successful feed and no sources', async () => {
    expect(await feedEvents([], now.toISOString(), '2026-10-25T10:00:00Z')).toEqual([]);
    globalThis.fetch.mockResolvedValue(response('BEGIN:VCALENDAR\nEND:VCALENDAR'));
    await expect(learnEventSpend('user', { now })).resolves.toMatchObject({ events: 0 });
    expect(derivedWrites()).toHaveLength(1);
  });

  it('accepts complete timezone and alarm components inside an ICS export', async () => {
    const body = ics.replace('BEGIN:VEVENT', 'BEGIN:VTIMEZONE\nTZID:Europe/Madrid\nBEGIN:STANDARD\nDTSTART:19701025T030000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nEND:STANDARD\nEND:VTIMEZONE\nBEGIN:VEVENT')
      .replace('END:VEVENT', 'BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Class reminder\nTRIGGER:-PT15M\nEND:VALARM\nEND:VEVENT');
    globalThis.fetch.mockResolvedValue(response(body));
    await expect(learnEventSpend('user', { now })).resolves.toMatchObject({ events: 1 });
    expect(derivedWrites()).toHaveLength(1);
  });
});
