/**
 * Twitch Feature Extractor
 *
 * Extracts behavioral features from Twitch viewing data that correlate
 * with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Category diversity → Openness (r=0.30)
 * - Stream engagement duration → Conscientiousness (r=0.22)
 * - Social content preference → Extraversion (r=0.35)
 * - Competitive gaming ratio → Extraversion (r=0.25)
 * - Community breadth → Extraversion (r=0.28)
 *
 * Research basis:
 * - Stachl et al. (2020) - Digital behavior & personality, n=624
 * - Azucar et al. (2018) - Digital footprints meta-analysis, k=12 studies
 * - Worth & Book (2014) - Gaming & personality, n=900
 */

import { supabaseAdmin } from '../database.js';

class TwitchFeatureExtractor {
  constructor() {
    this.LOOKBACK_DAYS = 90;
  }

  /**
   * Extract all behavioral features from Twitch data
   */
  async extractFeatures(userId) {
    console.log(`🎮 [Twitch Extractor] Extracting features for user ${userId}`);

    try {
      // Fetch from user_platform_data
      const { data: platformData, error: platformError } = await supabaseAdmin
        .from('user_platform_data')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'twitch')
        .order('extracted_at', { ascending: false });

      if (platformError) {
        console.warn('⚠️ [Twitch Extractor] Error fetching data:', platformError.message);
      }

      const twitchData = (platformData || []).map(entry => ({
        ...entry,
        created_at: entry.extracted_at,
        raw_data: entry.raw_data || {}
      }));

      if (twitchData.length === 0) {
        console.log('⚠️ [Twitch Extractor] No Twitch data found');
        return [];
      }

      console.log(`📊 [Twitch Extractor] Found ${twitchData.length} Twitch data entries`);

      const features = [];

      // 1. Category Diversity (Openness)
      const categoryDiversity = this.calculateCategoryDiversity(twitchData);
      if (categoryDiversity !== null) {
        features.push(this.createFeature(userId, 'twitch_category_diversity', categoryDiversity.value, {
          contributes_to: 'openness',
          contribution_weight: 0.30,
          description: 'Variety of content categories browsed',
          evidence: { correlation: 0.30, citation: 'Stachl et al. (2020)' },
          raw_value: categoryDiversity.rawValue
        }));
      }

      // 2. Stream Engagement Duration (Conscientiousness)
      const engagement = this.calculateStreamEngagement(twitchData);
      if (engagement !== null) {
        features.push(this.createFeature(userId, 'twitch_stream_engagement', engagement.value, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.22,
          description: 'Average duration of stream watching sessions',
          evidence: { correlation: 0.22, citation: 'Azucar et al. (2018)' },
          raw_value: engagement.rawValue
        }));
      }

