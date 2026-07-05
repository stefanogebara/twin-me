/**
 * Characterization tests for _fetchSinglePlatform (twinContextBuilder.js).
 *
 * These pin the EXACT current behavior of the per-platform fetch logic
 * (spotify / calendar+google_calendar alias / whoop dual-path / web) so the
 * registry refactor (task A2-M2b) can be proven behavior-preserving:
 *   - same output shape per platform
 *   - same log.warn-on-failure (inner catch swallows, never throws)
 *   - same null semantics (null when no platform produced data)
 *   - calendar alias: both 'calendar' and 'google_calendar' yield data.calendar
 *   - whoop dual-path: NANGO_MANAGED via nangoService, else direct axios
 *
 * Deps are mocked following the repo idiom (see callService.test.js):
 * axios default export, table-aware supabaseAdmin chain, tokenRefreshService,
 * and the dynamically-imported nangoService.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

// ---- axios (default export, .get) ----
const axiosGetMock = vi.fn();
vi.mock('axios', () => ({ default: { get: (...a) => axiosGetMock(...a) } }));

// ---- tokenRefreshService.getValidAccessToken ----
const getValidAccessTokenMock = vi.fn();
vi.mock('../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: (...a) => getValidAccessTokenMock(...a),
  requiresTokenRefresh: () => false,
  batchRefreshTokens: vi.fn(),
}));

// ---- nangoService (dynamically imported in the whoop NANGO_MANAGED path) ----
const nangoGetRecoveryMock = vi.fn();
const nangoGetSleepMock = vi.fn();
vi.mock('../../../api/services/nangoService.js', () => ({
  whoop: {
    getRecovery: (...a) => nangoGetRecoveryMock(...a),
    getSleep: (...a) => nangoGetSleepMock(...a),
  },
}));

// ---- supabaseAdmin (table-aware chainable mock) ----
// Terminal resolvers (.single / .limit) read from per-table configurable state.
let whoopConnResult = { data: null, error: null };       // platform_connections.single()
let webEventsResult = { data: null, error: null };        // user_platform_data.limit()
vi.mock('../../../api/services/database.js', () => {
  function from(table) {
    const b = { _table: table };
    b.select = () => b;
    b.eq = () => b;
    b.gte = () => b;
    b.order = () => b;
    b.limit = () => {
      if (table === 'user_platform_data') return Promise.resolve(webEventsResult);
      return Promise.resolve({ data: null, error: null });
    };
    b.single = () => {
      if (table === 'platform_connections') return Promise.resolve(whoopConnResult);
      return Promise.resolve({ data: null, error: null });
    };
    return b;
  }
  return { supabaseAdmin: { from }, serverDb: {} };
});

const { _fetchSinglePlatform } = await import('../../../api/services/twinContextBuilder.js');

beforeEach(() => {
  axiosGetMock.mockReset();
  getValidAccessTokenMock.mockReset();
  nangoGetRecoveryMock.mockReset();
  nangoGetSleepMock.mockReset();
  whoopConnResult = { data: null, error: null };
  webEventsResult = { data: null, error: null };
});

// Helper: dispatch axios.get by URL so parallel Promise.all resolves correctly.
function routeAxios(routes) {
  axiosGetMock.mockImplementation((url) => {
    for (const [needle, resp] of routes) {
      if (url.includes(needle)) return Promise.resolve(resp);
    }
    return Promise.resolve({ data: null });
  });
}

describe('_fetchSinglePlatform — spotify', () => {
  it('shapes data.spotify on success', async () => {
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });
    routeAxios([
      ['currently-playing', { data: { item: { name: 'Song A', artists: [{ name: 'Artist A' }] }, is_playing: true } }],
      ['recently-played', { data: { items: [
        { track: { name: 'Song B', artists: [{ name: 'Artist B' }] }, played_at: '2026-07-01T10:00:00Z' },
      ] } }],
      ['time_range=short_term', { data: { items: [{ name: 'ShortArtist', genres: ['pop', 'rock', 'extra'] }] } }],
      ['time_range=medium_term', { data: { items: [{ name: 'MedArtist' }] } }],
      ['time_range=long_term', { data: { items: [{ name: 'LongArtist' }] } }],
    ]);

    const result = await _fetchSinglePlatform(TEST_USER, 'spotify');

    expect(result).not.toBeNull();
    expect(result.spotify).toBeDefined();
    expect(result.spotify.currentlyPlaying).toEqual({ name: 'Song A', artist: 'Artist A', isPlaying: true });
    expect(result.spotify.recentTracks).toEqual([
      { name: 'Song B', artist: 'Artist B', playedAt: '2026-07-01T10:00:00Z' },
    ]);
    expect(result.spotify.topArtistsShortTerm).toEqual(['ShortArtist']);
    expect(result.spotify.topArtistsMediumTerm).toEqual(['MedArtist']);
    expect(result.spotify.topArtistsLongTerm).toEqual(['LongArtist']);
    // genres: flatMap of first 2 genres per short-term artist, capped at 5
    expect(result.spotify.genres).toEqual(['pop', 'rock']);
    expect(typeof result.spotify.fetchedAt).toBe('string');
  });

  it('returns null when the spotify token is missing', async () => {
    getValidAccessTokenMock.mockResolvedValue({ success: false });
    const result = await _fetchSinglePlatform(TEST_USER, 'spotify');
    expect(result).toBeNull();
    // No axios call should have happened (token guard is first).
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('swallows a rejected axios call and returns null (inner catch, no throw)', async () => {
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });
    // recently-played (non-catch-guarded call) rejects → inner try/catch swallows.
    axiosGetMock.mockImplementation((url) => {
      if (url.includes('currently-playing')) return Promise.resolve({ data: null });
      return Promise.reject(new Error('spotify 500'));
    });
    let result;
    await expect(async () => { result = await _fetchSinglePlatform(TEST_USER, 'spotify'); }).not.toThrow();
    result = await _fetchSinglePlatform(TEST_USER, 'spotify');
    expect(result).toBeNull();
  });
});

describe('_fetchSinglePlatform — calendar (+ google_calendar alias)', () => {
  const calResponse = {
    data: {
      items: [
        // isToday true (near-now start)
        { id: 'e1', summary: 'Standup', start: { dateTime: new Date().toISOString() } },
        // isToday false (7 days out)
        { id: 'e2', summary: 'Future', start: { dateTime: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString() } },
      ],
    },
  };

  it("returns data.calendar via platform === 'calendar'", async () => {
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });
    axiosGetMock.mockResolvedValue(calResponse);

    const result = await _fetchSinglePlatform(TEST_USER, 'calendar');

    expect(result).not.toBeNull();
    expect(result.calendar).toBeDefined();
    expect(result.calendar.todayEvents.map(e => e.id)).toEqual(['e1']);
    expect(result.calendar.upcomingEvents.map(e => e.id)).toEqual(['e2']);
    expect(typeof result.calendar.fetchedAt).toBe('string');
  });

  it("returns data.calendar via platform === 'google_calendar' (alias)", async () => {
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });
    axiosGetMock.mockResolvedValue(calResponse);

    const result = await _fetchSinglePlatform(TEST_USER, 'google_calendar');

    expect(result).not.toBeNull();
    expect(result.calendar).toBeDefined();
    expect(result.calendar.todayEvents.map(e => e.id)).toEqual(['e1']);
    expect(result.calendar.upcomingEvents.map(e => e.id)).toEqual(['e2']);
  });

  it('requests the google_calendar token for both aliases', async () => {
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });
    axiosGetMock.mockResolvedValue(calResponse);
    await _fetchSinglePlatform(TEST_USER, 'calendar');
    expect(getValidAccessTokenMock).toHaveBeenCalledWith(TEST_USER, 'google_calendar');
  });
});

describe('_fetchSinglePlatform — whoop', () => {
  it('direct path (token, not NANGO_MANAGED) shapes data.whoop', async () => {
    whoopConnResult = { data: { access_token: 'plain-token' }, error: null };
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });

    const nowIso = new Date().toISOString();
    routeAxios([
      ['/recovery', { data: { records: [{ score: { recovery_score: 66, hrv_rmssd_milli: 42.7, resting_heart_rate: 55.4 } }] } }],
      ['/activity/sleep', { data: { records: [
        { end: nowIso, score: { total_sleep_time_milli: 7 * 3600 * 1000, stage_summary: {} } },
      ] } }],
    ]);

    const result = await _fetchSinglePlatform(TEST_USER, 'whoop');

    expect(result).not.toBeNull();
    expect(result.whoop).toBeDefined();
    expect(result.whoop.recovery).toBe(66);
    expect(result.whoop.sleepHours).toBe('7.0');
    expect(result.whoop.hrv).toBe(43);        // rounded
    expect(result.whoop.restingHR).toBe(55);  // rounded
    expect(typeof result.whoop.fetchedAt).toBe('string');
    // The direct path must NOT touch nangoService.
    expect(nangoGetRecoveryMock).not.toHaveBeenCalled();
  });

  it('NANGO_MANAGED path shapes data.whoop via nangoService', async () => {
    whoopConnResult = { data: { access_token: 'NANGO_MANAGED' }, error: null };
    const nowIso = new Date().toISOString();
    nangoGetRecoveryMock.mockResolvedValue({
      success: true,
      data: { records: [{ score: { recovery_score: 80, hrv_rmssd_milli: 50.2, resting_heart_rate: 48.6 } }] },
    });
    nangoGetSleepMock.mockResolvedValue({
      success: true,
      data: { records: [{ end: nowIso, score: { total_sleep_time_milli: 8 * 3600 * 1000, stage_summary: {} } }] },
    });

    const result = await _fetchSinglePlatform(TEST_USER, 'whoop');

    expect(result).not.toBeNull();
    expect(result.whoop).toBeDefined();
    expect(result.whoop.recovery).toBe(80);
    expect(result.whoop.sleepHours).toBe('8.0');
    expect(result.whoop.hrv).toBe(50);
    expect(result.whoop.restingHR).toBe(49);
    expect(nangoGetRecoveryMock).toHaveBeenCalledWith(TEST_USER, 1);
    expect(nangoGetSleepMock).toHaveBeenCalledWith(TEST_USER, 5);
    // Direct axios path must not run for the managed connection.
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('swallows a rejected whoop axios call and returns null', async () => {
    whoopConnResult = { data: { access_token: 'plain-token' }, error: null };
    getValidAccessTokenMock.mockResolvedValue({ success: true, accessToken: 'tok' });
    axiosGetMock.mockRejectedValue(new Error('whoop 503'));

    const result = await _fetchSinglePlatform(TEST_USER, 'whoop');
    expect(result).toBeNull();
  });
});

describe('_fetchSinglePlatform — web', () => {
  it('aggregates data.web from user_platform_data', async () => {
    webEventsResult = {
      data: [
        { data_type: 'extension_search_query', raw_data: { category: 'tech', domain: 'github.com', topics: ['ai', 'llm'], query: 'vector db' }, created_at: '2026-07-01T10:00:00Z' },
        { data_type: 'extension_pageview', raw_data: { category: 'tech', domain: 'news.ycombinator.com', topics: ['ai'] }, created_at: '2026-07-01T09:00:00Z' },
      ],
      error: null,
    };

    const result = await _fetchSinglePlatform(TEST_USER, 'web');

    expect(result).not.toBeNull();
    expect(result.web).toBeDefined();
    expect(result.web.hasExtensionData).toBe(true);
    expect(result.web.totalEvents).toBe(2);
    expect(result.web.topCategories).toEqual(['tech']);
    expect(result.web.topDomains).toEqual(['github.com', 'news.ycombinator.com']);
    expect(result.web.topTopics).toEqual(['ai', 'llm']);
    expect(result.web.recentSearches).toEqual(['vector db']);
    expect(typeof result.web.fetchedAt).toBe('string');
  });

  it('returns null when there is no web data', async () => {
    webEventsResult = { data: [], error: null };
    const result = await _fetchSinglePlatform(TEST_USER, 'web');
    expect(result).toBeNull();
  });
});

describe('_fetchSinglePlatform — unknown platform', () => {
  it('returns null for an unregistered platform', async () => {
    const result = await _fetchSinglePlatform(TEST_USER, 'github');
    expect(result).toBeNull();
    expect(getValidAccessTokenMock).not.toHaveBeenCalled();
    expect(axiosGetMock).not.toHaveBeenCalled();
  });
});
