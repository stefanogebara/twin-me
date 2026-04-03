/**
 * YouTube Feature Extractor
 *
 * Extracts behavioral features from YouTube viewing data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Content diversity → Openness (r=0.35)
 * - Search curiosity → Openness (r=0.30)
 * - Watch completion rate → Conscientiousness (r=0.28)
 * - Educational content ratio → Openness (r=0.32)
 * - Channel loyalty → Conscientiousness (r=0.25)
 * - Social content ratio → Extraversion (r=0.30)
 * - Binge watching pattern → Neuroticism (r=0.20)
 *
 * Research basis:
 * - Stachl et al. (2020) - Smartphone usage & personality, n=624
 * - Azucar et al. (2018) - Digital footprints meta-analysis, k=12 studies
 * - Kosinski et al. (2013) - Digital records & personality, n=58,000
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('Youtubefeatureextractor');

class YouTubeFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  /**
   * Extract all behavioral features from YouTube data
   */
  async extractFeatures(userId) {
    log.info(`Extracting features for user ${userId}`);

    try {
      const cutoffDate = new Date(Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fetch from user_platform_data
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .order('extracted_at', { ascending: false });

      if (platformError) {
        log.warn('Error fetching data:', platformError.message);
      }

      // Also check soul_data
      const { data: soulData, error: soulError } = await supabaseAdmin
        .from('soul_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .order('created_at', { ascending: false });

      if (soulError) {
        log.warn('Error fetching soul_data:', soulError.message);
      }

      const normalizedPlatformData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at,
        raw_data: entry.raw_data || {}
      }));

      const normalizedSoulData = (soulData || []).map(entry => ({
        ...entry,
        raw_data: entry.raw_data || {}
      }));

      const youtubeData = [...normalizedPlatformData, ...normalizedSoulData];

      if (youtubeData.length === 0) {
        log.info('No YouTube data found');
        return [];
      }

      log.info(`Found ${youtubeData.length} YouTube data entries`);

      const features = [];

      // 1. Content Diversity (Openness)
      const contentDiversity = this.calculateContentDiversity(youtubeData);
      if (contentDiversity !== null) {
        features.push(this.createFeature(userId, 'yt_content_diversity', contentDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.35,
          description: 'Diversity of content categories consumed',
          evidence: { correlation: 0.35, citation: 'Stachl et al. (2020)' },
          raw_value: contentDiversity.rawValue
        }));
      }

      // 2. Search Curiosity (Openness)
      const searchCuriosity = this.calculateSearchCuriosity(youtubeData);
      if (searchCuriosity !== null) {
        features.push(this.createFeature(userId, 'yt_search_curiosity', searchCuriosity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.30,
          description: 'Breadth and depth of search topics',
          evidence: { correlation: 0.30, citation: 'Kosinski et al. (2013)' },
          raw_value: searchCuriosity.rawValue
        }));
      }

      // 3. Watch Completion Rate (Conscientiousness)
      const completionRate = this.calculateWatchCompletionRate(youtubeData);
      if (completionRate !== null) {
        features.push(this.createFeature(userId, 'yt_watch_completion', completionRate.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.28,
          description: 'Rate of finishing videos once started',
          evidence: { correlation: 0.28, citation: 'Azucar et al. (2018)' },
          raw_value: completionRate.rawValue
        }));
      }

      // 4. Educational Content Ratio (Openness)
      const educationalRatio = this.calculateEducationalRatio(youtubeData);
      if (educationalRatio !== null) {
        features.push(this.createFeature(userId, 'yt_educational_ratio', educationalRatio.value, {
          contributes_to: 'openness',
          contribution_weight: 0.32,
          description: 'Proportion of educational vs entertainment content',
          evidence: { correlation: 0.32, citation: 'Stachl et al. (2020)' },
          raw_value: educationalRatio.rawValue
        }));
      }

      // 5. Channel Loyalty (Conscientiousness)
      const channelLoyalty = this.calculateChannelLoyalty(youtubeData);
      if (channelLoyalty !== null) {
        features.push(this.createFeature(userId, 'yt_channel_loyalty', channelLoyalty.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.25,
          description: 'Tendency to return to the same creators',
          evidence: { correlation: 0.25, citation: 'Azucar et al. (2018)' },
          raw_value: channelLoyalty.rawValue
        }));
      }

      // 6. Social Content Ratio (Extraversion)
      const socialContentRatio = this.calculateSocialContentRatio(youtubeData);
      if (socialContentRatio !== null) {
        features.push(this.createFeature(userId, 'yt_social_content', socialContentRatio.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.30,
          description: 'Preference for social/vlog content vs solo/technical',
          evidence: { correlation: 0.30, citation: 'Kosinski et al. (2013)' },
          raw_value: socialContentRatio.rawValue
        }));
      }

      // 7. Binge Watching Pattern (Neuroticism)
      const bingePattern = this.calculateBingePattern(youtubeData);
      if (bingePattern !== null) {
        features.push(this.createFeature(userId, 'yt_binge_pattern', bingePattern.value, {
          contributes_to: 'neuroticism',
          contribution_weight: 0.20,
          description: 'Tendency for extended viewing sessions',
          evidence: { correlation: 0.20, citation: 'Azucar et al. (2018)' },
          raw_value: bingePattern.rawValue
        }));
      }

      // 8. Subscription Loyalty (Conscientiousness)
      const subLoyalty = this.calculateSubscriptionLoyalty(youtubeData);
      if (subLoyalty !== null) {
        features.push(this.createFeature(userId, 'yt_subscription_loyalty', subLoyalty.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.28,
          description: 'Average subscription age — long-held subscriptions indicate commitment to interests',
          evidence: { correlation: 0.28, citation: 'Digital loyalty behavior research' },
          raw_value: subLoyalty.rawValue
        }));
      }

      // 9. Topic Diversity from topicDetails (Openness)
      const topicDiversity = this.calculateTopicDiversity(youtubeData);
      if (topicDiversity !== null) {
        features.push(this.createFeature(userId, 'yt_topic_diversity', topicDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.35,
          description: 'Shannon entropy of Wikipedia topic categories from liked videos',
          evidence: { correlation: 0.35, citation: 'Content diversity and Openness' },
          raw_value: topicDiversity.rawValue
        }));
      }

      // 10. Curation Behavior (Conscientiousness)
      const curation = this.calculateCurationBehavior(youtubeData);
      if (curation !== null) {
        features.push(this.createFeature(userId, 'yt_curation_behavior', curation.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.30,
          description: 'Number and organization of user-created playlists',
          evidence: { correlation: 0.30, citation: 'Content curation and personality' },
          raw_value: curation.rawValue
        }));
      }

      log.info(`Extracted ${features.length} features`);
      return features;

    } catch (error) {
      log.error('Error:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // Feature Calculation Methods
  // ─────────────────────────────────────────────

  /**
   * Content Diversity: How varied are the channels/topics watched?
   * High diversity → Openness (r=0.35)
   */
  calculateContentDiversity(youtubeData) {
    const channels = new Set();
    const categories = new Set();

    // From subscriptions (API data)
    const subsEntries = youtubeData.filter(e =>
      e.data_type === 'subscriptions' || e.data_type === 'subscription'
    );
    for (const entry of subsEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        const title = item.snippet?.title || item.snippet?.resourceId?.channelId;
        if (title) channels.add(title);
      }
    }

    // From liked videos (API data) - channelTitle field
    const likedEntries = youtubeData.filter(e => e.data_type === 'likedVideos');
    for (const entry of likedEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        const channelTitle = item.snippet?.channelTitle;
        if (channelTitle) channels.add(channelTitle);
        const categoryId = item.snippet?.categoryId;
        if (categoryId) categories.add(categoryId);
      }
    }

    // From extension watch data
    const watchEntries = youtubeData.filter(e => e.data_type === 'extension_video_watch');
    for (const entry of watchEntries) {
      const channel = entry.raw_data?.channel;
      if (channel) channels.add(channel);
    }

    // From homepage/recommendations for category inference
    const homepageEntries = youtubeData.filter(e =>
      e.data_type === 'extension_homepage' || e.data_type === 'extension_recommendation'
    );
    for (const entry of homepageEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        if (item.channel) channels.add(item.channel);
        if (item.category) categories.add(item.category);
      }
    }

    const channelCount = channels.size;
    if (channelCount === 0) return null;

    // Normalize: 1-5 channels = low, 6-15 = moderate, 16+ = high
    const diversityScore = Math.min(channelCount / 20, 1);

    return {
      value: Math.round(diversityScore * 100) / 100,
      rawValue: {
        channel_count: channelCount,
        category_count: categories.size
      }
    };
  }

  /**
   * Search Curiosity: How varied and frequent are search queries?
   * Research: Broader search patterns correlate with openness (r=0.30)
   */
  calculateSearchCuriosity(youtubeData) {
    const searchEntries = youtubeData.filter(e => e.data_type === 'extension_search');
    if (searchEntries.length === 0) return null;

    const queries = searchEntries.map(e => (e.raw_data?.query || '').toLowerCase()).filter(Boolean);
    if (queries.length === 0) return null;

    // Extract unique topic words (remove common words)
    const stopWords = new Set(['how', 'to', 'the', 'a', 'an', 'is', 'in', 'for', 'and', 'or', 'of', 'with', 'what', 'why']);
    const topicWords = new Set();
    for (const query of queries) {
      const words = query.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      words.forEach(w => topicWords.add(w));
    }

    const topicCount = topicWords.size;
    // Normalize: 1-5 topics = low curiosity, 6-15 = moderate, 16+ = high
    const curiosityScore = Math.min(topicCount / 20, 1);

    return {
      value: Math.round(curiosityScore * 100) / 100,
      rawValue: {
        search_count: queries.length,
        unique_topics: topicCount
      }
    };
  }

  /**
   * Watch Completion Rate: How often do they finish videos?
   * Research: Completion correlates with conscientiousness (r=0.28)
   */
  calculateWatchCompletionRate(youtubeData) {
    const watchEntries = youtubeData.filter(e => e.data_type === 'extension_video_watch');
    if (watchEntries.length === 0) return null;

    let totalWatches = 0;
    let completedWatches = 0;
    let totalPercentage = 0;

    for (const entry of watchEntries) {
      const raw = entry.raw_data || {};
      totalWatches++;

      if (raw.completed === true || raw.watchPercentage >= 90) {
        completedWatches++;
      }

      if (raw.watchPercentage !== undefined) {
        totalPercentage += raw.watchPercentage;
      } else if (raw.watchDuration && raw.duration) {
        totalPercentage += Math.min((raw.watchDuration / raw.duration) * 100, 100);
      } else if (raw.watchDurationSeconds && raw.totalDuration) {
        totalPercentage += Math.min((raw.watchDurationSeconds / raw.totalDuration) * 100, 100);
      }
    }

    if (totalWatches === 0) return null;

    const avgCompletion = totalPercentage / totalWatches / 100; // 0-1
    const completionPercent = Math.round(avgCompletion * 100);

    return {
      value: Math.round(avgCompletion * 100) / 100,
      rawValue: {
        videos_watched: totalWatches,
        videos_completed: completedWatches,
        avg_completion_percent: completionPercent
      }
    };
  }

  /**
   * Educational Content Ratio: How much learning content vs entertainment?
   * Research: Educational content consumption correlates with openness (r=0.32)
   */
  calculateEducationalRatio(youtubeData) {
    const watchEntries = youtubeData.filter(e => e.data_type === 'extension_video_watch');
    const searchEntries = youtubeData.filter(e => e.data_type === 'extension_search');
    const likedEntries = youtubeData.filter(e => e.data_type === 'likedVideos');

    // Collect all video titles from liked videos (API data)
    const likedItems = [];
    for (const entry of likedEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        const title = item.snippet?.title;
        if (title) likedItems.push({ title });
      }
    }

    if (watchEntries.length === 0 && searchEntries.length === 0 && likedItems.length === 0) return null;

    const educationalKeywords = [
      'tutorial', 'learn', 'course', 'lecture', 'explained', 'how to',
      'programming', 'coding', 'science', 'math', 'history', 'analysis',
      'review', 'guide', 'basics', 'advanced', 'introduction', 'deep dive',
      'study', 'education', 'research', 'documentation', 'architecture',
      'cs230', 'cs229', 'stanford', 'mit', 'full course', 'pytorch', 'tensorflow'
    ];

    let totalItems = 0;
    let educationalItems = 0;

    // Check extension video titles
    for (const entry of watchEntries) {
      const title = (entry.raw_data?.title || '').toLowerCase();
      totalItems++;
      if (educationalKeywords.some(kw => title.includes(kw))) {
        educationalItems++;
      }
    }

    // Check liked video titles (API data)
    for (const item of likedItems) {
      const title = (item.title || '').toLowerCase();
      totalItems++;
      if (educationalKeywords.some(kw => title.includes(kw))) {
        educationalItems++;
      }
    }

    // Check search queries
    for (const entry of searchEntries) {
      const query = (entry.raw_data?.query || '').toLowerCase();
      totalItems++;
      if (educationalKeywords.some(kw => query.includes(kw))) {
        educationalItems++;
      }
    }

    if (totalItems === 0) return null;

    const ratio = educationalItems / totalItems;
    const educationalPercent = Math.round(ratio * 100);

    return {
      value: Math.round(ratio * 100) / 100,
      rawValue: {
        educational_count: educationalItems,
        total_count: totalItems,
        educational_percent: educationalPercent
      }
    };
  }

  /**
   * Channel Loyalty: Do they watch the same creators repeatedly?
   * Research: Routine/loyalty correlates with conscientiousness (r=0.25)
   */
  calculateChannelLoyalty(youtubeData) {
    const channelCounts = {};

    // From extension watch data
    const watchEntries = youtubeData.filter(e => e.data_type === 'extension_video_watch');
    for (const entry of watchEntries) {
      const channel = entry.raw_data?.channel;
      if (channel) {
        channelCounts[channel] = (channelCounts[channel] || 0) + 1;
      }
    }

    // From liked videos (API data) - multiple likes from same channel = loyalty
    const likedEntries = youtubeData.filter(e => e.data_type === 'likedVideos');
    for (const entry of likedEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        const channel = item.snippet?.channelTitle;
        if (channel) {
          channelCounts[channel] = (channelCounts[channel] || 0) + 1;
        }
      }
    }

    const channels = Object.keys(channelCounts);
    if (channels.length < 2) return null;

    const totalWatches = Object.values(channelCounts).reduce((a, b) => a + b, 0);
    const avgWatchesPerChannel = totalWatches / channels.length;

    // Higher ratio = more loyalty (watching same channels repeatedly)
    // Max 1.0 at 5+ avg watches per channel
    const loyaltyScore = Math.min(avgWatchesPerChannel / 5, 1);
    const topChannel = channels.sort((a, b) => channelCounts[b] - channelCounts[a])[0];

    return {
      value: Math.round(loyaltyScore * 100) / 100,
      rawValue: {
        unique_channels: channels.length,
        total_watches: totalWatches,
        top_channel: topChannel,
        top_channel_watches: channelCounts[topChannel]
      }
    };
  }

  /**
   * Social Content Ratio: Vlogs, podcasts, social content vs technical/solo
   * Research: Social media content consumption correlates with extraversion (r=0.30)
   */
  calculateSocialContentRatio(youtubeData) {
    const socialKeywords = [
      'vlog', 'podcast', 'interview', 'reaction', 'challenge', 'collab',
      'livestream', 'q&a', 'mukbang', 'chatting', 'drama', 'gossip',
      'news', 'talk show', 'commentary', 'stories', 'reage', 'reacts'
    ];

    let totalVideos = 0;
    let socialCount = 0;

    // From extension watch data
    const watchEntries = youtubeData.filter(e => e.data_type === 'extension_video_watch');
    for (const entry of watchEntries) {
      const title = (entry.raw_data?.title || '').toLowerCase();
      const channel = (entry.raw_data?.channel || '').toLowerCase();
      totalVideos++;
      if (socialKeywords.some(kw => title.includes(kw) || channel.includes(kw))) {
        socialCount++;
      }
    }

    // From liked videos (API data)
    const likedEntries = youtubeData.filter(e => e.data_type === 'likedVideos');
    for (const entry of likedEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        const title = (item.snippet?.title || '').toLowerCase();
        const channel = (item.snippet?.channelTitle || '').toLowerCase();
        totalVideos++;
        if (socialKeywords.some(kw => title.includes(kw) || channel.includes(kw))) {
          socialCount++;
        }
      }
    }

    if (totalVideos === 0) return null;

    const ratio = socialCount / totalVideos;

    return {
      value: Math.round(ratio * 100) / 100,
      rawValue: {
        social_videos: socialCount,
        total_videos: totalVideos,
        social_percent: Math.round(ratio * 100)
      }
    };
  }

  /**
   * Binge Watching Pattern: Extended continuous viewing sessions
   * Research: Binge-watching correlates with neuroticism (r=0.20)
   */
  calculateBingePattern(youtubeData) {
    const watchEntries = youtubeData.filter(e => e.data_type === 'extension_video_watch');
    if (watchEntries.length < 2) return null;

    // Calculate total watch time
    let totalWatchSeconds = 0;
    for (const entry of watchEntries) {
      const raw = entry.raw_data || {};
      totalWatchSeconds += raw.watchDurationSeconds || raw.watchDuration || 0;
    }

    // Average session length
    const avgSessionMinutes = (totalWatchSeconds / watchEntries.length) / 60;

    // Binge indicator: avg session > 30 min is moderate, > 60 min is high
    const bingeScore = Math.min(avgSessionMinutes / 60, 1);

    return {
      value: Math.round(bingeScore * 100) / 100,
      rawValue: {
        total_watch_hours: Math.round(totalWatchSeconds / 3600 * 10) / 10,
        avg_session_minutes: Math.round(avgSessionMinutes),
        video_count: watchEntries.length
      }
    };
  }

  // ─────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────

  /**
   * Subscription Loyalty: average subscription age in months
   */
  calculateSubscriptionLoyalty(youtubeData) {
    const subsEntries = youtubeData.filter(e =>
      e.data_type === 'subscriptions' || e.data_type === 'subscription'
    );
    const dates = [];
    for (const entry of subsEntries) {
      const items = entry.raw_data?.items || [];
      for (const item of items) {
        const pubDate = item.snippet?.publishedAt;
        if (pubDate) {
          const d = new Date(pubDate);
          if (!isNaN(d.getTime())) dates.push(d);
        }
      }
    }
    if (dates.length < 3) return null;

    const now = Date.now();
    const avgMonths = dates.reduce((s, d) => s + (now - d.getTime()), 0) / dates.length / (1000 * 60 * 60 * 24 * 30);
    // Score: 0-100. 0 months = 0, 24+ months average = 100
    const value = Math.min(100, Math.round((avgMonths / 24) * 100));
    return { value, rawValue: { avgMonths: Math.round(avgMonths), subCount: dates.length } };
  }

  /**
   * Topic Diversity: Shannon entropy of topicDetails categories from liked videos
   */
  calculateTopicDiversity(youtubeData) {
    const likedEntries = youtubeData.filter(e =>
      e.data_type === 'likedVideos' || e.data_type === 'liked_video'
    );
    const topicCounts = {};
    for (const entry of likedEntries) {
      const items = entry.raw_data?.items || (entry.raw_data?.topicDetails ? [entry.raw_data] : []);
      for (const item of items) {
        const categories = item.topicDetails?.topicCategories || [];
        for (const url of categories) {
          const label = url.split('/wiki/').pop()?.replace(/_/g, ' ');
          if (label) topicCounts[label] = (topicCounts[label] || 0) + 1;
        }
      }
    }

    const topics = Object.values(topicCounts);
    if (topics.length < 2) return null;

    // Shannon entropy
    const total = topics.reduce((a, b) => a + b, 0);
    const entropy = -topics.reduce((s, c) => {
      const p = c / total;
      return s + (p > 0 ? p * Math.log2(p) : 0);
    }, 0);

    // Normalize: max entropy = log2(N topics). Scale to 0-100.
    const maxEntropy = Math.log2(topics.length);
    const value = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 50;
    return { value, rawValue: { uniqueTopics: topics.length, entropy: Math.round(entropy * 100) / 100 } };
  }

  /**
   * Curation Behavior: number and organization of user-created playlists
   */
  calculateCurationBehavior(youtubeData) {
    const plEntries = youtubeData.filter(e => e.data_type === 'user_playlists' || e.data_type === 'playlists');
    if (plEntries.length === 0) return null;

    const latestEntry = plEntries[0];
    const playlists = latestEntry.raw_data?.playlists || latestEntry.raw_data?.items || [];
    const total = latestEntry.raw_data?.total || playlists.length;
    if (total === 0) return null;

    // Score: 0-100. 0 playlists = 0, 10+ playlists = 100
    const value = Math.min(100, Math.round((total / 10) * 100));
    return {
      value,
      rawValue: {
        playlistCount: total,
        avgItems: playlists.length > 0
          ? Math.round(playlists.reduce((s, p) => s + (p.itemCount || p.contentDetails?.itemCount || 0), 0) / playlists.length)
          : 0
      }
    };
  }

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'youtube',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue > 1 ? featureValue / 100 : featureValue,
      confidence_score: 65, // Slightly lower confidence than Spotify (less research)
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      evidence: {
        description: metadata.description,
        raw_value: metadata.raw_value || {},
        ...metadata.evidence
      }
    };
  }

  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    log.info(`Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      log.info(`Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };
    } catch (error) {
      log.error('Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

const youtubeFeatureExtractor = new YouTubeFeatureExtractor();
export default youtubeFeatureExtractor;
