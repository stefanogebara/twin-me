/**
 * Spotify Data Fetcher
 *
 * Extracts and structures Spotify platform data for reflection generation.
 * Handles both old (individual rows) and new (API response with items[]) formats.
 */

import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Get Spotify data for reflection
 *
 * Data can be stored in two formats:
 * 1. Individual rows (old format): each row = 1 track with flat structure
 * 2. API response (new format): each row = full Spotify API response with items[] array
 *
 * @param {string} userId - User ID
 * @param {Object} context - Aggregated user context
 * @returns {Promise<Object>} { success, data?, error? }
 */
export async function getSpotifyData(userId, context) {
  try {
    // Get top tracks - try both 'top_tracks' (new) and 'top_track' (old) formats
    const { data: topTracksNew } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'top_tracks')
      .order('extracted_at', { ascending: false })
      .limit(1);

    const { data: topTracksOld } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'top_track')
      .order('extracted_at', { ascending: false })
      .limit(20);

    // Get recent plays - fetch multiple records to aggregate listening hours across days
    // Spotify API only returns 50 most recent tracks per call, so we need historical records
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPlays } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'recently_played')
      .gte('extracted_at', sevenDaysAgo)
      .order('extracted_at', { ascending: false })
      .limit(50); // Get up to 50 sync records for comprehensive listening hour data

    // Get audio features if available
    const { data: audioFeatures } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'audio_features')
      .order('extracted_at', { ascending: false })
      .limit(1);

    // Get top artists (has genre info from Spotify API)
    const { data: topArtistsData } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'top_artists')
      .order('extracted_at', { ascending: false })
      .limit(1);

    // Extract tracks from new format (API response with items array)
    let allTopTracks = [];
    let allRecentTracks = [];

    // Handle new format: raw_data.items is an array
    if (topTracksNew?.[0]?.raw_data?.items) {
      allTopTracks = topTracksNew[0].raw_data.items.map(item => ({
        name: item.name,
        artist: item.artists?.[0]?.name,
        genres: item.artists?.[0]?.genres || []
      }));
    }
    // Handle old format: each row is a track
    if (topTracksOld?.length) {
      const oldTracks = topTracksOld.map(t => ({
        name: t.raw_data?.track_name || t.raw_data?.name,
        artist: t.raw_data?.artist_name || t.raw_data?.artists?.[0]?.name,
        genres: t.raw_data?.genres || []
      })).filter(t => t.name);
      allTopTracks = [...allTopTracks, ...oldTracks];
    }

    // Handle recent plays - aggregate from multiple sync records for accurate listening hour data
    // Each sync record contains tracks from that point in time, so we aggregate and deduplicate
    if (recentPlays?.length > 0) {
      const seenTracks = new Set(); // Track unique plays by played_at timestamp
      recentPlays.forEach(record => {
        if (record.raw_data?.items) {
          record.raw_data.items.forEach(item => {
            const playedAt = item.played_at;
            // Use played_at as unique key to avoid duplicates across sync records
            if (playedAt && !seenTracks.has(playedAt)) {
              seenTracks.add(playedAt);
              allRecentTracks.push({
                name: item.track?.name,
                artist: item.track?.artists?.[0]?.name,
                playedAt: playedAt,
                genres: item.track?.artists?.[0]?.genres || []
              });
            }
          });
        }
      });
      // Sort by played_at descending (most recent first)
      allRecentTracks = allRecentTracks
        .filter(t => t.name)
        .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
    }

    // Extract unique artists
    const topArtists = [...new Set(
      allTopTracks.map(t => t.artist).filter(Boolean)
    )].slice(0, 10);

    // Format track names
    const topTrackNames = allTopTracks
      .map(t => `${t.name} by ${t.artist}`)
      .filter(Boolean)
      .slice(0, 10);

    const recentTrackNames = allRecentTracks
      .map(t => t.name)
      .filter(Boolean)
      .slice(0, 10);

    // Calculate average audio features
    const features = audioFeatures?.[0]?.raw_data || {};

    // ========== VISUALIZATION DATA ==========

    // 1. Top Artists with Play Counts (combine from tracks and recent plays)
    const artistPlayCounts = {};
    [...allTopTracks, ...allRecentTracks].forEach(track => {
      if (track.artist) {
        artistPlayCounts[track.artist] = (artistPlayCounts[track.artist] || 0) + 1;
      }
    });
    const topArtistsWithPlays = Object.entries(artistPlayCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, plays]) => ({ name, plays }));

    // 2. Genre Distribution (from top artists API data or inferred from tracks)
    let genreCounts = {};

    // First try top_artists data which has accurate genre info
    if (topArtistsData?.[0]?.raw_data?.items) {
      topArtistsData[0].raw_data.items.forEach(artist => {
        const genres = artist.genres || [];
        genres.forEach(genre => {
          // Normalize genre names (capitalize first letter)
          const normalizedGenre = genre.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          genreCounts[normalizedGenre] = (genreCounts[normalizedGenre] || 0) + 1;
        });
      });
    }

    // Fallback: try to extract from tracks if available
    if (Object.keys(genreCounts).length === 0) {
      [...allTopTracks, ...allRecentTracks].forEach(track => {
        if (track.genres && Array.isArray(track.genres)) {
          track.genres.forEach(genre => {
            const normalizedGenre = genre.split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            genreCounts[normalizedGenre] = (genreCounts[normalizedGenre] || 0) + 1;
          });
        }
      });
    }

    const totalGenreOccurrences = Object.values(genreCounts).reduce((sum, count) => sum + count, 0);
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({
        genre,
        percentage: Math.round((count / totalGenreOccurrences) * 100)
      }));

    // 3. Listening Hours Distribution (from recent plays with timestamps)
    const hourCounts = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;

    allRecentTracks.forEach(track => {
      if (track.playedAt) {
        try {
          const hour = new Date(track.playedAt).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        } catch (e) {
          // Skip invalid dates
        }
      }
    });

    const listeningHours = Object.entries(hourCounts)
      .map(([hour, plays]) => ({ hour: parseInt(hour), plays }))
      .sort((a, b) => a.hour - b.hour);

    console.log(`[Reflection] Found ${allTopTracks.length} top tracks, ${allRecentTracks.length} recent tracks for user ${userId}`);
    console.log(`[Reflection] Visualization data: ${topArtistsWithPlays.length} artists, ${topGenres.length} genres, ${listeningHours.filter(h => h.plays > 0).length} active hours`);

    return {
      success: allTopTracks.length > 0 || allRecentTracks.length > 0,
      data: {
        topArtists,
        topTrackNames,
        recentTrackNames,
        // Also include structured data for visual display
        recentTracksStructured: allRecentTracks.slice(0, 5),
        averageEnergy: features.energy || context.spotify?.averageEnergy,
        averageValence: features.valence,
        listeningContext: context.spotify?.recentMood,
        // NEW: Visualization data for charts
        topArtistsWithPlays,
        topGenres,
        listeningHours
      }
    };
  } catch (error) {
    console.error('[Reflection] Spotify data error:', error);
    return { success: false, error: error.message };
  }
}
