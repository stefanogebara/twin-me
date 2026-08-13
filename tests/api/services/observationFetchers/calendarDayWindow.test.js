/**
 * Calendar day-window + observation dating contract.
 *
 * fidelity-eval 2026-08-12 (BATTERY v3 / SPREAD ARM) surfaced this: asked "on
 * how many days in the last 14 did you have at least one scheduled calendar
 * event", both arms answered far too low. The memory stream was the problem,
 * not recall.
 *
 * Three defects, all in observationFetchers/calendar.js, all reproduced here:
 *
 *  1. FALSE EMPTY DAYS. Today's events are fetched with `timeMin: now`, so a
 *     run late in the day sees only the REMAINING slice. On 2026-08-04 the
 *     user had 3 events; the 21:31Z run saw zero and wrote "Calendar schedule
 *     today: no meetings or events — completely open day". The memory stream
 *     therefore asserts that busy days were empty.
 *
 *  2. UNDATED OBSERVATIONS. Every observation says "today" and carries no
 *     date, so N undated strings can never be counted into distinct days.
 *
 *  3. UTC TIMES. toLocaleTimeString() with no timeZone uses the server clock
 *     (UTC on Vercel), so a 07:45 São Paulo appointment is stored as 10:45 AM.
 *
 * The window/format logic is extracted into calendarDayWindow.js so it is
 * testable without the network, matching the gmailUnreadDelta.js pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dayKeyInTimeZone,
  localDayWindow,
  formatEventTime,
} from '../../../../api/services/observationFetchers/calendarDayWindow.js';

const SP = 'America/Sao_Paulo'; // UTC-3, the test user's calendar timezone

describe('dayKeyInTimeZone', () => {
  it('uses the calendar timezone, not the server clock', () => {
    // 01:03Z on the 6th is still the evening of the 5th in São Paulo.
    // The real run at this instant labelled its events as "today" = the 6th.
    expect(dayKeyInTimeZone(new Date('2026-08-06T01:03:00Z'), SP)).toBe('2026-08-05');
    expect(dayKeyInTimeZone(new Date('2026-08-06T01:03:00Z'), 'UTC')).toBe('2026-08-06');
  });

  it('falls back to UTC for a missing or bogus timezone', () => {
    expect(dayKeyInTimeZone(new Date('2026-08-04T21:31:00Z'), undefined)).toBe('2026-08-04');
    expect(dayKeyInTimeZone(new Date('2026-08-04T21:31:00Z'), 'Not/AZone')).toBe('2026-08-04');
  });
});

describe('localDayWindow', () => {
  it('spans the whole local day, not from `now` forward', () => {
    // The 2026-08-04 21:31Z run: 18:31 local, three events already over.
    const w = localDayWindow(new Date('2026-08-04T21:31:00Z'), SP);
    expect(w.dayKey).toBe('2026-08-04');
    expect(w.timeMin.toISOString()).toBe('2026-08-04T03:00:00.000Z'); // local midnight
    expect(w.timeMax.toISOString()).toBe('2026-08-05T02:59:59.999Z'); // local 23:59:59.999
    // The defect in one assertion: the window must start BEFORE the run.
    expect(w.timeMin.getTime()).toBeLessThan(new Date('2026-08-04T21:31:00Z').getTime());
  });

  it('anchors to the local day even when the run happens after local midnight UTC-wise', () => {
    const w = localDayWindow(new Date('2026-08-06T01:03:00Z'), SP);
    expect(w.dayKey).toBe('2026-08-05');
    expect(w.timeMin.toISOString()).toBe('2026-08-05T03:00:00.000Z');
  });
});

describe('formatEventTime', () => {
  it('renders in the calendar timezone', () => {
    // Stored in production as "10:45 AM" — the UTC rendering of 07:45 local.
    expect(formatEventTime('2026-08-06T07:45:00-03:00', SP)).toBe('7:45 AM');
    expect(formatEventTime('2026-08-04T14:30:00-03:00', SP)).toBe('2:30 PM');
  });
});

// ---------------------------------------------------------------------------
// Fetcher-level regression: replay 2026-08-04 exactly as it happened.
// ---------------------------------------------------------------------------

const getMock = vi.fn();
vi.mock('axios', () => ({ default: { get: (...a) => getMock(...a) } }));
vi.mock('../../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: async () => ({ success: true, accessToken: 'tok' }),
}));
vi.mock('../../../../api/services/observationUtils.js', () => ({
  sanitizeExternal: (s, n) => String(s || '').slice(0, n),
  getSupabase: async () => null, // no persistence in this test
}));

const { fetchCalendarObservations } = await import(
  '../../../../api/services/observationFetchers/calendar.js'
);

/** 2026-08-04 as Google actually has it: 3 events, all finished by 18:31 local. */
const AUG_4_EVENTS = [
  {
    id: 'e1',
    summary: 'Code review: roca/claude/xenodochial-moore-9dc540',
    start: { dateTime: '2026-08-04T09:00:00-03:00' },
    end: { dateTime: '2026-08-04T10:00:00-03:00' },
    creator: { self: true },
    organizer: { self: true },
  },
  {
    id: 'e2',
    summary: 'Murilo Personal',
    start: { dateTime: '2026-08-04T14:30:00-03:00' },
    end: { dateTime: '2026-08-04T15:30:00-03:00' },
    recurringEventId: 'r1',
    creator: { self: true },
    organizer: { self: true },
  },
  {
    id: 'e3',
    summary: 'Tênis Segovia',
    start: { dateTime: '2026-08-04T16:00:00-03:00' },
    end: { dateTime: '2026-08-04T17:00:00-03:00' },
    recurringEventId: 'r2',
    creator: { self: true },
    organizer: { self: true },
  },
];

