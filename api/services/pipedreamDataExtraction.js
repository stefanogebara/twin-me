/**
 * Pipedream Data Extraction Service
 *
 * Uses Pipedream SDK to extract data from connected platforms
 * without needing direct OAuth tokens. Pipedream handles authentication.
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Lazy init Pipedream client
let pdBackend = null;
async function getPipedreamClient() {
  if (!pdBackend) {
    const { PipedreamClient } = await import('@pipedream/sdk');
    pdBackend = new PipedreamClient({
      clientId: process.env.PIPEDREAM_CLIENT_ID,
      clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
      projectId: process.env.PIPEDREAM_PROJECT_ID,
      projectEnvironment: process.env.PIPEDREAM_ENV || 'development'
    });
  }
  return pdBackend;
}

/**
 * Extract Spotify data for a user
 * @param {string} userId - User ID
 * @param {string} pipedreamAccountId - Pipedream account ID
 * @returns {Promise<Object>} Extraction results
 */
export async function extractSpotifyData(userId, pipedreamAccountId) {
  console.log(`[Pipedream Extraction] Starting Spotify extraction for user ${userId}`);

  try {
    const pd = await getPipedreamClient();

    // Get account credentials from Pipedream
    // Pipedream Connect manages tokens - we need to fetch them via API
    console.log('[Pipedream Extraction] Getting account credentials from Pipedream...');

    const accountDetails = await pd.accounts.get({ id: pipedreamAccountId });

    if (!accountDetails || !accountDetails.credentials) {
      throw new Error('No credentials found for Pipedream account');
    }

    // Get the OAuth access token
    const accessToken = accountDetails.credentials.oauth_access_token ||
                       accountDetails.credentials.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Pipedream account credentials');
    }

    console.log('[Pipedream Extraction] ✅ Retrieved access token from Pipedream');

    const results = {
      success: true,
      extractedItems: 0,
      errors: []
    };

    // 1. Extract Recently Played Tracks
    try {
      console.log('[Pipedream Extraction] Fetching recently played tracks...');

      const recentlyPlayedResponse = await fetch(
        'https://api.spotify.com/v1/me/player/recently-played?limit=50',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      ).then(r => r.json());

      if (recentlyPlayedResponse.items && recentlyPlayedResponse.items.length > 0) {
        console.log(`[Pipedream Extraction] Found ${recentlyPlayedResponse.items.length} recently played tracks`);

        // Save to soul_data table
        for (const item of recentlyPlayedResponse.items) {
          await supabase.from('soul_data').insert({
            user_id: userId,
            platform: 'spotify',
            data_type: 'recently_played',
            raw_data: {
              track: item.track.name,
              artist: item.track.artists[0].name,
              album: item.track.album.name,
              played_at: item.played_at,
              duration_ms: item.track.duration_ms,
              uri: item.track.uri
            },
            extracted_patterns: {
              listening_time: new Date(item.played_at).getHours(),
              artist_name: item.track.artists[0].name,
              genre: item.track.album.genres || []
            }
          });
          results.extractedItems++;
        }
      }
    } catch (error) {
      console.error('[Pipedream Extraction] Error fetching recently played:', error.message);
      results.errors.push({ endpoint: 'recently_played', error: error.message });
    }

    // 2. Extract Top Tracks
    try {
      console.log('[Pipedream Extraction] Fetching top tracks...');

      const topTracksResponse = await fetch(
        'https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      ).then(r => r.json());

      if (topTracksResponse.items && topTracksResponse.items.length > 0) {
        console.log(`[Pipedream Extraction] Found ${topTracksResponse.items.length} top tracks`);

        for (const track of topTracksResponse.items) {
          await supabase.from('soul_data').insert({
            user_id: userId,
            platform: 'spotify',
            data_type: 'top_tracks',
            raw_data: {
              track: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              popularity: track.popularity,
              uri: track.uri
            },
            extracted_patterns: {
              music_taste: track.artists[0].name,
              popularity_preference: track.popularity
            }
          });
          results.extractedItems++;
        }
      }
    } catch (error) {
      console.error('[Pipedream Extraction] Error fetching top tracks:', error.message);
      results.errors.push({ endpoint: 'top_tracks', error: error.message });
    }

    // 3. Extract Top Artists
    try {
      console.log('[Pipedream Extraction] Fetching top artists...');

      const topArtistsResponse = await fetch(
        'https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      ).then(r => r.json());

      if (topArtistsResponse.items && topArtistsResponse.items.length > 0) {
        console.log(`[Pipedream Extraction] Found ${topArtistsResponse.items.length} top artists`);

        for (const artist of topArtistsResponse.items) {
          await supabase.from('soul_data').insert({
            user_id: userId,
            platform: 'spotify',
            data_type: 'top_artists',
            raw_data: {
              artist: artist.name,
              genres: artist.genres,
              popularity: artist.popularity,
              followers: artist.followers.total,
              uri: artist.uri
            },
            extracted_patterns: {
              favorite_genres: artist.genres,
              artist_preference: artist.name
            }
          });
          results.extractedItems++;
        }
      }
    } catch (error) {
      console.error('[Pipedream Extraction] Error fetching top artists:', error.message);
      results.errors.push({ endpoint: 'top_artists', error: error.message });
    }

    // 4. Extract Currently Playing (if available)
    try {
      console.log('[Pipedream Extraction] Checking currently playing...');

      const currentPlayingResponse = await fetch(
        'https://api.spotify.com/v1/me/player/currently-playing',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      ).then(r => r.status === 204 ? null : r.json());

      if (currentPlayingResponse && currentPlayingResponse.item) {
        console.log(`[Pipedream Extraction] Currently playing: ${currentPlayingResponse.item.name}`);

        await supabase.from('soul_data').insert({
          user_id: userId,
          platform: 'spotify',
          data_type: 'currently_playing',
          raw_data: {
            track: currentPlayingResponse.item.name,
            artist: currentPlayingResponse.item.artists[0].name,
            is_playing: currentPlayingResponse.is_playing,
            progress_ms: currentPlayingResponse.progress_ms
          },
          extracted_patterns: {
            listening_now: true,
            current_mood: 'listening'
          }
        });
        results.extractedItems++;
      }
    } catch (error) {
      // Currently playing may not be available - not critical
      console.log('[Pipedream Extraction] No currently playing track (normal if not listening)');
    }

    console.log(`[Pipedream Extraction] ✅ Spotify extraction complete: ${results.extractedItems} items extracted`);

    // Update platform connection with last sync time
    await supabase
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: 'success',
        total_synced: results.extractedItems
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    return results;

  } catch (error) {
    console.error('[Pipedream Extraction] ❌ Fatal error during Spotify extraction:', error);

    // Update platform connection with error status
    const { data: currentConnection } = await supabase
      .from('platform_connections')
      .select('error_count')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    await supabase
      .from('platform_connections')
      .update({
        last_sync_status: 'error',
        error_count: (currentConnection?.error_count || 0) + 1
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    throw error;
  }
}

/**
 * Extract YouTube data for a user
 * @param {string} userId - User ID
 * @param {string} pipedreamAccountId - Pipedream account ID
 * @returns {Promise<Object>} Extraction results
 */
export async function extractYouTubeData(userId, pipedreamAccountId) {
  console.log(`[Pipedream Extraction] Starting YouTube extraction for user ${userId}`);

  try {
    const pd = await getPipedreamClient();

    // Get account credentials from Pipedream
    console.log('[Pipedream Extraction] Getting YouTube account credentials from Pipedream...');
    const accountDetails = await pd.accounts.get({ id: pipedreamAccountId });

    if (!accountDetails || !accountDetails.credentials) {
      throw new Error('No credentials found for Pipedream account');
    }

    const accessToken = accountDetails.credentials.oauth_access_token ||
                       accountDetails.credentials.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Pipedream account credentials');
    }

    console.log('[Pipedream Extraction] ✅ Retrieved YouTube access token from Pipedream');

    const results = {
      success: true,
      extractedItems: 0,
      errors: []
    };

    // Extract liked videos
    try {
      const likedVideosResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&myRating=like&maxResults=50',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      ).then(r => r.json());

      if (likedVideosResponse.items) {
        for (const video of likedVideosResponse.items) {
          await supabase.from('soul_data').insert({
            user_id: userId,
            platform: 'youtube',
            data_type: 'liked_videos',
            raw_data: {
              title: video.snippet.title,
              channel: video.snippet.channelTitle,
              category: video.snippet.categoryId,
              tags: video.snippet.tags || []
            }
          });
          results.extractedItems++;
        }
      }
    } catch (error) {
      console.error('[Pipedream Extraction] Error fetching YouTube data:', error.message);
      results.errors.push({ endpoint: 'liked_videos', error: error.message });
    }

    await supabase
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: 'success',
        total_synced: results.extractedItems
      })
      .eq('user_id', userId)
      .eq('platform', 'youtube');

    return results;

  } catch (error) {
    console.error('[Pipedream Extraction] ❌ Error during YouTube extraction:', error);
    throw error;
  }
}

/**
 * Extract data for any platform via Pipedream
 * @param {string} platform - Platform name (spotify, youtube, etc.)
 * @param {string} userId - User ID
 * @param {string} pipedreamAccountId - Pipedream account ID
 * @returns {Promise<Object>} Extraction results
 */
export async function extractPlatformData(platform, userId, pipedreamAccountId) {
  switch (platform.toLowerCase()) {
    case 'spotify':
      return await extractSpotifyData(userId, pipedreamAccountId);

    case 'youtube':
      return await extractYouTubeData(userId, pipedreamAccountId);

    default:
      throw new Error(`Platform ${platform} not yet supported for Pipedream extraction`);
  }
}
