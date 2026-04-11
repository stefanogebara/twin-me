/**
 * Spotify observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Spotify data and return natural-language observations.
 * Reuses the same API call patterns from twin-chat.js.
 */
async function fetchSpotifyObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'spotify');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Spotify: no valid token', { userId });
    return observations;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

  // Currently playing
  try {
    const currentRes = await axios.get(
      'https://api.spotify.com/v1/me/player/currently-playing',
      { headers, timeout: 10000 }
    );
    if (currentRes.data?.item) {
      const track = currentRes.data.item.name;
      const artist = currentRes.data.item.artists?.[0]?.name || 'Unknown';
      observations.push(`Currently playing '${track}' by ${artist}`);
    }
  } catch (e) {
    // No current playback — that's fine
  }

  // Playback state — device type, shuffle, repeat mode
  try {
    const playerRes = await axios.get(
      'https://api.spotify.com/v1/me/player',
      { headers, timeout: 10000 }
    );
    if (playerRes.data) {
      const device = playerRes.data.device;
      const shuffle = playerRes.data.shuffle_state;
      const repeat = playerRes.data.repeat_state;
      const isPrivate = device?.is_private_session;

      if (device?.type) {
        const deviceLabel = device.type.toLowerCase(); // computer, smartphone, speaker, etc.
        const modeParts = [];
        if (shuffle) modeParts.push('shuffle on');
        if (repeat && repeat !== 'off') modeParts.push(`repeat ${repeat}`);
        if (isPrivate) modeParts.push('private session');
        const modeStr = modeParts.length > 0 ? ` (${modeParts.join(', ')})` : '';
        observations.push({
          content: `Listening on ${deviceLabel}${device.name ? ` "${sanitizeExternal(device.name, 30)}"` : ''}${modeStr}`,
          contentType: 'current_state',
        });
      }
    }
  } catch (e) {
    // No active device — that's fine
  }

  // Recently played — fetch once, reuse for observations, discovery, and session density
  let recentItems = [];
  let recentTracks = [];
  try {
    const recentRes = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers, timeout: 10000 }
    );
    recentItems = recentRes.data?.items || [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    recentTracks = recentItems.filter(item => new Date(item.played_at).getTime() > oneHourAgo);
    for (const item of recentTracks) {
      const track = item.track?.name;
      const artist = item.track?.artists?.[0]?.name || 'Unknown';
      const playedAt = new Date(item.played_at);
      const timeStr = playedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      observations.push(`Listened to '${track}' by ${artist} at ${timeStr}`);
    }
  } catch (e) {
    log.warn('Spotify recently-played error', { error: e });
  }

  // Top artists (short term) — generate one summary observation
  let topArtistNames = [];
  try {
    const topRes = await axios.get(
      'https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term',
      { headers, timeout: 10000 }
    );
    const topArtists = topRes.data?.items || [];
    topArtistNames = topArtists.map(a => a.name);
    if (topArtists.length > 0) {
      observations.push(`Top artist this week: ${topArtists[0].name}`);
    }
  } catch (e) {
    log.warn('Spotify top-artists error', { error: e });
  }

  // --- Richer observation templates ---

  // Time-of-day listening
  const hour = new Date().getHours();
  if (observations.length > 1) {
    if (hour >= 0 && hour < 5) {
      observations.push({ content: 'Late-night listening session (after midnight)', contentType: 'current_state' });
    } else if (hour >= 5 && hour < 7) {
      observations.push({ content: 'Early morning music ritual (before 7am)', contentType: 'current_state' });
    }
  }

  // New artist discovery: compare recent track artists vs top artists (reuse cached recentItems)
  if (topArtistNames.length > 0 && recentItems.length > 0) {
    const recentArtists = recentItems.map(item => item.track?.artists?.[0]?.name).filter(Boolean);
    const topSet = new Set(topArtistNames.map(n => n.toLowerCase()));
    for (const artist of recentArtists) {
      if (!topSet.has(artist.toLowerCase())) {
        observations.push({ content: `Discovered new artist: ${artist}`, contentType: 'daily_summary' });
        break; // Only report one new discovery per ingestion
      }
    }
  }

  // Session density: reuse cached recentTracks (already filtered to last hour)
  if (recentTracks.length >= 4) {
    observations.push({ content: `Extended listening session (${recentTracks.length} tracks recently)`, contentType: 'current_state' });
  }

  // Daily music listening summary — pattern-level observation
  // Combines top artist, recent tracks, and time-of-day for richer semantic matching
  if (recentTracks.length > 0 || topArtistNames.length > 0) {
    const parts = ['Spotify music listening pattern:'];
    if (topArtistNames.length > 0) {
      parts.push(`top artist is ${topArtistNames[0]}`);
      if (topArtistNames.length > 1) parts.push(`also listening to ${topArtistNames.slice(1, 4).join(', ')}`);
    }
    if (recentTracks.length > 0) {
      const recentArtists = [...new Set(recentTracks.map(item => item.track?.artists?.[0]?.name).filter(Boolean))].slice(0, 3);
      parts.push(`recently played ${recentArtists.join(', ')}`);
    }
    if (hour >= 22 || hour < 5) {
      parts.push('— late-night listening session');
    } else if (hour < 9) {
      parts.push('— morning music ritual');
    }
    observations.push({
      content: parts.join(' '),
      contentType: 'daily_summary',
    });
  }

  // ── Saved podcasts — intellectual identity signal ─────────────────────────
  try {
    const showsRes = await axios.get(
      'https://api.spotify.com/v1/me/shows?limit=20',
      { headers, timeout: 10000 }
    );
    const shows = showsRes.data?.items || [];
    if (shows.length > 0) {
      const showNames = shows.map(s => sanitizeExternal(s.show?.name, 60)).filter(Boolean).slice(0, 8);
      observations.push({
        content: `Listens to ${shows.length} podcast${shows.length !== 1 ? 's' : ''} on Spotify: ${showNames.join(', ')}`,
        contentType: 'weekly_summary',
      });

      // Extract publishers for diversity signal
      const publishers = [...new Set(shows.map(s => sanitizeExternal(s.show?.publisher, 40)).filter(Boolean))].slice(0, 5);
      if (publishers.length > 1) {
        observations.push({
          content: `Podcast publishers include: ${publishers.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }

      // Store raw podcast data for feature extractor
      try {
        const supabase = await getSupabase();
        if (supabase) {
          const today = new Date().toISOString().slice(0, 10);
          await supabase.from('user_platform_data').upsert({
            user_id: userId,
            platform: 'spotify',
            data_type: 'saved_show',
            source_url: `spotify:saved_shows:${today}`,
            raw_data: {
              total: shows.length,
              shows: shows.map(s => ({
                name: s.show?.name,
                publisher: s.show?.publisher,
                description: s.show?.description?.slice(0, 200),
                total_episodes: s.show?.total_episodes,
                explicit: s.show?.explicit,
                languages: s.show?.languages,
                added_at: s.added_at,
              })),
            },
            processed: true,
          }, { onConflict: 'user_id,platform,data_type,source_url' });
        }
      } catch (storeErr) {
        log.warn('Spotify: failed to store saved shows', { error: storeErr });
      }
    }
  } catch (e) {
    // Saved shows endpoint may fail — non-critical
    log.debug('Spotify saved shows error', { error: e?.message });
  }

  // ── Saved albums — music commitment signal ────────────────────────────────
  try {
    const albumsRes = await axios.get(
      'https://api.spotify.com/v1/me/albums?limit=20',
      { headers, timeout: 10000 }
    );
    const albums = albumsRes.data?.items || [];
    if (albums.length > 0) {
      const albumNames = albums.slice(0, 5).map(a => {
        const name = sanitizeExternal(a.album?.name, 50);
        const artist = sanitizeExternal(a.album?.artists?.[0]?.name, 30);
        return artist ? `${name} by ${artist}` : name;
      }).filter(Boolean);
      observations.push({
        content: `Has ${albums.length} saved album${albums.length !== 1 ? 's' : ''} on Spotify: ${albumNames.join(', ')}`,
        contentType: 'weekly_summary',
      });

      // Release year distribution for era preference
      const years = albums.map(a => {
        const rd = a.album?.release_date;
        return rd ? parseInt(rd.slice(0, 4)) : null;
      }).filter(y => y && y > 1900 && y <= new Date().getFullYear());
      if (years.length >= 3) {
        const decades = {};
        for (const y of years) {
          const dec = `${Math.floor(y / 10) * 10}s`;
          decades[dec] = (decades[dec] || 0) + 1;
        }
        const topDecades = Object.entries(decades).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, c]) => `${d} (${c})`);
        observations.push({
          content: `Album era preferences: ${topDecades.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }

      // Store raw album data for feature extractor
      try {
        const supabase = await getSupabase();
        if (supabase) {
          const today = new Date().toISOString().slice(0, 10);
          await supabase.from('user_platform_data').upsert({
            user_id: userId,
            platform: 'spotify',
            data_type: 'saved_album',
            source_url: `spotify:saved_albums:${today}`,
            raw_data: {
              total: albums.length,
              albums: albums.map(a => ({
                name: a.album?.name,
                artist: a.album?.artists?.[0]?.name,
                release_date: a.album?.release_date,
                total_tracks: a.album?.total_tracks,
                album_type: a.album?.album_type,
                added_at: a.added_at,
              })),
            },
            processed: true,
          }, { onConflict: 'user_id,platform,data_type,source_url' });
        }
      } catch (storeErr) {
        log.warn('Spotify: failed to store saved albums', { error: storeErr });
      }
    }
  } catch (e) {
    log.debug('Spotify saved albums error', { error: e?.message });
  }

  // Audio features analysis: mood detection from energy, valence, danceability
  if (recentItems.length > 0) {
    try {
      const trackIds = recentItems
        .map(item => item.track?.id)
        .filter(Boolean)
        .slice(0, 10);
      if (trackIds.length >= 3) {
        const featuresRes = await axios.get(
          `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
          { headers, timeout: 10000 }
        );
        const features = (featuresRes.data?.audio_features || []).filter(Boolean);
        if (features.length >= 3) {
          const avg = (key) => features.reduce((sum, f) => sum + (f[key] || 0), 0) / features.length;
          const avgValence = avg('valence');
          const avgEnergy = avg('energy');
          const avgDance = avg('danceability');

          const moodLabel = avgValence > 0.7 ? 'upbeat and positive'
            : avgValence > 0.4 ? 'balanced'
            : 'mellow or introspective';
          const energyLabel = avgEnergy > 0.7 ? 'high-energy'
            : avgEnergy > 0.4 ? 'moderate-energy'
            : 'low-energy, chill';

          observations.push({
            content: `Music mood right now: ${moodLabel}, ${energyLabel} (valence ${(avgValence * 100).toFixed(0)}%, energy ${(avgEnergy * 100).toFixed(0)}%, danceability ${(avgDance * 100).toFixed(0)}%)`,
            contentType: 'current_state',
          });
        }
      }
    } catch (e) {
      // Audio features endpoint may fail — non-critical
    }
  }

  return observations;
}

export default fetchSpotifyObservations;
export { fetchSpotifyObservations };
