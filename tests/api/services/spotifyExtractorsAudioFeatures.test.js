/**
 * Audio-features must never take a Spotify extraction down with it.
 *
 * IMPORTERS/CALLERS: exercises realTimeExtractor.extractSpotifySignature
 * (called by api/routes/soul-extraction.js:112) and
 * spotifyEnhancedExtractor.getAudioFeaturesForTracks, used by
 * extractComprehensiveProfile (soul-extraction.js:220).
 * AFFECTED API: Spotify top-tracks / top-artists / recently-played / playlists
 * (primary data) plus GET /v1/audio-features (enrichment, HTTP 403 for this
 * app since Nov 2024).
 * DATA SCHEMAS: none written by these paths; both return in-memory profiles.
 * USER'S VERBATIM INSTRUCTION: "fix the remaining four call sites too".
 *
 * The bugs these pin, both the same shape as correlationEngine's:
 *
 *   realTimeExtractor fetched topTracks/topArtists/recentTracks/playlists in a
 *   Promise.all, then called audio-features through fetchWithRetry. That helper
 *   throws on !ok and retries twice, so a PERMANENT 403 cost three requests and
 *   ~3s of backoff sleeps before throwing into the outer catch — discarding all
 *   four datasets and returning { success: false }.
 *
 *   spotifyEnhancedExtractor did the same past TEN fetched datasets, because
 *   getAudioFeaturesForTracks routes through spotifyRequest, which throws on
 *   !ok.
 *
 * Optional enrichment failing is not a reason to throw away primary data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// realTimeExtractor imports supabaseAdmin at module load, which throws without
// env. These tests exercise HTTP behaviour only and never touch the DB.
vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const ORIGINAL_FLAG = process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;

/** Minimal Spotify-shaped payload per endpoint. */
function payloadFor(url) {
  if (url.includes('/top/tracks')) {
    return { items: [{ id: 't1', name: 'Track One', artists: [{ name: 'A' }] }] };
  }
  if (url.includes('/top/artists')) {
    return { items: [{ id: 'a1', name: 'Artist A', genres: ['rock'] }] };
  }
  if (url.includes('recently-played')) {
    return {
      items: [
        {
          played_at: '2026-08-13T10:00:00Z',
          track: { id: 't1', name: 'Track One', artists: [{ name: 'A' }] },
        },
      ],
    };
  }
  if (url.includes('/tracks')) return { items: [{ track: { id: 't1' } }] };
  if (url.includes('/playlists')) return { items: [{ id: 'p1', name: 'Mix' }] };
  if (url.includes('/following')) return { artists: { items: [{ id: 'a1' }] } };
  return { items: [] };
}

/** global.fetch stub: everything succeeds except audio-features, which 403s. */
function installFetch() {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    calls.push(String(url));
    if (String(url).includes('audio-features')) {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { status: 403 } }),
      };
    }
    return { ok: true, status: 200, json: async () => payloadFor(String(url)) };
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.SPOTIFY_AUDIO_FEATURES_ENABLED;
  else process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = ORIGINAL_FLAG;
});

// fetchSpotifyData is the unit that owns this bug. Its caller
// extractSpotifySignature additionally needs this.analyzer, which the
// constructor leaves null, so it is not the right seam for an API test.
describe('realTimeExtractor.fetchSpotifyData', () => {
  it('returns the fetched data instead of failing when audio-features is unavailable', async () => {
    installFetch();
    const { default: RealTimeExtractor } = await import(
      '../../../api/services/realTimeExtractor.js'
    );
    const extractor = new RealTimeExtractor();

    const result = await extractor.fetchSpotifyData('token');

    expect(result.success).toBe(true);
    expect(result.data.topTracks).toHaveLength(1);
    expect(result.data.audioFeatures).toEqual([]);
  });

  it('does not spend requests on a known-restricted endpoint', async () => {
    const calls = installFetch();
    const { default: RealTimeExtractor } = await import(
      '../../../api/services/realTimeExtractor.js'
    );
    const extractor = new RealTimeExtractor();

    await extractor.fetchSpotifyData('token');

    expect(calls.filter((u) => u.includes('audio-features'))).toHaveLength(0);
  });

  it('survives a 403 even when the endpoint is re-enabled by config', async () => {
    process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = 'true';
    const calls = installFetch();
    const { default: RealTimeExtractor } = await import(
      '../../../api/services/realTimeExtractor.js'
    );
    const extractor = new RealTimeExtractor();

    const result = await extractor.fetchSpotifyData('token');

    expect(calls.some((u) => u.includes('audio-features'))).toBe(true);
    expect(result.success).toBe(true);
    expect(result.data.topTracks).toHaveLength(1);
  });
});

