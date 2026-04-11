/**
 * Apple Music observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Apple Music data and return natural-language observations.
 * Requires Apple Music user token stored via Nango or platform_connections.
 */
async function fetchAppleMusicObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check for Nango-managed Apple Music connection
  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'apple_music');
  if (!isNangoManaged) {
    // Fallback: check platform_connections for user-provided token
    const tokenResult = await getValidAccessToken(userId, 'apple_music');
    if (!tokenResult.success || !tokenResult.accessToken) {
      log.warn('Apple Music: no valid token', { userId });
      return observations;
    }
  }

  try {
    const appleMusicService = await import('../platforms/appleMusicService.js');

    // Get user token from platform_connections
    const tokenResult = await getValidAccessToken(userId, 'apple_music');
    if (!tokenResult.success || !tokenResult.accessToken) return observations;
    const userToken = tokenResult.accessToken;

    // Recently played tracks
    const recentTracks = await appleMusicService.getRecentlyPlayed(userToken, 10).catch(() => []);
    for (const track of recentTracks.slice(0, 5)) {
      const name = track.attributes?.name;
      const artist = track.attributes?.artistName;
      if (name && artist) {
        observations.push(`Listened to '${name}' by ${artist} on Apple Music`);
      }
    }

    // Genre distribution from library songs
    const librarySongs = await appleMusicService.getLibrarySongs(userToken, 25).catch(() => []);
    if (librarySongs.length > 0) {
      const genreCounts = {};
      for (const song of librarySongs) {
        const genres = song.attributes?.genreNames || [];
        for (const genre of genres) {
          if (genre !== 'Music') {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          }
        }
      }
      const topGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([genre]) => genre);
      if (topGenres.length > 0) {
        observations.push({
          content: `Apple Music top genres: ${topGenres.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }
    }

    // Playlist analysis
    const playlists = await appleMusicService.getLibraryPlaylists(userToken, 10).catch(() => []);
    if (playlists.length > 0) {
      const playlistNames = playlists
        .map(p => p.attributes?.name)
        .filter(Boolean)
        .slice(0, 5);
      if (playlistNames.length > 0) {
        observations.push({
          content: `Curated Apple Music playlists: ${playlistNames.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Apple Music error', { error: e });
  }

  return observations;
}

export default fetchAppleMusicObservations;
export { fetchAppleMusicObservations };
