/**
 * The YouTube activities endpoint returns no watch history, and has not since
 * 2016.
 *
 * IMPORTERS/CALLERS: exercises fetchYouTubeObservations in
 * api/services/observationFetchers/youtube.js, registered in PLATFORM_FETCHERS
 * and driven by /api/cron/ingest-observations.
 * AFFECTED API: YouTube Data API v3 `activities` (dead for watch history),
 * plus `subscriptions` and `videos?myRating=like` which both still work.
 * DATA SCHEMAS: reads platform_connections.access_token to choose the Nango or
 * direct-token path. Observations are persisted by the caller, not here.
 * USER'S VERBATIM INSTRUCTION: "fix the whoop token and the dead youtube
 * activities call".
 *
 * The direct-token branch called activities?part=snippet&mine=true every
 * ingestion cycle and filtered for `snippet.type === 'watch'`. Google removed
 * watch activities from that response in 2016, so the filter matched nothing
 * and all three observations behind it — recently watched, weekly volume,
 * time-of-day peak — were unreachable. One request per user per run, for a
 * result that could not exist.
 *
 * These tests pin the absence, because a dead call is easy to reintroduce:
 * the endpoint still returns 200, just never with the data this wanted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxiosGet, mockGetValidAccessToken, mockGetSupabase } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockGetValidAccessToken: vi.fn(),
  mockGetSupabase: vi.fn(),
}));

vi.mock('axios', () => ({ default: { get: mockAxiosGet } }));
vi.mock('../../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: mockGetValidAccessToken,
}));
vi.mock('../../../../api/services/observationUtils.js', () => ({
  getSupabase: mockGetSupabase,
  _hasNangoMapping: vi.fn(async () => false),
  sanitizeExternal: (value, max) =>
    typeof value === 'string' ? value.slice(0, max ?? 100) : '',
}));

const { default: fetchYouTubeObservations } = await import(
  '../../../../api/services/observationFetchers/youtube.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** platform_connections row with a real token -> direct-token branch. */
function supabaseWithDirectToken() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: { access_token: 'direct-token' } }),
  };
  return { from: () => builder };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSupabase.mockResolvedValue(supabaseWithDirectToken());
  mockGetValidAccessToken.mockResolvedValue({ success: true, accessToken: 'tok' });
  mockAxiosGet.mockImplementation(async (url) => {
    if (url.includes('/subscriptions')) {
      return { data: { items: [{ snippet: { title: 'Veritasium', publishedAt: '2024-01-01T00:00:00Z' } }] } };
    }
    if (url.includes('myRating=like')) {
      return { data: { items: [{ snippet: { title: 'A Liked Video', channelTitle: 'Veritasium' } }] } };
    }
    // Google still answers activities with 200 — just never with watch items.
    if (url.includes('/activities')) return { data: { items: [] } };
    return { data: { items: [] } };
  });
});

describe('fetchYouTubeObservations', () => {
  it('does not call the activities endpoint', async () => {
    await fetchYouTubeObservations(USER_ID);

    const urls = mockAxiosGet.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.includes('/activities'))).toHaveLength(0);
  });

  it('still fetches the endpoints that do return data', async () => {
    await fetchYouTubeObservations(USER_ID);

    const urls = mockAxiosGet.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('/subscriptions'))).toBe(true);
    expect(urls.some((u) => u.includes('myRating=like'))).toBe(true);
  });

  it('still produces the observations that rest on live data', async () => {
    const observations = await fetchYouTubeObservations(USER_ID);
    const text = observations.map((o) => (typeof o === 'string' ? o : o.content)).join('\n');

    expect(text).toContain('Subscribed to 1 YouTube channel');
    expect(text).toContain('A Liked Video');
  });

  it('claims nothing about what the user watched', async () => {
    const observations = await fetchYouTubeObservations(USER_ID);
    const text = observations.map((o) => (typeof o === 'string' ? o : o.content)).join('\n');

    expect(text).not.toMatch(/Recently watched on YouTube/i);
    expect(text).not.toMatch(/Watched \d+ YouTube videos in the past 7 days/i);
    expect(text).not.toMatch(/YouTube watching peaks/i);
  });
});
