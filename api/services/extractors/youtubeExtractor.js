/**
 * YouTube Data Extractor
 * Extracts subscriptions, liked videos, playlists, and watch history
 */

import { createClient } from '@supabase/supabase-js';
import { ensureFreshToken } from '../tokenRefreshService.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class YouTubeExtractor {
  constructor(userId, platform = 'youtube') {
    this.userId = userId;
    this.platform = platform;
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

      // Analyze curiosity profile from extracted data
      let analysis = null;
      try {
        console.log(`[YouTube] Analyzing curiosity profile...`);
        analysis = await this.analyzeCuriosityProfile(userId);
        console.log(`[YouTube] Curiosity profile analysis complete`);
      } catch (analysisError) {
        console.error('[YouTube] Error analyzing curiosity profile:', analysisError);
        // Don't fail the extraction if analysis fails
      }

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[YouTube] Extraction complete. Total items: ${totalItems}`);
      return {
        success: true,
        itemsExtracted: totalItems,
        platform: 'youtube',
        analysis: analysis
      };
    } catch (error) {
      console.error('[YouTube] Extraction error:', error);

      // If 401, throw to trigger reauth flow
      if (error.status === 401 || error.message?.includes('401')) {
        const authError = new Error('YouTube authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }

      throw error;
    }
  }

  /**
   * Make authenticated request to YouTube API with automatic token refresh
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
          'Accept': 'application/json'
        }
      });

      // Handle 401 with retry (token might have expired during long extraction)
      if (response.status === 401 && retryCount < 2) {
        console.log(`[YouTube] 401 error, retrying with fresh token (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return this.makeRequest(endpoint, params, retryCount + 1);
      }

      if (!response.ok) {
        const error = await response.text();
        const apiError = new Error(`YouTube API error (${response.status}): ${error}`);
        apiError.status = response.status;
        throw apiError;
      }

      return response.json();
    } catch (error) {
      if (error.message.includes('Token refresh failed') || error.message.includes('Not authenticated')) {
        console.error('[YouTube] Token refresh failed - marking connection as needs_reauth');
        const authError = new Error('YouTube authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }
      throw error;
    }
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

      console.log(`[YouTube] Channel API response:`, JSON.stringify(data, null, 2));

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

      console.log(`[YouTube] No channel found - data.items is empty or missing`);
      return 0;
    } catch (error) {
      console.error('[YouTube] Error extracting channel:', error.message);
      console.error('[YouTube] Full error:', error);
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
        console.log(`[YouTube] Subscriptions API response (page ${subCount/50 + 1}):`, JSON.stringify(data, null, 2).substring(0, 500));

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
   * Store raw data in database using UPSERT to prevent duplicates
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
          source_url: rawData.url || null,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
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
    const supabase = getSupabaseClient();
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

  /**
   * Analyze curiosity profile from extracted data
   * This generates insights about learning interests, curiosity patterns, and content preferences
   */
  async analyzeCuriosityProfile(userId) {
    console.log(`[YouTube] Analyzing curiosity profile for user ${userId}`);

    try {
      const supabase = getSupabaseClient();

      // Fetch all YouTube data from database
      const { data: allData } = await supabase
        .from('user_platform_data')
        .select('data_type, raw_data')
        .eq('user_id', userId)
        .eq('platform', 'youtube');

      if (!allData || allData.length === 0) {
        console.warn('[YouTube] No data found for analysis');
        return null;
      }

      // Organize data by type
      const subscriptions = allData
        .filter(d => d.data_type === 'subscription')
        .map(d => d.raw_data);

      const likedVideos = allData
        .filter(d => d.data_type === 'liked_video')
        .map(d => d.raw_data);

      const playlists = allData
        .filter(d => d.data_type === 'playlist')
        .map(d => d.raw_data);

      const watchHistory = allData
        .filter(d => d.data_type === 'watch_history')
        .map(d => d.raw_data);

      // Extract content categories
      const categories = this.extractContentCategories(likedVideos);

      // Calculate learning vs entertainment ratio
      const learningRatio = this.calculateLearningRatio(likedVideos, subscriptions);

      // Analyze channel types
      const channelTypes = this.analyzeChannelTypes(subscriptions);

      // Extract topics of interest
      const topics = this.extractTopics(likedVideos, subscriptions);

      // Calculate curiosity metrics
      const curiosityMetrics = this.calculateCuriosityMetrics(
        categories,
        topics,
        subscriptions.length,
        likedVideos.length
      );

      const analysis = {
        contentCategories: categories,
        learningVsEntertainment: learningRatio,
        channelTypes,
        topicsOfInterest: topics.slice(0, 15),
        curiosityProfile: curiosityMetrics,
        subscriptionCount: subscriptions.length,
        likedVideoCount: likedVideos.length,
        playlistCount: playlists.length,
        watchHistoryCount: watchHistory.length,
        summary: this.generateSummary(curiosityMetrics, learningRatio, topics)
      };

      // Store analysis results
      await this.storeRawData(userId, 'youtube', 'soul_analysis', analysis);

      console.log(`✅ [YouTube] Curiosity profile analysis complete for user ${userId}`);
      return analysis;

    } catch (error) {
      console.error('[YouTube] Error analyzing curiosity profile:', error);
      throw error;
    }
  }

  /**
   * Extract content categories from videos
   */
  extractContentCategories(videos) {
    const categoryMap = {
      '1': 'Film & Animation',
      '2': 'Autos & Vehicles',
      '10': 'Music',
      '15': 'Pets & Animals',
      '17': 'Sports',
      '19': 'Travel & Events',
      '20': 'Gaming',
      '22': 'People & Blogs',
      '23': 'Comedy',
      '24': 'Entertainment',
      '25': 'News & Politics',
      '26': 'Howto & Style',
      '27': 'Education',
      '28': 'Science & Technology',
      '29': 'Nonprofits & Activism'
    };

    const categoryCounts = {};

    videos.forEach(video => {
      const categoryId = video.category_id;
      const categoryName = categoryMap[categoryId] || 'Other';
      categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
    });

    return Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));
  }

  /**
   * Calculate learning vs entertainment ratio
   */
  calculateLearningRatio(videos, subscriptions) {
    const learningKeywords = [
      'tutorial', 'how to', 'explained', 'guide', 'learn', 'course',
      'education', 'lesson', 'teach', 'academy', 'university', 'school',
      'programming', 'coding', 'tech', 'science', 'math'
    ];

    const educationalVideos = videos.filter(video => {
      const title = (video.title || '').toLowerCase();
      const channelTitle = (video.channel_title || '').toLowerCase();
      return learningKeywords.some(keyword =>
        title.includes(keyword) || channelTitle.includes(keyword)
      );
    }).length;

    const educationalChannels = subscriptions.filter(sub => {
      const title = (sub.channel_title || '').toLowerCase();
      const description = (sub.channel_description || '').toLowerCase();
      return learningKeywords.some(keyword =>
        title.includes(keyword) || description.includes(keyword)
      );
    }).length;

    const totalVideos = videos.length || 1;
    const totalChannels = subscriptions.length || 1;

    const videoRatio = educationalVideos / totalVideos;
    const channelRatio = educationalChannels / totalChannels;
    const avgRatio = (videoRatio + channelRatio) / 2;

    return {
      learningScore: Number((avgRatio * 100).toFixed(1)),
      educationalVideos,
      educationalChannels,
      level: avgRatio > 0.6 ? 'Active Learner' :
             avgRatio > 0.3 ? 'Balanced Explorer' :
             'Entertainment Focused'
    };
  }

  /**
   * Analyze channel types from subscriptions
   */
  analyzeChannelTypes(subscriptions) {
    const types = {
      educational: 0,
      entertainment: 0,
      gaming: 0,
      music: 0,
      news: 0,
      tech: 0,
      lifestyle: 0,
      other: 0
    };

    const patterns = {
      educational: ['academy', 'university', 'school', 'learn', 'education', 'tutorial', 'course'],
      gaming: ['gaming', 'game', 'gamer', 'gameplay', 'esports', 'playthrough', 'let\'s play'],
      music: ['music', 'vevo', 'records', 'official', 'artist', 'band'],
      news: ['news', 'today', 'daily', 'breaking', 'report', 'journalism'],
      tech: ['tech', 'technology', 'review', 'unbox', 'gadget', 'device', 'programming'],
      lifestyle: ['vlog', 'lifestyle', 'daily', 'life', 'family', 'cooking', 'fitness']
    };

    subscriptions.forEach(sub => {
      const title = (sub.channel_title || '').toLowerCase();
      const description = (sub.channel_description || '').toLowerCase();
      const text = `${title} ${description}`;

      let categorized = false;
      for (const [type, keywords] of Object.entries(patterns)) {
        if (keywords.some(keyword => text.includes(keyword))) {
          types[type]++;
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        types.entertainment++;
      }
    });

    return types;
  }

  /**
   * Extract topics of interest from titles and descriptions
   */
  extractTopics(videos, subscriptions) {
    const topicCounts = {};
    const commonWords = new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'about', 'how', 'what',
      'when', 'where', 'why', 'are', 'was', 'were', 'been', 'have', 'has', 'had',
      'will', 'would', 'could', 'should', 'your', 'their', 'them', 'they', 'into'
    ]);

    const texts = [
      ...videos.map(v => `${v.title || ''} ${v.description || ''}`),
      ...subscriptions.map(s => `${s.channel_title || ''} ${s.channel_description || ''}`)
    ];

    texts.forEach(text => {
      if (!text) return;
      const words = text.toLowerCase()
        .match(/\b[a-z]{4,}\b/g) || [];

      words.forEach(word => {
        if (!commonWords.has(word)) {
          topicCounts[word] = (topicCounts[word] || 0) + 1;
        }
      });
    });

    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([topic, count]) => ({ topic, count }));
  }

  /**
   * Calculate curiosity metrics based on content diversity and engagement
   */
  calculateCuriosityMetrics(categories, topics, subscriptionCount, likedCount) {
    // Breadth: number of different categories (max 10)
    const breadth = categories.length;

    // Depth: average engagement per category
    const avgEngagementPerCategory = likedCount / Math.max(breadth, 1);
    const depth = avgEngagementPerCategory > 20 ? 'deep' :
                  avgEngagementPerCategory > 10 ? 'balanced' : 'broad';

    // Curiosity score (0-10)
    const curiosityScore = Math.min(10, Math.round(
      (breadth / 3) + (topics.length / 5) + (subscriptionCount / 20)
    ));

    return {
      breadth,
      depth,
      curiosityScore,
      explorationLevel: breadth > 7 ? 'high' : breadth > 4 ? 'moderate' : 'focused',
      engagementStyle: depth === 'deep' ? 'Deep Diver' :
                       depth === 'balanced' ? 'Balanced Explorer' :
                       'Wide Wanderer'
    };
  }

  /**
   * Generate human-readable summary of curiosity profile
   */
  generateSummary(curiosityMetrics, learningRatio, topics) {
    const topTopic = topics[0]?.topic || 'diverse interests';
    const learningLevel = learningRatio.level;
    const curiosityType = curiosityMetrics.engagementStyle;

    return `${curiosityType} with ${learningLevel.toLowerCase()} tendencies, passionate about ${topTopic}`;
  }
}

// Helper to get Supabase client singleton
function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default YouTubeExtractor;
