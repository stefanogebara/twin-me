/**
 * correlationEngine.fetchSpotifyData — enrichment must not destroy primary data.
 *
 * IMPORTERS/CALLERS: fetchSpotifyData is called by the exported
 * analyzeCorrelations (api/services/correlationEngine.js:591); this test
 * imports it directly via a named export added for testability.
 * AFFECTED API: Spotify GET /v1/me/player/recently-played?limit=50 (primary)
 * and GET /v1/audio-features (enrichment, currently HTTP 403 for this app).
 * DATA SCHEMAS: none written; the function returns in-memory track objects.
 * USER'S VERBATIM INSTRUCTION: "ok compacted now contnue".
 *
 * The bug this pins: the audio-features call sat in the function's OUTER try
 * with no local catch, so its 403 threw past the merge loop and landed in the
 * bottom `catch { return null }`. Fifty tracks that had already been fetched
 * successfully were discarded because an optional enrichment failed.
 *
 * Tracks are the primary signal for correlation analysis; energy/valence are
 * decoration. Losing everything because the decoration is unavailable is the
 * inverse of the priority these two data sources actually have.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxiosGet, mockGetValidAccessToken } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockGetValidAccessToken: vi.fn(),
}));

vi.mock('axios', () => ({ default: { get: mockAxiosGet } }));
vi.mock('../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: mockGetValidAccessToken,
}));

const { fetchSpotifyData } = await import(
  '../../../api/services/correlationEngine.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** Two real plays, as recently-played returns them. */
const RECENTLY_PLAYED = {
  data: {
    items: [
      {
        played_at: '2026-08-13T10:00:00Z',
        track: {
          id: 't1',
          name: 'Track One',
          artists: [{ name: 'Artist A' }],
          duration_ms: 200000,
        },
      },
      {
        played_at: '2026-08-13T10:05:00Z',
        track: {
          id: 't2',
          name: 'Track Two',
          artists: [{ name: 'Artist B' }],
          duration_ms: 180000,
        },
      },
    ],
  },
};

function forbidden() {
  const err = new Error('Request failed with status code 403');
  err.response = { status: 403 };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetValidAccessToken.mockResolvedValue({
    success: true,
    accessToken: 'token',
  });
});

describe('fetchSpotifyData', () => {
  it('keeps the tracks when audio-features returns 403', async () => {
    mockAxiosGet.mockImplementation((url) => {
      if (url.includes('recently-played')) return Promise.resolve(RECENTLY_PLAYED);
      if (url.includes('audio-features')) return Promise.reject(forbidden());
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    const tracks = await fetchSpotifyData(USER_ID);

    expect(tracks).not.toBeNull();
    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.trackName)).toEqual(['Track One', 'Track Two']);
  });

  it('leaves enrichment fields absent rather than zeroed when 403', async () => {
    mockAxiosGet.mockImplementation((url) => {
      if (url.includes('recently-played')) return Promise.resolve(RECENTLY_PLAYED);
      return Promise.reject(forbidden());
    });

    const [first] = await fetchSpotifyData(USER_ID);

    expect(first.valence).toBeUndefined();
    expect(first.energy).toBeUndefined();
  });

  it('still merges features when audio-features succeeds', async () => {
    mockAxiosGet.mockImplementation((url) => {
      if (url.includes('recently-played')) return Promise.resolve(RECENTLY_PLAYED);
      if (url.includes('audio-features')) {
        return Promise.resolve({
          data: {
            audio_features: [
              { id: 't1', energy: 0.8, valence: 0.7, tempo: 120, danceability: 0.6 },
              { id: 't2', energy: 0.4, valence: 0.3, tempo: 90, danceability: 0.5 },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    const tracks = await fetchSpotifyData(USER_ID);

    expect(tracks[0]).toMatchObject({ energy: 0.8, valence: 0.7 });
    expect(tracks[1]).toMatchObject({ energy: 0.4, valence: 0.3 });
  });

  // The primary fetch failing IS a reason to give up — the distinction the
  // original code lost is between primary and optional.
  it('returns null when recently-played itself fails', async () => {
    mockAxiosGet.mockRejectedValue(new Error('network down'));
    expect(await fetchSpotifyData(USER_ID)).toBeNull();
  });

  it('returns null when there is no Spotify token', async () => {
    mockGetValidAccessToken.mockResolvedValue({ success: false });
    expect(await fetchSpotifyData(USER_ID)).toBeNull();
  });
});
