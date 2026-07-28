/**
 * Latency-shape tests for userContextAggregator
 * (backend-latency audit 2026-07-03, GET /api/twin/status path).
 *
 * Three fixes under test:
 *   1. getCalendarContext: per-calendar event fetches were a SERIAL for-loop
 *      (N+1 Google API round trips) — now one parallel batch with per-call
 *      timeouts;
 *   2. getWhoopContext: the sleep fetch was awaited serially inside the
 *      return object literal — now part of the cycles+recovery Promise.all;
 *   3. getYouTubeContext / getTwitchContext: the user_platform_data selects
 *      were UNBOUNDED (raw_data is large JSONB) — now capped at 500 newest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockAxiosGet,
  mockFrom,
  mockEnsureFreshToken,
  mockGetCycles,
  mockGetRecovery,
  mockGetSleep,
  mockGetNangoConnection,
} = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockFrom: vi.fn(),
  mockEnsureFreshToken: vi.fn(),
  mockGetCycles: vi.fn(),
  mockGetRecovery: vi.fn(),
  mockGetSleep: vi.fn(),
  mockGetNangoConnection: vi.fn(),
}));

vi.mock('axios', () => ({ default: { get: mockAxiosGet } }));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));
vi.mock('../../../api/services/encryption.js', () => ({
  decryptToken: vi.fn((t) => t),
}));
vi.mock('../../../api/services/tokenRefreshService.js', () => ({
  ensureFreshToken: mockEnsureFreshToken,
}));
vi.mock('../../../api/services/lifeEventInferenceService.js', () => ({
  lifeEventInferenceService: { buildLifeContextSummary: vi.fn() },
}));
vi.mock('../../../api/services/nangoService.js', () => ({
  whoop: {
    getCycles: mockGetCycles,
    getRecovery: mockGetRecovery,
    getSleep: mockGetSleep,
  },
  getConnection: mockGetNangoConnection,
}));

const { default: userContextAggregator } = await import(
  '../../../api/services/userContextAggregator.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** Chainable supabase recorder resolving `result`. */
function makeQueryRecorder(result) {
  const calls = { select: [], eq: [], order: [], limit: [] };
  const builder = {
    select: vi.fn((...a) => {
      calls.select.push(a);
      return builder;
    }),
    eq: vi.fn((...a) => {
      calls.eq.push(a);
      return builder;
    }),
    order: vi.fn((...a) => {
      calls.order.push(a);
      return builder;
    }),
    limit: vi.fn((...a) => {
      calls.limit.push(a);
      return builder;
    }),
    single: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { builder, calls };
}

describe('getCalendarContext (audit 2026-07-03: serial N+1 calendar loop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches events from all calendars in parallel with 10s timeouts', async () => {
    // Connection row exists; token refresh succeeds.
    const { builder } = makeQueryRecorder({
      data: {
        access_token: 'enc',
        refresh_token: 'r',
        token_expires_at: new Date(Date.now() + 3600e3).toISOString(),
      },
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    mockEnsureFreshToken.mockResolvedValue('fresh-token');

    let releaseBarrier;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });
    const eventCallConfigs = [];

    const futureStart = new Date(Date.now() + 60 * 60e3).toISOString();
    mockAxiosGet.mockImplementation(async (url, config) => {
      if (url.includes('/users/me/calendarList')) {
        return {
          data: {
            items: [
              { id: 'cal-a', summary: 'A' },
              { id: 'cal-b', summary: 'B' },
              { id: 'cal-c', summary: 'C' },
            ],
          },
        };
      }
      // Per-calendar events fetch — block until released.
      eventCallConfigs.push({ url, config });
      await barrier;
      return {
        data: {
          items: [
            {
              id: `evt-${eventCallConfigs.length}`,
              summary: 'Team sync',
              start: { dateTime: futureStart },
              end: { dateTime: futureStart },
              attendees: [],
            },
          ],
        },
      };
    });

    const contextPromise = userContextAggregator.getCalendarContext(USER_ID);

    // All 3 per-calendar fetches must be IN FLIGHT before any resolves.
    // The old serial loop would sit at 1 and time out here.
    await vi.waitFor(() => {
      expect(eventCallConfigs).toHaveLength(3);
    });

    releaseBarrier();
    const context = await contextPromise;

    expect(context.connected).toBe(true);
    expect(context.events).toHaveLength(3);

    // Every external call carries an explicit timeout (axios default is none).
    for (const { config } of eventCallConfigs) {
      expect(config.timeout).toBe(10000);
    }
  });

  it('a single broken calendar degrades to skip, not failure', async () => {
    const { builder } = makeQueryRecorder({
      data: {
        access_token: 'enc',
        refresh_token: 'r',
        token_expires_at: new Date(Date.now() + 3600e3).toISOString(),
      },
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    mockEnsureFreshToken.mockResolvedValue('fresh-token');

    const futureStart = new Date(Date.now() + 60 * 60e3).toISOString();
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/users/me/calendarList')) {
        return {
          data: {
            items: [
              { id: 'cal-good', summary: 'Good' },
              { id: 'cal-bad', summary: 'Bad' },
            ],
          },
        };
      }
      if (url.includes('cal-bad')) {
        throw new Error('403 forbidden');
      }
      return {
        data: {
          items: [
            {
              id: 'evt-1',
              summary: 'Standup',
              start: { dateTime: futureStart },
              end: { dateTime: futureStart },
              attendees: [],
            },
          ],
        },
      };
    });

    const context = await userContextAggregator.getCalendarContext(USER_ID);

    expect(context.connected).toBe(true);
    expect(context.events).toHaveLength(1);
  });
});