describe('spotifyEnhancedExtractor.getAudioFeaturesForTracks', () => {
  it('returns empty rather than throwing when the endpoint is restricted', async () => {
    installFetch();
    const { default: extractor } = await import(
      '../../../api/services/spotifyEnhancedExtractor.js'
    );

    await expect(
      extractor.getAudioFeaturesForTracks('token', ['t1', 't2']),
    ).resolves.toEqual([]);
  });

  it('returns empty rather than throwing on a 403 when re-enabled', async () => {
    process.env.SPOTIFY_AUDIO_FEATURES_ENABLED = 'true';
    installFetch();
    const { default: extractor } = await import(
      '../../../api/services/spotifyEnhancedExtractor.js'
    );

    await expect(
      extractor.getAudioFeaturesForTracks('token', ['t1']),
    ).resolves.toEqual([]);
  });

  it('still returns nothing for an empty track list', async () => {
    installFetch();
    const { default: extractor } = await import(
      '../../../api/services/spotifyEnhancedExtractor.js'
    );

    await expect(extractor.getAudioFeaturesForTracks('token', [])).resolves.toEqual([]);
  });
});

/**
 * Returning [] instead of throwing makes a path REACHABLE that the throw used
 * to hide: analyzeMusicalSophistication divides by validFeatures.length, so an
 * empty list produced 0/0 = NaN, which propagated into complexityScore and
 * sophisticationScore, serialized to null through JSON, and collapsed `level`
 * to 'mainstream-accessible' for everyone. Fixing the throw without fixing
 * this would trade a loud failure for a silent wrong number.
 */
describe('spotifyEnhancedExtractor.analyzeMusicalSophistication', () => {
  const topArtistsLong = {
    items: [
      { popularity: 40, genres: ['indie', 'folk'] },
      { popularity: 60, genres: ['rock'] },
    ],
  };

  it('produces no NaN when there are no audio features', async () => {
    const { default: extractor } = await import(
      '../../../api/services/spotifyEnhancedExtractor.js'
    );

    const result = await extractor.analyzeMusicalSophistication(topArtistsLong, []);

    expect(Number.isNaN(result.complexityPreference)).toBe(false);
    expect(Number.isNaN(result.nicheScore)).toBe(false);
    expect(Number.isNaN(result.genreDiversity)).toBe(false);
  });

  it('survives JSON serialization without turning scores into null', async () => {
    const { default: extractor } = await import(
      '../../../api/services/spotifyEnhancedExtractor.js'
    );

    const result = await extractor.analyzeMusicalSophistication(topArtistsLong, []);

    expect(JSON.parse(JSON.stringify(result)).complexityPreference).not.toBeNull();
  });

  it('still uses audio complexity when features are present', async () => {
    const { default: extractor } = await import(
      '../../../api/services/spotifyEnhancedExtractor.js'
    );

    const withFeatures = await extractor.analyzeMusicalSophistication(topArtistsLong, [
      { instrumentalness: 0.9, acousticness: 0.9 },
    ]);
    const without = await extractor.analyzeMusicalSophistication(topArtistsLong, []);

    expect(withFeatures.complexityPreference).toBeGreaterThan(without.complexityPreference);
  });
});
