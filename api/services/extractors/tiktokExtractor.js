/**
 * TikTok Data Extractor
 * Extracts user profile, videos, and trend participation using TikTok Display API v2
 */

import { createClient } from '@supabase/supabase-js';
import { ensureFreshToken } from '../tokenRefreshService.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class TikTokExtractor {
  constructor(userId, platform = 'tiktok') {
    this.userId = userId;
    this.platform = platform;
    this.baseUrl = 'https://open.tiktokapis.com/v2';
  }

  /**
   * Main extraction method - extracts all TikTok data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[TikTok] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractUserInfo(userId);
      totalItems += await this.extractUserVideos(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[TikTok] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[TikTok] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to TikTok Display API
   * Automatically handles token refresh on 401 errors
   */
  async makeRequest(endpoint, params = {}, method = 'GET', retries = 2) {
    // Get fresh access token
    const freshToken = await ensureFreshToken(this.userId, this.platform);

    if (!freshToken) {
      throw new Error('[TikTok] No valid access token available');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${freshToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (method === 'POST') {
      options.body = JSON.stringify(params);
    } else {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    try {
      const response = await fetch(url, options);

      // Handle 401 - token expired, retry once with fresh token
      if (response.status === 401 && retries > 0) {
        console.log('[TikTok] Token expired, fetching fresh token and retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return this.makeRequest(endpoint, params, method, retries - 1);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TikTok API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      // Check for API error in response
      if (data.error?.code) {
        throw new Error(`TikTok API error: ${data.error.code} - ${data.error.message}`);
      }

      return data;
    } catch (error) {
      console.error(`[TikTok] Request error for ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Extract user profile information
   */
  async extractUserInfo(userId) {
    console.log(`[TikTok] Extracting user info...`);

    try {
      // Get user profile info
      const data = await this.makeRequest('/user/info/', {
        fields: 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count'
      }, 'POST');

      if (data.data?.user) {
        const user = data.data.user;

        await this.storeRawData(userId, 'tiktok', 'user_info', {
          open_id: user.open_id,
          union_id: user.union_id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          bio_description: user.bio_description,
          is_verified: user.is_verified,
          follower_count: user.follower_count,
          following_count: user.following_count,
          likes_count: user.likes_count,
          video_count: user.video_count,
          profile_deep_link: user.profile_deep_link,
          extracted_at: new Date().toISOString()
        }, user.profile_deep_link);

        console.log(`[TikTok] Extracted user info for ${user.display_name}`);
        return 1;
      }

      return 0;
    } catch (error) {
      console.error('[TikTok] Error extracting user info:', error);
      return 0;
    }
  }

  /**
   * Extract user's videos
   */
  async extractUserVideos(userId) {
    console.log(`[TikTok] Extracting user videos...`);

    try {
      let totalVideos = 0;
      let cursor = null;
      let hasMore = true;

      // TikTok API supports pagination with cursor
      while (hasMore) {
        const params = {
          fields: 'id,create_time,cover_image_url,share_url,video_description,duration,height,width,title,embed_html,embed_link,like_count,comment_count,share_count,view_count'
        };

        if (cursor) {
          params.cursor = cursor;
        }

        params.max_count = 20; // Max allowed per request

        const data = await this.makeRequest('/video/list/', params, 'POST');

        if (data.data?.videos && data.data.videos.length > 0) {
          // Store each video
          for (const video of data.data.videos) {
            await this.storeRawData(userId, 'tiktok', 'video', {
              video_id: video.id,
              title: video.title,
              description: video.video_description,
              cover_image_url: video.cover_image_url,
              share_url: video.share_url,
              embed_link: video.embed_link,
              duration: video.duration,
              height: video.height,
              width: video.width,
              like_count: video.like_count,
              comment_count: video.comment_count,
              share_count: video.share_count,
              view_count: video.view_count,
              created_at: new Date(video.create_time * 1000).toISOString(),
              extracted_at: new Date().toISOString()
            }, video.share_url);

            totalVideos++;
          }
        }

        // Check for pagination
        hasMore = data.data?.has_more || false;
        cursor = data.data?.cursor || null;

        // Safety limit to prevent infinite loops
        if (totalVideos >= 200) {
          console.log('[TikTok] Reached 200 videos limit, stopping pagination');
          break;
        }
      }

      console.log(`[TikTok] Extracted ${totalVideos} videos`);
      return totalVideos;
    } catch (error) {
      console.error('[TikTok] Error extracting videos:', error);
      return 0;
    }
  }

  /**
   * Store raw data from TikTok in Supabase
   */
  async storeRawData(userId, platform, dataType, data, sourceUrl = null) {
    try {
      const { error } = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: data,
          source_url: sourceUrl,
          extraction_status: 'completed',
          extracted_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,platform,data_type,source_url'
        });

      if (error) {
        console.error(`[TikTok] Error storing ${dataType} data:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`[TikTok] Error in storeRawData:`, error);
      throw error;
    }
  }

  /**
   * Create extraction job record
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabase
      .from('extraction_jobs')
      .insert({
        user_id: userId,
        connector_id: connectorId,
        platform: 'tiktok',
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[TikTok] Error creating extraction job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, itemsExtracted) {
    const { error } = await supabase
      .from('extraction_jobs')
      .update({
        status: 'completed',
        items_extracted: itemsExtracted,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      console.error('[TikTok] Error completing extraction job:', error);
      throw error;
    }
  }
}

export default TikTokExtractor;
