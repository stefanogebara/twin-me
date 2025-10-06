/**
 * Spotify Data Extractor
 * Extracts listening history, playlists, top artists, top tracks, and audio features
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class SpotifyExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.spotify.com/v1';
  }

  /**
   * Main extraction method - extracts all Spotify data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Spotify] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractRecentlyPlayed(userId);
      totalItems += await this.extractTopTracks(userId);
      totalItems += await this.extractTopArtists(userId);
      totalItems += await this.extractPlaylists(userId);
      totalItems += await this.extractSavedTracks(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Spotify] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[Spotify] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Spotify API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Spotify API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Extract recently played tracks (last 50 tracks)
   */
  async extractRecentlyPlayed(userId) {
    console.log(`[Spotify] Extracting recently played tracks...`);
    let trackCount = 0;

    try {
      // Spotify API only returns last 50 played tracks
      const data = await this.makeRequest('/me/player/recently-played', {
        limit: 50
      });

      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          const track = item.track;

          await this.storeRawData(userId, 'spotify', 'recently_played', {
            track_id: track.id,
            track_name: track.name,
            artist_name: track.artists.map(a => a.name).join(', '),
            artist_ids: track.artists.map(a => a.id),
            album_name: track.album.name,
            album_id: track.album.id,
            played_at: item.played_at,
            duration_ms: track.duration_ms,
            popularity: track.popularity,
            url: track.external_urls.spotify,
            context_type: item.context?.type, // playlist, album, artist, etc.
            context_uri: item.context?.uri
          });

          trackCount++;
        }
      }

      console.log(`[Spotify] Extracted ${trackCount} recently played tracks`);
      return trackCount;
    } catch (error) {
      console.error('[Spotify] Error extracting recently played:', error);
      return trackCount;
    }
  }

  /**
   * Extract top tracks (short, medium, and long term)
   */
  async extractTopTracks(userId) {
    console.log(`[Spotify] Extracting top tracks...`);
    let trackCount = 0;

    const timeRanges = [
      { range: 'short_term', label: 'Last 4 weeks' },    // ~4 weeks
      { range: 'medium_term', label: 'Last 6 months' },  // ~6 months
      { range: 'long_term', label: 'All time' }          // several years
    ];

    try {
      for (const timeRange of timeRanges) {
        const data = await this.makeRequest('/me/top/tracks', {
          time_range: timeRange.range,
          limit: 50
        });

        if (data.items && data.items.length > 0) {
          for (const track of data.items) {
            await this.storeRawData(userId, 'spotify', 'top_track', {
              track_id: track.id,
              track_name: track.name,
              artist_name: track.artists.map(a => a.name).join(', '),
              artist_ids: track.artists.map(a => a.id),
              album_name: track.album.name,
              album_id: track.album.id,
              duration_ms: track.duration_ms,
              popularity: track.popularity,
              url: track.external_urls.spotify,
              time_range: timeRange.range,
              time_range_label: timeRange.label,
              preview_url: track.preview_url
            });

            trackCount++;
          }
        }

        // Be nice to Spotify API
        await this.sleep(100);
      }

      console.log(`[Spotify] Extracted ${trackCount} top tracks`);
      return trackCount;
    } catch (error) {
      console.error('[Spotify] Error extracting top tracks:', error);
      return trackCount;
    }
  }

  /**
   * Extract top artists (short, medium, and long term)
   */
  async extractTopArtists(userId) {
    console.log(`[Spotify] Extracting top artists...`);
    let artistCount = 0;

    const timeRanges = [
      { range: 'short_term', label: 'Last 4 weeks' },
      { range: 'medium_term', label: 'Last 6 months' },
      { range: 'long_term', label: 'All time' }
    ];

    try {
      for (const timeRange of timeRanges) {
        const data = await this.makeRequest('/me/top/artists', {
          time_range: timeRange.range,
          limit: 50
        });

        if (data.items && data.items.length > 0) {
          for (const artist of data.items) {
            await this.storeRawData(userId, 'spotify', 'top_artist', {
              artist_id: artist.id,
              artist_name: artist.name,
              genres: artist.genres,
              popularity: artist.popularity,
              followers: artist.followers.total,
              url: artist.external_urls.spotify,
              time_range: timeRange.range,
              time_range_label: timeRange.label,
              images: artist.images
            });

            artistCount++;
          }
        }

        await this.sleep(100);
      }

      console.log(`[Spotify] Extracted ${artistCount} top artists`);
      return artistCount;
    } catch (error) {
      console.error('[Spotify] Error extracting top artists:', error);
      return artistCount;
    }
  }

  /**
   * Extract user's playlists
   */
  async extractPlaylists(userId) {
    console.log(`[Spotify] Extracting playlists...`);
    let playlistCount = 0;

    try {
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore) {
        const data = await this.makeRequest('/me/playlists', {
          limit,
          offset
        });

        if (data.items && data.items.length > 0) {
          for (const playlist of data.items) {
            // Get full playlist details including tracks
            const playlistDetails = await this.makeRequest(`/playlists/${playlist.id}`);

            await this.storeRawData(userId, 'spotify', 'playlist', {
              playlist_id: playlist.id,
              playlist_name: playlist.name,
              description: playlist.description,
              owner: playlist.owner.display_name,
              is_public: playlist.public,
              is_collaborative: playlist.collaborative,
              total_tracks: playlist.tracks.total,
              url: playlist.external_urls.spotify,
              images: playlist.images,
              tracks: playlistDetails.tracks.items.slice(0, 100).map(item => ({
                track_id: item.track?.id,
                track_name: item.track?.name,
                artist_name: item.track?.artists.map(a => a.name).join(', '),
                added_at: item.added_at
              }))
            });

            playlistCount++;
          }
        }

        hasMore = data.next !== null;
        offset += limit;

        // Limit to 20 playlists for initial version
        if (playlistCount >= 20) {
          hasMore = false;
        }

        await this.sleep(200); // Be nice to API
      }

      console.log(`[Spotify] Extracted ${playlistCount} playlists`);
      return playlistCount;
    } catch (error) {
      console.error('[Spotify] Error extracting playlists:', error);
      return playlistCount;
    }
  }

  /**
   * Extract saved tracks (liked songs)
   */
  async extractSavedTracks(userId) {
    console.log(`[Spotify] Extracting saved tracks...`);
    let trackCount = 0;

    try {
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore) {
        const data = await this.makeRequest('/me/tracks', {
          limit,
          offset
        });

        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            const track = item.track;

            await this.storeRawData(userId, 'spotify', 'saved_track', {
              track_id: track.id,
              track_name: track.name,
              artist_name: track.artists.map(a => a.name).join(', '),
              artist_ids: track.artists.map(a => a.id),
              album_name: track.album.name,
              album_id: track.album.id,
              duration_ms: track.duration_ms,
              popularity: track.popularity,
              added_at: item.added_at,
              url: track.external_urls.spotify
            });

            trackCount++;
          }
        }

        hasMore = data.next !== null;
        offset += limit;

        // Limit to 200 saved tracks for initial version
        if (trackCount >= 200) {
          hasMore = false;
        }

        await this.sleep(200);
      }

      console.log(`[Spotify] Extracted ${trackCount} saved tracks`);
      return trackCount;
    } catch (error) {
      console.error('[Spotify] Error extracting saved tracks:', error);
      return trackCount;
    }
  }

  /**
   * Helper: Sleep for rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Store raw data in database
   */
  async storeRawData(userId, platform, dataType, rawData) {
    try {
      const { error } = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          source_url: rawData.url,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[Spotify] Error storing data:', error);
      }
    } catch (error) {
      console.error('[Spotify] Exception storing data:', error);
    }
  }

  /**
   * Create extraction job
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabase
      .from('data_extraction_jobs')
      .insert({
        user_id: userId,
        connector_id: connectorId,
        platform: 'spotify',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Spotify] Error creating job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, totalItems) {
    await supabase
      .from('data_extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_items: totalItems,
        processed_items: totalItems,
        results: { message: 'Extraction completed successfully' }
      })
      .eq('id', jobId);
  }
}

export default SpotifyExtractor;
