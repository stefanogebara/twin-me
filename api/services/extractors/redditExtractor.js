/**
 * Reddit Data Extractor
 * Extracts posts, comments, subscribed subreddits, and interaction patterns
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class RedditExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://oauth.reddit.com';
  }

  /**
   * Main extraction method - extracts all Reddit data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Reddit] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractUserProfile(userId);
      totalItems += await this.extractSubredditSubscriptions(userId);
      totalItems += await this.extractUserPosts(userId);
      totalItems += await this.extractUserComments(userId);
      totalItems += await this.extractSavedPosts(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Reddit] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems, platform: 'reddit' };
    } catch (error) {
      console.error('[Reddit] Extraction error:', error);

      // If 401, throw to trigger reauth flow
      if (error.status === 401 || error.message?.includes('401')) {
        const authError = new Error('Reddit authentication failed');
        authError.status = 401;
        throw authError;
      }

      throw error;
    }
  }

  /**
   * Make authenticated request to Reddit API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'User-Agent': 'TwinMe-Soul-Signature/1.0'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      const apiError = new Error(`Reddit API error (${response.status}): ${error}`);
      apiError.status = response.status;
      throw apiError;
    }

    return response.json();
  }

  /**
   * Extract user profile information
   */
  async extractUserProfile(userId) {
    console.log(`[Reddit] Extracting user profile...`);

    try {
      const data = await this.makeRequest('/api/v1/me');

      // Get user preferences
      const prefs = await this.makeRequest('/api/v1/me/prefs');

      await this.storeRawData(userId, 'reddit', 'user_profile', {
        username: data.name,
        id: data.id,
        created_utc: data.created_utc,
        link_karma: data.link_karma,
        comment_karma: data.comment_karma,
        total_karma: data.total_karma,
        is_gold: data.is_gold,
        is_mod: data.is_mod,
        has_verified_email: data.has_verified_email,
        icon_img: data.icon_img,
        snoovatar_img: data.snoovatar_img,
        accept_followers: data.accept_followers,
        preferences: {
          show_presence: prefs.show_presence,
          enable_followers: prefs.enable_followers,
          show_trending: prefs.show_trending,
          lang: prefs.lang,
          country_code: prefs.country_code
        }
      });

      console.log(`[Reddit] Extracted user profile for u/${data.name}`);
      return 1;
    } catch (error) {
      console.error('[Reddit] Error extracting user profile:', error);
      return 0;
    }
  }

  /**
   * Extract subscribed subreddits (user's interests)
   */
  async extractSubredditSubscriptions(userId) {
    console.log(`[Reddit] Extracting subreddit subscriptions...`);
    let subCount = 0;

    try {
      let after = null;
      let hasMore = true;

      while (hasMore && subCount < 200) {
        const params = { limit: 100 };
        if (after) params.after = after;

        const data = await this.makeRequest('/subreddits/mine/subscriber', params);

        if (data.data && data.data.children && data.data.children.length > 0) {
          for (const child of data.data.children) {
            const sub = child.data;

            await this.storeRawData(userId, 'reddit', 'subreddit', {
              id: sub.id,
              name: sub.display_name,
              title: sub.title,
              description: sub.public_description,
              subscribers: sub.subscribers,
              created_utc: sub.created_utc,
              url: `https://reddit.com${sub.url}`,
              icon_img: sub.icon_img,
              banner_img: sub.banner_img,
              primary_color: sub.primary_color,
              key_color: sub.key_color,
              community_icon: sub.community_icon,
              over18: sub.over18,
              lang: sub.lang,
              subreddit_type: sub.subreddit_type
            });

            subCount++;
          }

          after = data.data.after;
          hasMore = after !== null;
        } else {
          hasMore = false;
        }

        await this.sleep(500); // Reddit rate limiting
      }

      console.log(`[Reddit] Extracted ${subCount} subreddit subscriptions`);
      return subCount;
    } catch (error) {
      console.error('[Reddit] Error extracting subreddits:', error);
      return subCount;
    }
  }

  /**
   * Extract user's submitted posts
   */
  async extractUserPosts(userId) {
    console.log(`[Reddit] Extracting user posts...`);
    let postCount = 0;

    try {
      let after = null;
      let hasMore = true;

      while (hasMore && postCount < 100) {
        const params = { limit: 100, sort: 'new', t: 'all' };
        if (after) params.after = after;

        const data = await this.makeRequest('/user/me/submitted', params);

        if (data.data && data.data.children && data.data.children.length > 0) {
          for (const child of data.data.children) {
            const post = child.data;

            await this.storeRawData(userId, 'reddit', 'post', {
              id: post.id,
              subreddit: post.subreddit,
              title: post.title,
              selftext: post.selftext,
              url: post.url,
              domain: post.domain,
              created_utc: post.created_utc,
              score: post.score,
              upvote_ratio: post.upvote_ratio,
              num_comments: post.num_comments,
              over_18: post.over_18,
              spoiler: post.spoiler,
              stickied: post.stickied,
              link_flair_text: post.link_flair_text,
              permalink: `https://reddit.com${post.permalink}`,
              is_self: post.is_self,
              is_video: post.is_video,
              thumbnail: post.thumbnail
            });

            postCount++;
          }

          after = data.data.after;
          hasMore = after !== null;
        } else {
          hasMore = false;
        }

        await this.sleep(500);
      }

      console.log(`[Reddit] Extracted ${postCount} posts`);
      return postCount;
    } catch (error) {
      console.error('[Reddit] Error extracting posts:', error);
      return postCount;
    }
  }

  /**
   * Extract user's comments (communication style)
   */
  async extractUserComments(userId) {
    console.log(`[Reddit] Extracting user comments...`);
    let commentCount = 0;

    try {
      let after = null;
      let hasMore = true;

      while (hasMore && commentCount < 200) {
        const params = { limit: 100, sort: 'new', t: 'all' };
        if (after) params.after = after;

        const data = await this.makeRequest('/user/me/comments', params);

        if (data.data && data.data.children && data.data.children.length > 0) {
          for (const child of data.data.children) {
            const comment = child.data;

            await this.storeRawData(userId, 'reddit', 'comment', {
              id: comment.id,
              subreddit: comment.subreddit,
              body: comment.body,
              created_utc: comment.created_utc,
              score: comment.score,
              controversiality: comment.controversiality,
              link_title: comment.link_title,
              link_url: comment.link_url,
              permalink: `https://reddit.com${comment.permalink}`,
              is_submitter: comment.is_submitter,
              stickied: comment.stickied,
              gilded: comment.gilded,
              distinguished: comment.distinguished
            });

            commentCount++;
          }

          after = data.data.after;
          hasMore = after !== null;
        } else {
          hasMore = false;
        }

        await this.sleep(500);
      }

      console.log(`[Reddit] Extracted ${commentCount} comments`);
      return commentCount;
    } catch (error) {
      console.error('[Reddit] Error extracting comments:', error);
      return commentCount;
    }
  }

  /**
   * Extract saved posts (bookmarked content)
   */
  async extractSavedPosts(userId) {
    console.log(`[Reddit] Extracting saved posts...`);
    let savedCount = 0;

    try {
      let after = null;
      let hasMore = true;

      while (hasMore && savedCount < 100) {
        const params = { limit: 100 };
        if (after) params.after = after;

        const data = await this.makeRequest('/user/me/saved', params);

        if (data.data && data.data.children && data.data.children.length > 0) {
          for (const child of data.data.children) {
            const item = child.data;

            await this.storeRawData(userId, 'reddit', 'saved_item', {
              id: item.id,
              kind: child.kind, // t1 = comment, t3 = post
              subreddit: item.subreddit,
              title: item.title || item.link_title,
              body: item.selftext || item.body,
              url: item.url,
              created_utc: item.created_utc,
              saved_at: item.saved,
              permalink: `https://reddit.com${item.permalink}`,
              score: item.score
            });

            savedCount++;
          }

          after = data.data.after;
          hasMore = after !== null;
        } else {
          hasMore = false;
        }

        await this.sleep(500);
      }

      console.log(`[Reddit] Extracted ${savedCount} saved items`);
      return savedCount;
    } catch (error) {
      console.error('[Reddit] Error extracting saved items:', error);
      return savedCount;
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
      const { error} = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          source_url: rawData.url || rawData.permalink || null,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[Reddit] Error storing data:', error);
      }
    } catch (error) {
      console.error('[Reddit] Exception storing data:', error);
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
        platform: 'reddit',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Reddit] Error creating job:', error);
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

export default RedditExtractor;
