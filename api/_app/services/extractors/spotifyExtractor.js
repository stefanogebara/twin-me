/**
 * Spotify Data Extractor
 * Extracts listening history, playlists, top artists, top tracks, and audio features
 */

// Node.js 18+ has built-in fetch, no need for node-fetch
import { supabaseAdmin } from '../database.js';
import { ensureFreshToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';

const log = createLogger('SpotifyExtractor');

class SpotifyExtractor {
  constructor(userId, platform = 'spotify') {
    this.userId = userId;
    this.platform = platform;
    this.baseUrl = 'https://api.spotify.com/v1';
  }

  /**
   * Main extraction method - extracts all Spotify data for a user
   */
  async extractAll(userId, connectorId) {
    log.info(`Starting full extraction for user: ${userId}`);

    let job = null;
    try {
      // Create extraction job
      job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractRecentlyPlayed(userId);
      totalItems += await this.extractTopTracks(userId);
      totalItems += await this.extractTopArtists(userId);
      totalItems += await this.extractPlaylists(userId);
      totalItems += await this.extractSavedTracks(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      log.info(`Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      log.error('Extraction error:', error);

      // Mark the job as failed if it was created
      if (job && job.id) {
        await this.failExtractionJob(job.id, error.message || 'Unknown error occurred');
      }

      throw error;
    }
  }

  /**
   * Make authenticated request to Spotify API with automatic token refresh
   */
  async makeRequest(endpoint, params = {}, retryCount = 0) {
    try {
      // Get fresh access token (automatically refreshes if needed)
      const accessToken = await ensureFreshToken(this.userId, this.platform);

      const url = new URL(`${this.baseUrl}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Handle 401 with retry (token might have expired during long extraction)
      if (response.status === 401 && retryCount < 2) {
        log.info(`401 error, retrying with fresh token (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return this.makeRequest(endpoint, params, retryCount + 1);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Spotify API error (${response.status}): ${error}`);
      }

      return response.json();
    } catch (error) {
      if (error.message.includes('Token refresh failed') || error.message.includes('Not authenticated')) {
        log.error('Token refresh failed - marking connection as needs_reauth');
        const authError = new Error('Spotify authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }
      throw error;
    }
  }

  /**
   * Extract recently played tracks (last 50 tracks)
   */
  async extractRecentlyPlayed(userId) {
    log.info(`Extracting recently played tracks...`);
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

      log.info(`Extracted ${trackCount} recently played tracks`);
      return trackCount;
    } catch (error) {
      log.error('Error extracting recently played:', error);
      return trackCount;
    }
  }

  /**
   * Extract top tracks (short, medium, and long term)
   */
  async extractTopTracks(userId) {
    log.info(`Extracting top tracks...`);
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

      log.info(`Extracted ${trackCount} top tracks`);
      return trackCount;
    } catch (error) {
      log.error('Error extracting top tracks:', error);
      return trackCount;
    }
  }

  /**
   * Extract top artists (short, medium, and long term)
   */
  async extractTopArtists(userId) {
    log.info(`Extracting top artists...`);
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

      log.info(`Extracted ${artistCount} top artists`);
      return artistCount;
    } catch (error) {
      log.error('Error extracting top artists:', error);
      return artistCount;
    }
  }

  /**
   * Extract user's playlists
   */
  async extractPlaylists(userId) {
    log.info(`Extracting playlists...`);
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

      log.info(`Extracted ${playlistCount} playlists`);
      return playlistCount;
    } catch (error) {
      log.error('Error extracting playlists:', error);
      return playlistCount;
    }
  }

  /**
   * Extract saved tracks (liked songs)
   */
  async extractSavedTracks(userId) {
    log.info(`Extracting saved tracks...`);
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

      log.info(`Extracted ${trackCount} saved tracks`);
      return trackCount;
    } catch (error) {
      log.error('Error extracting saved tracks:', error);
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
      const { error } = await supabaseAdmin
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
        log.error('Error storing data:', error);
      }
    } catch (error) {
      log.error('Exception storing data:', error);
    }
  }

  /**
   * Create extraction job
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabaseAdmin
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
      log.error('Error creating job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, totalItems) {
    const { error: updateErr } = await supabaseAdmin
      .from('data_extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_items: totalItems,
        processed_items: totalItems,
        results: { message: 'Extraction completed successfully' }
      })
      .eq('id', jobId);
    if (updateErr) log.warn('Error completing extraction job:', updateErr.message);
  }

  /**
   * Mark extraction job as failed
   */
  async failExtractionJob(jobId, errorMessage) {
    const { error: failErr } = await supabaseAdmin
      .from('data_extraction_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage
      })
      .eq('id', jobId);
    if (failErr) log.warn('Error marking job as failed:', failErr.message);
  }
}

export default SpotifyExtractor;