      // 3. Social Content Preference (Extraversion)
      const socialPref = this.calculateSocialPreference(twitchData);
      if (socialPref !== null) {
        features.push(this.createFeature(userId, 'twitch_social_preference', socialPref.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.35,
          description: 'Preference for social/chatting streams vs gameplay',
          evidence: { correlation: 0.35, citation: 'Worth & Book (2014)' },
          raw_value: socialPref.rawValue
        }));
      }

      // 4. Competitive Gaming Ratio (Extraversion)
      const competitiveRatio = this.calculateCompetitiveRatio(twitchData);
      if (competitiveRatio !== null) {
        features.push(this.createFeature(userId, 'twitch_competitive_ratio', competitiveRatio.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.25,
          description: 'Interest in competitive/esports content',
          evidence: { correlation: 0.25, citation: 'Worth & Book (2014)' },
          raw_value: competitiveRatio.rawValue
        }));
      }

      // 5. Community Breadth (Extraversion)
      const communityBreadth = this.calculateCommunityBreadth(twitchData);
      if (communityBreadth !== null) {
        features.push(this.createFeature(userId, 'twitch_community_breadth', communityBreadth.value, {
          contributes_to: 'extraversion',
          contribution_weight: 0.28,
          description: 'Number of different communities/channels engaged with',
          evidence: { correlation: 0.28, citation: 'Azucar et al. (2018)' },
          raw_value: communityBreadth.rawValue
        }));
      }

      console.log(`✅ [Twitch Extractor] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [Twitch Extractor] Error:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // Feature Calculation Methods
  // ─────────────────────────────────────────────

  /**
   * Category Diversity: How many different game/content categories?
   * Research: Content variety correlates with openness (r=0.30)
   */
  calculateCategoryDiversity(twitchData) {
    const categories = new Set();

    // From browse data (extension)
    const browseEntries = twitchData.filter(e => e.data_type === 'extension_browse');
    for (const entry of browseEntries) {
      const category = entry.raw_data?.category;
      if (category && category !== 'directory_home') {
        categories.add(category);
      }
    }

    // From streams API data (game_name field)
    const apiStreamEntries = twitchData.filter(e => e.data_type === 'streams');
    for (const entry of apiStreamEntries) {
      const items = entry.raw_data?.data || [];
      for (const stream of items) {
        const gameName = stream.game_name;
        if (gameName) categories.add(gameName);
      }
    }

    // From extension stream watches
    const streamEntries = twitchData.filter(e => e.data_type === 'extension_stream_watch');
    for (const entry of streamEntries) {
      const gameName = entry.raw_data?.gameName;
      if (gameName) categories.add(gameName);
    }

    // From clip views
    const clipEntries = twitchData.filter(e => e.data_type === 'extension_clip_view');
    for (const entry of clipEntries) {
      const gameName = entry.raw_data?.gameName;
      if (gameName) categories.add(gameName);
    }

    const categoryCount = categories.size;
    if (categoryCount === 0) return null;

    // Normalize: 1-3 = low, 4-8 = moderate, 9+ = high
    const diversityScore = Math.min(categoryCount / 10, 1);

    return {
      value: Math.round(diversityScore * 100) / 100,
      rawValue: {
        category_count: categoryCount,
        categories: [...categories].slice(0, 10) // Top 10 for display
      }
    };
  }

  /**
   * Stream Engagement Duration: How long do they watch streams?
   * Research: Sustained attention correlates with conscientiousness (r=0.22)
   */
  calculateStreamEngagement(twitchData) {
    const streamEntries = twitchData.filter(e => e.data_type === 'extension_stream_watch');
    if (streamEntries.length === 0) return null;

    let totalSeconds = 0;
    let count = 0;

    for (const entry of streamEntries) {
      const raw = entry.raw_data || {};
      const duration = raw.watchDurationSeconds || raw.watchDuration || 0;
      if (duration > 0) {
        totalSeconds += duration;
        count++;
      }
    }

    if (count === 0) return null;

    const avgMinutes = (totalSeconds / count) / 60;
    // Normalize: 0-10 min = low, 10-30 = moderate, 30+ = high engagement
    const engagementScore = Math.min(avgMinutes / 45, 1);

    return {
      value: Math.round(engagementScore * 100) / 100,
      rawValue: {
        streams_watched: count,
        total_watch_hours: Math.round(totalSeconds / 3600 * 10) / 10,
        avg_session_minutes: Math.round(avgMinutes)
      }
    };
  }

  /**
   * Social Content Preference: Just Chatting vs gaming content
   * Research: Social media engagement correlates with extraversion (r=0.35)
   */
  calculateSocialPreference(twitchData) {
    const socialCategories = new Set([
      'just chatting', 'talk shows & podcasts', 'asmr', 'music',
      'art', 'food & drink', 'irl', 'special events'
    ]);

    let socialCount = 0;
    let totalCount = 0;

    // From browse data (extension)
    const browseEntries = twitchData.filter(e => e.data_type === 'extension_browse');
    for (const entry of browseEntries) {
      const category = (entry.raw_data?.category || '').toLowerCase();
      if (category && category !== 'directory_home') {
        totalCount++;
        if (socialCategories.has(category)) socialCount++;
      }
    }

    // From streams API data
    const apiStreamEntries = twitchData.filter(e => e.data_type === 'streams');
    for (const entry of apiStreamEntries) {
      const items = entry.raw_data?.data || [];
      for (const stream of items) {
        const gameName = (stream.game_name || '').toLowerCase();
        if (gameName) {
          totalCount++;
          if (socialCategories.has(gameName)) socialCount++;
        }
      }
    }

    // From extension stream watches
    const streamEntries = twitchData.filter(e => e.data_type === 'extension_stream_watch');
    for (const entry of streamEntries) {
      const gameName = (entry.raw_data?.gameName || '').toLowerCase();
      if (gameName) {
        totalCount++;
        if (socialCategories.has(gameName)) socialCount++;
      }
    }

    if (totalCount === 0) return null;

    const ratio = socialCount / totalCount;

    return {
      value: Math.round(ratio * 100) / 100,
      rawValue: {
        social_streams: socialCount,
        total_streams: totalCount,
        social_percent: Math.round(ratio * 100)
      }
    };
  }

  /**
   * Competitive Gaming Ratio: Esports/competitive game content
   * Research: Competitive gaming correlates with extraversion (r=0.25)
   */
  calculateCompetitiveRatio(twitchData) {
    const competitiveGames = new Set([
      'counter-strike 2', 'league of legends', 'valorant', 'dota 2',
      'overwatch 2', 'apex legends', 'fortnite', 'call of duty',
      'rocket league', 'rainbow six siege', 'pubg', 'street fighter',
      'tekken', 'starcraft', 'chess', 'arc raiders'
    ]);

    let competitiveCount = 0;
    let totalCount = 0;

    // From extension data
    const extensionEntries = twitchData.filter(e =>
      ['extension_browse', 'extension_stream_watch', 'extension_clip_view'].includes(e.data_type)
    );

    for (const entry of extensionEntries) {
      const category = (entry.raw_data?.category || entry.raw_data?.gameName || '').toLowerCase();
      if (category && category !== 'directory_home') {
        totalCount++;
        if (competitiveGames.has(category)) competitiveCount++;
      }
    }

    // From streams API data
    const apiStreamEntries = twitchData.filter(e => e.data_type === 'streams');
    for (const entry of apiStreamEntries) {
      const items = entry.raw_data?.data || [];
      for (const stream of items) {
        const gameName = (stream.game_name || '').toLowerCase();
        if (gameName) {
          totalCount++;
          if (competitiveGames.has(gameName)) competitiveCount++;
        }
      }
    }

    if (totalCount === 0) return null;

    const ratio = competitiveCount / totalCount;

    return {
      value: Math.round(ratio * 100) / 100,
      rawValue: {
        competitive_count: competitiveCount,
        total_count: totalCount,
        competitive_percent: Math.round(ratio * 100)
      }
    };
  }

  /**
   * Community Breadth: How many unique channels/streamers followed/watched?
   * Research: Social network size correlates with extraversion (r=0.28)
   */
  calculateCommunityBreadth(twitchData) {
    const channels = new Set();

    // From followed channels (API data)
    const followEntries = twitchData.filter(e => e.data_type === 'followedChannels');
    for (const entry of followEntries) {
      const items = entry.raw_data?.data || entry.raw_data?.items || [];
      for (const item of items) {
        const name = item.broadcaster_name || item.broadcaster_login || item.name;
        if (name) channels.add(name.toLowerCase());
      }
    }

    // From streams API data (user_name field)
    const apiStreamEntries = twitchData.filter(e => e.data_type === 'streams');
    for (const entry of apiStreamEntries) {
      const items = entry.raw_data?.data || [];
      for (const stream of items) {
        const name = stream.user_name || stream.user_login;
        if (name) channels.add(name.toLowerCase());
      }
    }

    // From extension stream watches
    const streamEntries = twitchData.filter(e => e.data_type === 'extension_stream_watch');
    for (const entry of streamEntries) {
      const channel = entry.raw_data?.channelName;
      if (channel) channels.add(channel.toLowerCase());
    }

    // From browse data (visible channels)
    const browseEntries = twitchData.filter(e => e.data_type === 'extension_browse');
    for (const entry of browseEntries) {
      const visibleChannels = entry.raw_data?.channels || [];
      for (const ch of visibleChannels) {
        if (typeof ch === 'string' && ch.length > 2) channels.add(ch.toLowerCase());
      }
    }

    // From clips
    const clipEntries = twitchData.filter(e => e.data_type === 'extension_clip_view');
    for (const entry of clipEntries) {
      const channel = entry.raw_data?.channelName;
      if (channel) channels.add(channel.toLowerCase());
    }

    const channelCount = channels.size;
    if (channelCount === 0) return null;

    // Normalize: 1-5 = small community, 6-15 = moderate, 16+ = large
    const breadthScore = Math.min(channelCount / 20, 1);

    return {
      value: Math.round(breadthScore * 100) / 100,
      rawValue: {
        channel_count: channelCount,
        top_channels: [...channels].slice(0, 5)
      }
    };
  }

  // ─────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────

  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'twitch',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue > 1 ? featureValue / 100 : featureValue,
      confidence_score: 60, // Lower confidence - less research than Spotify
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      metadata: {
        raw_value: metadata.raw_value || {}
      },
      evidence: {
        description: metadata.description,
        ...metadata.evidence
      }
    };
  }

  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    console.log(`[Twitch Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`[Twitch Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };
    } catch (error) {
      console.error('[Twitch Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

const twitchFeatureExtractor = new TwitchFeatureExtractor();
export default twitchFeatureExtractor;
