/**
 * Tests for spotify/analytics/getRecentListening.js. The data path is
 * a Promise.all of two endpoints; tests stub the client.get to return
 * controlled fixtures and assert aggregation correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRecentListening } from '../../../../api/services/spotify/analytics/getRecentListening.js';

function play(played_at, name, artist, durationMs = 200000) {
  return {
    played_at,
    track: {
      name,
      duration_ms: durationMs,
      artists: [{ name: artist }],
    },
  };
}

function mockClient(recentlyPlayedItems, topArtistsItems) {
  return {
    get: vi.fn((path) => {
      if (path.includes('/v1/me/player/recently-played')) {
        return Promise.resolve({ items: recentlyPlayedItems });
      }
      if (path.includes('/v1/me/top/artists')) {
        return Promise.resolve({ items: topArtistsItems });
      }
      return Promise.resolve({});
    }),
  };
}

describe('getRecentListening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T15:00:00.000Z'));
  });

  it('returns zero-state when recently-played is empty', async () => {
    const client = mockClient([], []);
    const result = await getRecentListening(client, {});
    expect(result.totals.plays).toBe(0);
    expect(result.totals.unique_artists).toBe(0);
    expect(result.list).toEqual([]);
    expect(result.top_artists).toEqual([]);
  });

  it('aggregates plays by artist, sorted desc', async () => {
    const items = [
      play('2026-06-05T10:00:00Z', 'Track A', 'Radiohead'),
      play('2026-06-05T11:00:00Z', 'Track B', 'Radiohead'),
      play('2026-06-05T12:00:00Z', 'Track C', 'Radiohead'),
      play('2026-06-05T13:00:00Z', 'Track A', 'Boards of Canada'),
      play('2026-06-05T14:00:00Z', 'Track D', 'Boards of Canada'),
      play('2026-06-05T15:00:00Z', 'Track E', 'Aphex Twin'),
    ];
    const client = mockClient(items, []);
    const result = await getRecentListening(client, {});
    expect(result.totals.plays).toBe(6);
    expect(result.totals.unique_artists).toBe(3);
    expect(result.top_artists.map((a) => `${a.artist}×${a.plays}`)).toEqual([
      'Radiohead×3',
      'Boards of Canada×2',
      'Aphex Twin×1',
    ]);
  });

  it('aggregates by track:artist composite key', async () => {
    // Same track name by different artists are distinct entries.
    const items = [
      play('2026-06-05T10:00:00Z', 'Track A', 'Artist X'),
      play('2026-06-05T11:00:00Z', 'Track A', 'Artist X'),
      play('2026-06-05T12:00:00Z', 'Track A', 'Artist Y'),
    ];
    const client = mockClient(items, []);
    const result = await getRecentListening(client, {});
    expect(result.totals.unique_tracks).toBe(2);
    expect(result.top_tracks[0]).toMatchObject({ track: 'Track A', artist: 'Artist X', plays: 2 });
    expect(result.top_tracks[1]).toMatchObject({ track: 'Track A', artist: 'Artist Y', plays: 1 });
  });

  it('classifies plays into time-of-day buckets (UTC)', async () => {
    const items = [
      play('2026-06-05T03:00:00Z', 'A', 'X'), // late_night
      play('2026-06-05T08:00:00Z', 'B', 'X'), // morning
      play('2026-06-05T14:00:00Z', 'C', 'X'), // afternoon
      play('2026-06-05T20:00:00Z', 'D', 'X'), // evening
      play('2026-06-05T23:00:00Z', 'E', 'X'), // evening
    ];
    const client = mockClient(items, []);
    const result = await getRecentListening(client, {});
    expect(result.sessions).toEqual({
      late_night: 1,
      morning: 1,
      afternoon: 1,
      evening: 2,
    });
  });

  it('aggregates genres from top-artist data weighted by recent plays', async () => {
    const items = [
      play('2026-06-05T10:00:00Z', 'A', 'Radiohead'),
      play('2026-06-05T11:00:00Z', 'B', 'Radiohead'),
    ];
    const topArtists = [
      { name: 'Radiohead', genres: ['rock', 'alternative rock'] },
      { name: 'Boards of Canada', genres: ['electronic', 'idm'] },
    ];
    const client = mockClient(items, topArtists);
    const result = await getRecentListening(client, {});
    // Radiohead weighted by 2 recent plays; BoC weighted by 1 (floor).
    const rockEntry = result.top_genres.find((g) => g.genre === 'rock');
    const electronicEntry = result.top_genres.find((g) => g.genre === 'electronic');
    expect(rockEntry?.weight).toBe(2);
    expect(electronicEntry?.weight).toBe(1);
  });

  it('returns most-recent list bounded by list_limit', async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      play(`2026-06-05T${String(10 + i % 12).padStart(2, '0')}:${i}:00Z`, `Track ${i}`, 'Artist X'),
    );
    const client = mockClient(items, []);
    const result = await getRecentListening(client, { list_limit: 5 });
    expect(result.list).toHaveLength(5);
  });

  it('total_duration_ms is the sum of all play durations', async () => {
    const items = [
      play('2026-06-05T10:00:00Z', 'A', 'X', 240000), // 4 min
      play('2026-06-05T11:00:00Z', 'B', 'X', 180000), // 3 min
    ];
    const client = mockClient(items, []);
    const result = await getRecentListening(client, {});
    expect(result.totals.total_duration_ms).toBe(420000);
  });

  it('gracefully handles a failing top-artists fetch (returns empty genres)', async () => {
    const items = [play('2026-06-05T10:00:00Z', 'A', 'X')];
    const client = {
      get: vi.fn((path) => {
        if (path.includes('/v1/me/player/recently-played')) {
          return Promise.resolve({ items });
        }
        return Promise.reject(new Error('top-artists 401'));
      }),
    };
    const result = await getRecentListening(client, {});
    expect(result.totals.plays).toBe(1);
    expect(result.top_genres).toEqual([]);
  });

  it('hits both Spotify endpoints in parallel', async () => {
    const client = mockClient([], []);
    await getRecentListening(client, {});
    const calls = client.get.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.includes('/v1/me/player/recently-played'))).toBe(true);
    expect(calls.some((p) => p.includes('/v1/me/top/artists'))).toBe(true);
  });
});
