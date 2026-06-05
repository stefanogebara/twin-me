/**
 * Recent listening aggregator for Spotify — analogous to Whoop's
 * getWorkouts, but for music. Fetches the last 50 plays from
 * /me/player/recently-played + top artists from short_term (last
 * 4 weeks) and returns:
 *
 *   - totals: count, unique artists, unique tracks
 *   - top_artists: ordered by play frequency in the window
 *   - top_tracks: ordered by play frequency
 *   - top_genres: derived from artist.genres (Spotify only attaches
 *                 genres to artists, not tracks)
 *   - sessions: time-of-day distribution (morning/afternoon/evening/late_night)
 *   - list: the last N plays (default 10) as a compact stream
 *
 * Defaults: window_limit=50 (recently-played API max), list_limit=10.
 *
 * The recently-played endpoint returns the LAST 50 plays regardless
 * of when they happened — Spotify doesn't accept a date range here.
 * So "recent" is window-of-recent-plays, not "last N days".
 */

const ENDPOINT_RECENTLY_PLAYED = '/v1/me/player/recently-played?limit=50';
const ENDPOINT_TOP_ARTISTS = '/v1/me/top/artists?limit=10&time_range=short_term';
const DEFAULT_LIST_LIMIT = 10;

function timeOfDayBucket(iso) {
  const d = new Date(iso);
  const hour = d.getUTCHours();
  if (hour < 6) return 'late_night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([key, v]) => ({ ...v, key }));
}

/**
 * @param {object} client — { get(path) -> Promise<any> }
 * @param {{ list_limit?: number }} [params]
 */
export async function getRecentListening(client, params = {}) {
  const listLimit = params.list_limit ?? DEFAULT_LIST_LIMIT;

  // Fire both in parallel — they're independent endpoints and Spotify
  // doesn't rate-limit at this volume.
  const [recentlyPlayed, topArtistsResp] = await Promise.all([
    client.get(ENDPOINT_RECENTLY_PLAYED).catch(() => ({ items: [] })),
    client.get(ENDPOINT_TOP_ARTISTS).catch(() => ({ items: [] })),
  ]);

  const items = Array.isArray(recentlyPlayed?.items) ? recentlyPlayed.items : [];
  const topArtistsItems = Array.isArray(topArtistsResp?.items) ? topArtistsResp.items : [];

  // Per-artist + per-track aggregation from recently-played.
  const artistMap = new Map();
  const trackMap = new Map();
  const sessionBuckets = { morning: 0, afternoon: 0, evening: 0, late_night: 0 };
  for (const it of items) {
    const t = it.track;
    if (!t) continue;
    sessionBuckets[timeOfDayBucket(it.played_at)] += 1;

    const artistName = t.artists?.[0]?.name ?? 'unknown';
    const artistEntry = artistMap.get(artistName) || { artist: artistName, count: 0 };
    artistEntry.count += 1;
    artistMap.set(artistName, artistEntry);

    const trackKey = `${artistName}::${t.name}`;
    const trackEntry = trackMap.get(trackKey) || {
      track: t.name,
      artist: artistName,
      count: 0,
      duration_ms: t.duration_ms ?? 0,
    };
    trackEntry.count += 1;
    trackMap.set(trackKey, trackEntry);
  }

  // Genre aggregation from the medium-term top artists, joined with
  // play counts from the recent window. We treat the genre as a
  // characteristic of the artist (which is how Spotify exposes it).
  const genreMap = new Map();
  for (const a of topArtistsItems) {
    const playCount = artistMap.get(a.name)?.count ?? 0;
    // Even if not in recent window, still count the artist as a
    // signal for "lately I've been into X genre".
    const weight = Math.max(playCount, 1);
    for (const g of a.genres ?? []) {
      const entry = genreMap.get(g) || { genre: g, count: 0 };
      entry.count += weight;
      genreMap.set(g, entry);
    }
  }

  const topArtists = topN(artistMap, 5).map((a) => ({ artist: a.artist, plays: a.count }));
  const topTracks = topN(trackMap, 5).map((t) => ({
    track: t.track,
    artist: t.artist,
    plays: t.count,
  }));
  const topGenres = [...genreMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((g) => ({ genre: g.genre, weight: g.count }));

  // Most-recent stream — useful for "what did I listen to today".
  const list = items.slice(0, listLimit).map((it) => ({
    played_at: it.played_at,
    track: it.track?.name ?? 'unknown',
    artist: it.track?.artists?.[0]?.name ?? 'unknown',
    duration_ms: it.track?.duration_ms ?? 0,
  }));

  const totals = {
    plays: items.length,
    unique_artists: artistMap.size,
    unique_tracks: trackMap.size,
    total_duration_ms: items.reduce((sum, it) => sum + (it.track?.duration_ms ?? 0), 0),
  };

  return {
    totals,
    top_artists: topArtists,
    top_tracks: topTracks,
    top_genres: topGenres,
    sessions: sessionBuckets,
    list,
  };
}