/**
 * Behaves like the real Calendar API: an event is returned only when it ENDS
 * after timeMin. That is what makes this a genuine red test — with
 * `timeMin: now` the fetcher gets an empty list and invents an open day.
 */
function googleLike(url, config = {}) {
  const p = config.params || {};
  if (url.includes('/users/me/calendarList')) {
    return Promise.resolve({
      data: {
        items: [
          {
            id: 'stefanogebara@gmail.com',
            accessRole: 'owner',
            primary: true,
            summary: 'stefanogebara@gmail.com',
            timeZone: SP,
          },
        ],
      },
    });
  }
  if (url.includes('/events')) {
    if (p.eventTypes) return Promise.resolve({ data: { items: [] } }); // focusTime/OOO/fromGmail
    const min = new Date(p.timeMin).getTime();
    const max = new Date(p.timeMax).getTime();
    const items = AUG_4_EVENTS.filter((e) => {
      const start = new Date(e.start.dateTime).getTime();
      const end = new Date(e.end.dateTime).getTime();
      return end > min && start < max;
    });
    return Promise.resolve({ data: { items } });
  }
  return Promise.resolve({ data: { items: [] } });
}

describe('fetchCalendarObservations — 2026-08-04 replay (evening run, 3 events earlier that day)', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation(googleLike);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-04T21:31:00Z')); // 18:31 local
  });
  afterEach(() => vi.useRealTimers());

  it('never claims the day was empty when the day had events', async () => {
    const obs = await fetchCalendarObservations('user-1');
    const text = obs.map((o) => (typeof o === 'string' ? o : o.content));

    const falseEmpty = text.filter((t) =>
      /no meetings or events|completely open day|Free afternoon - no meetings/i.test(t),
    );
    expect(falseEmpty).toEqual([]);
  });

  it('sees all three events even though every one of them already ended', async () => {
    const obs = await fetchCalendarObservations('user-1');
    const text = obs.map((o) => (typeof o === 'string' ? o : o.content));

    expect(text.some((t) => /Code review: roca/.test(t))).toBe(true);
    expect(text.some((t) => /Murilo Personal/.test(t))).toBe(true);
    expect(text.some((t) => /Tênis Segovia/.test(t))).toBe(true);
  });

  it('stamps the local date on the day summary so distinct days are countable', async () => {
    const obs = await fetchCalendarObservations('user-1');
    const summary = obs
      .map((o) => (typeof o === 'string' ? o : o.content))
      .find((t) => /Calendar schedule/.test(t));

    expect(summary).toBeDefined();
    expect(summary).toContain('2026-08-04');
    expect(summary).toMatch(/3 events/);
  });

  it('tags each observation with the event date in metadata', async () => {
    const obs = await fetchCalendarObservations('user-1');
    const dayScoped = obs.filter((o) => typeof o === 'object' && o.eventDate);
    expect(dayScoped.length).toBeGreaterThan(0);
    expect(dayScoped.every((o) => o.eventDate === '2026-08-04')).toBe(true);
  });

  it('renders meeting times in the calendar timezone, not UTC', async () => {
    const obs = await fetchCalendarObservations('user-1');
    const murilo = obs
      .map((o) => (typeof o === 'string' ? o : o.content))
      .find((t) => /Has a meeting 'Murilo Personal'/.test(t));

    expect(murilo).toBeDefined();
    expect(murilo).toContain('2:30 PM'); // 14:30 local — was stored as 5:30 PM (UTC)
    expect(murilo).not.toContain('5:30 PM');
  });
});