describe('getWhoopContext (audit 2026-07-03: serial sleep fetch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches cycles, recovery AND sleep concurrently', async () => {
    mockGetNangoConnection.mockResolvedValue({
      success: true,
      connected: true,
      platform: 'whoop',
    });

    let releaseBarrier;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });

    mockGetCycles.mockImplementation(async () => {
      await barrier;
      return {
        success: true,
        data: { records: [{ score: { strain: 12 }, end: '2026-07-03T08:00:00Z' }] },
      };
    });
    mockGetRecovery.mockImplementation(async () => {
      await barrier;
      return {
        success: true,
        data: {
          records: [
            {
              score: {
                recovery_score: 71,
                hrv_rmssd_milli: 55,
                resting_heart_rate: 52,
              },
              created_at: '2026-07-03T07:00:00Z',
            },
          ],
        },
      };
    });
    mockGetSleep.mockImplementation(async () => {
      await barrier;
      return { success: true, data: { records: [] } };
    });

    const contextPromise = userContextAggregator.getWhoopContext(USER_ID);

    // Sleep must be requested WHILE cycles+recovery are still pending.
    // The old code only called getSleep after both had resolved.
    await vi.waitFor(() => {
      expect(mockGetCycles).toHaveBeenCalledTimes(1);
      expect(mockGetRecovery).toHaveBeenCalledTimes(1);
      expect(mockGetSleep).toHaveBeenCalledTimes(1);
    });

    releaseBarrier();
    const context = await contextPromise;

    expect(context.connected).toBe(true);
    expect(context.recovery.score).toBe(71);
    expect(context.strain.score).toBe(12);
    expect(context.sleep).toBeNull(); // no sleep records -> null, same as before
  });
});

describe('platform-data context queries are bounded (audit 2026-07-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['youtube', (id) => userContextAggregator.getYouTubeContext(id)],
    ['twitch', (id) => userContextAggregator.getTwitchContext(id)],
  ])('%s context selects at most 500 newest rows', async (platform, call) => {
    const { builder, calls } = makeQueryRecorder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    const context = await call(USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_platform_data');
    expect(calls.select).toEqual([['raw_data, data_type, extracted_at']]);
    expect(calls.eq).toContainEqual(['platform', platform]);
    expect(calls.order).toEqual([['extracted_at', { ascending: false }]]);
    expect(calls.limit).toEqual([[500]]);
    expect(context).toBeNull(); // empty data -> null, unchanged contract
  });
});
