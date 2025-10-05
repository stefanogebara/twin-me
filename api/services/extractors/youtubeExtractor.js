/**
 * YouTube Data Extractor
 * Extracts subscriptions, liked videos, playlists, and watch history
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class YouTubeExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  /**
   * Main extraction method - extracts all YouTube data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[YouTube] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractChannel(userId);
      totalItems += await this.extractSubscriptions(userId);
      totalItems += await this.extractLikedVideos(userId);
      totalItems += await this.extractPlaylists(userId);
      totalItems += await this.extractWatchHistory(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[YouTube] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems, platform: 'youtube' };
    } catch (error) {
      console.error('[YouTube] Extraction error:', error);

      // If 401, throw to trigger reauth flow
      if (error.status === 401 || error.message?.includes('401')) {
        const authError = new Error('YouTube authentication failed');
        authError.status = 401;
        throw authError;
      }

      throw error;
    }
  }

  /**
   * Make authenticated request to YouTube API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      const apiError = new Error(`YouTube API error (${response.status}): ${error}`);
      apiError.status = response.status;
      throw apiError;
    }

    return response.json();
  }

  /**
   * Extract user's channel information
   */
  async extractChannel(userId) {
    console.log(`[YouTube] Extracting channel info...`);

    try {
      const data = await this.makeRequest('/channels', {
        part: 'snippet,contentDetails,statistics',
        mine: 'true'
      });

      if (data.items && data.items.length > 0) {
        const channel = data.items[0];

        await this.storeRawData(userId, 'youtube', 'channel', {
          channel_id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          custom_url: channel.snippet.customUrl,
          published_at: channel.snippet.publishedAt,
          thumbnail: channel.snippet.thumbnails?.default?.url,
          country: channel.snippet.country,
          view_count: channel.statistics.viewCount,
          subscriber_count: channel.statistics.subscriberCount,
          video_count: channel.statistics.videoCount,
          uploads_playlist: channel.contentDetails.relatedPlaylists.uploads,
          likes_playlist: channel.contentDetails.relatedPlaylists.likes
        });

        console.log(`[YouTube] Extracted channel: ${channel.snippet.title}`);
        return 1;
      }

      return 0;
    } catch (error) {
      console.error('[YouTube] Error extracting channel:', error);
      return 0;
    }
  }

  /**
   * Extract user's subscriptions (what channels they follow)
   */
  async extractSubscriptions(userId) {
    console.log(`[YouTube] Extracting subscriptions...`);
    let subCount = 0;

    try {
      let pageToken = null;
      let hasMore = true;

      while (hasMore && subCount < 200) {
        const params = {
          part: 'snippet,contentDetails',
          mine: 'true',
          maxResults: 50
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await this.makeRequest('/subscriptions', params);

        if (data.items && data.items.length > 0) {
          for (const sub of data.items) {
            await this.storeRawData(userId, 'youtube', 'subscription', {
              subscription_id: sub.id,
              channel_id: sub.snippet.resourceId.channelId,
              channel_title: sub.snippet.title,
              channel_description: sub.snippet.description,
              published_at: sub.snippet.publishedAt,
              thumbnail: sub.snippet.thumbnails?.default?.url,
              total_item_count: sub.contentDetails.totalItemCount,
              new_item_count: sub.contentDetails.newItemCount
            });

            subCount++;
          }

          pageToken = data.nextPageToken;
          hasMore = pageToken !== undefined;
        } else {
          hasMore = false;
        }

        await this.sleep(200); // Rate limiting
      }

      console.log(`[YouTube] Extracted ${subCount} subscriptions`);
      return subCount;
    } catch (error) {
      console.error('[YouTube] Error extracting subscriptions:', error);
      return subCount;
    }
  }

  /**
   * Extract liked videos
   */
  async extractLikedVideos(userId) {
    console.log(`[YouTube] Extracting liked videos...`);
    let videoCount = 0;

    try {
      let pageToken = null;
      let hasMore = true;

      while (hasMore && videoCount < 200) {
        const params = {
          part: 'snippet,contentDetails',
          myRating: 'like',
          maxResults: 50
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await this.makeRequest('/videos', params);

        if (data.items && data.items.length > 0) {
          for (const video of data.items) {
            await this.storeRawData(userId, 'youtube', 'liked_video', {
              video_id: video.id,
              title: video.snippet.title,
              description: video.snippet.description,
              channel_title: video.snippet.channelTitle,
              channel_id: video.snippet.channelId,
              published_at: video.snippet.publishedAt,
              thumbnail: video.snippet.thumbnails?.default?.url,
              duration: video.contentDetails.duration,
              category_id: video.snippet.categoryId,
              tags: video.snippet.tags,
              url: `https://www.youtube.com/watch?v=${video.id}`
            });

            videoCount++;
          }

          pageToken = data.nextPageToken;
          hasMore = pageToken !== undefined;
        } else {
          hasMore = false;
        }

        await this.sleep(200);
      }

      console.log(`[YouTube] Extracted ${videoCount} liked videos`);
      return videoCount;
    } catch (error) {
      console.error('[YouTube] Error extracting liked videos:', error);
      return videoCount;
    }
  }

  /**
   * Extract user's playlists
   */
  async extractPlaylists(userId) {
    console.log(`[YouTube] Extracting playlists...`);
    let playlistCount = 0;

    try {
      let pageToken = null;
      let hasMore = true;

      while (hasMore && playlistCount < 50) {
        const params = {
          part: 'snippet,contentDetails',
          mine: 'true',
          maxResults: 50
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await this.makeRequest('/playlists', params);

        if (data.items && data.items.length > 0) {
          for (const playlist of data.items) {
            // Get playlist videos
            const videos = await this.getPlaylistVideos(playlist.id);

            await this.storeRawData(userId, 'youtube', 'playlist', {
              playlist_id: playlist.id,
              title: playlist.snippet.title,
              description: playlist.snippet.description,
              published_at: playlist.snippet.publishedAt,
              thumbnail: playlist.snippet.thumbnails?.default?.url,
              item_count: playlist.contentDetails.itemCount,
              videos: videos.slice(0, 20), // Limit to 20 videos per playlist
              channel_title: playlist.snippet.channelTitle,
              url: `https://www.youtube.com/playlist?list=${playlist.id}`
            });

            playlistCount++;
          }

          pageToken = data.nextPageToken;
          hasMore = pageToken !== undefined;
        } else {
          hasMore = false;
        }

        await this.sleep(200);
      }

      console.log(`[YouTube] Extracted ${playlistCount} playlists`);
      return playlistCount;
    } catch (error) {
      console.error('[YouTube] Error extracting playlists:', error);
      return playlistCount;
    }
  }

  /**
   * Get videos from a playlist
   */
  async getPlaylistVideos(playlistId) {
    const videos = [];

    try {
      let pageToken = null;
      let hasMore = true;
      let count = 0;

      while (hasMore && count < 20) {
        const params = {
          part: 'snippet',
          playlistId,
          maxResults: 20
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await this.makeRequest('/playlistItems', params);

        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            videos.push({
              video_id: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              channel_title: item.snippet.channelTitle,
              published_at: item.snippet.publishedAt
            });
            count++;
          }

          pageToken = data.nextPageToken;
          hasMore = pageToken !== undefined && count < 20;
        } else {
          hasMore = false;
        }

        await this.sleep(100);
      }
    } catch (error) {
      console.error(`[YouTube] Error fetching playlist videos for ${playlistId}:`, error);
    }

    return videos;
  }

  /**
   * Extract watch history (requires YouTube History enabled)
   */
  async extractWatchHistory(userId) {
    console.log(`[YouTube] Extracting watch history...`);
    let videoCount = 0;

    try {
      // Note: Watch history may not be available via API
      // This attempts to get the user's "History" playlist if accessible
      const data = await this.makeRequest('/channels', {
        part: 'contentDetails',
        mine: 'true'
      });

      if (data.items && data.items.length > 0) {
        const historyPlaylistId = data.items[0].contentDetails?.relatedPlaylists?.watchHistory;

        if (historyPlaylistId) {
          let pageToken = null;
          let hasMore = true;

          while (hasMore && videoCount < 100) {
            const params = {
              part: 'snippet,contentDetails',
              playlistId: historyPlaylistId,
              maxResults: 50
            };
            if (pageToken) params.pageToken = pageToken;

            const historyData = await this.makeRequest('/playlistItems', params);

            if (historyData.items && historyData.items.length > 0) {
              for (const item of historyData.items) {
                await this.storeRawData(userId, 'youtube', 'watch_history', {
                  video_id: item.snippet.resourceId.videoId,
                  title: item.snippet.title,
                  channel_title: item.snippet.channelTitle,
                  channel_id: item.snippet.channelId,
                  published_at: item.snippet.publishedAt,
                  watched_at: item.contentDetails?.videoPublishedAt,
                  thumbnail: item.snippet.thumbnails?.default?.url,
                  url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
                });

                videoCount++;
              }

              pageToken = historyData.nextPageToken;
              hasMore = pageToken !== undefined;
            } else {
              hasMore = false;
            }

            await this.sleep(200);
          }
        } else {
          console.log(`[YouTube] Watch history not available via API`);
        }
      }

      console.log(`[YouTube] Extracted ${videoCount} watch history items`);
      return videoCount;
    } catch (error) {
      console.error('[YouTube] Error extracting watch history:', error);
      return videoCount;
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
        .insert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          source_url: rawData.url || null,
          extracted_at: new Date().toISOString(),
          processed: false
        });

      if (error) {
        console.error('[YouTube] Error storing data:', error);
      }
    } catch (error) {
      console.error('[YouTube] Exception storing data:', error);
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
        platform: 'youtube',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[YouTube] Error creating job:', error);
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

export default YouTubeExtractor;
