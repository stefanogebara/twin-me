/**
 * Other Platform Data Fetchers
 *
 * Data extraction for YouTube, Twitch, and Web Browsing platforms.
 */

import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Get YouTube data for reflection
 * Reads from user_platform_data (stored by Nango extraction)
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} { success, data?, error? }
 */
export async function getYouTubeData(userId) {
  try {
    const { data: youtubeData } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, data_type, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .order('extracted_at', { ascending: false });

    if (!youtubeData || youtubeData.length === 0) {
      return { success: false, error: 'YouTube not connected or no data' };
    }

    // Extract subscriptions
    const subsRow = youtubeData.find(d => d.data_type === 'subscriptions');
    const subscriptions = subsRow?.raw_data?.items || [];
    const topChannels = subscriptions
      .slice(0, 15)
      .map(s => ({
        name: s.snippet?.title,
        description: s.snippet?.description?.substring(0, 80)
      }))
      .filter(c => c.name);

    // Extract liked videos
    const likedRow = youtubeData.find(d => d.data_type === 'likedVideos');
    const likedVideos = likedRow?.raw_data?.items || [];
    const recentLiked = likedVideos.slice(0, 10).map(v => ({
      title: v.snippet?.title,
      channel: v.snippet?.channelTitle,
      publishedAt: v.snippet?.publishedAt
    }));

    // Extension-sourced: recent watch history
    const extensionWatches = youtubeData
      .filter(d => d.data_type === 'extension_video_watch' && d.raw_data?.action === 'end')
      .slice(0, 20)
      .map(d => ({
        title: d.raw_data.title,
        videoId: d.raw_data.videoId,
        watchDuration: d.raw_data.watchDurationSeconds,
        watchPercentage: d.raw_data.watchPercentage,
        completed: d.raw_data.completed,
        timestamp: d.raw_data.timestamp
      }));

    // Extension-sourced: search queries
    const extensionSearches = youtubeData
      .filter(d => d.data_type === 'extension_search')
      .slice(0, 10)
      .map(d => d.raw_data.query)
      .filter(Boolean);

    // Derive content categories
    const categories = {};
    likedVideos.forEach(v => {
      const title = (v.snippet?.title || '').toLowerCase();
      const desc = (v.snippet?.description || '').toLowerCase();
      const combined = title + ' ' + desc;
      if (/tutorial|learn|course|how to|explained/i.test(combined)) categories['Education'] = (categories['Education'] || 0) + 1;
      if (/game|gaming|play|stream/i.test(combined)) categories['Gaming'] = (categories['Gaming'] || 0) + 1;
      if (/music|song|album|concert|lyrics/i.test(combined)) categories['Music'] = (categories['Music'] || 0) + 1;
      if (/tech|code|programming|dev|software/i.test(combined)) categories['Technology'] = (categories['Technology'] || 0) + 1;
      if (/fitness|workout|health|exercise/i.test(combined)) categories['Fitness'] = (categories['Fitness'] || 0) + 1;
      if (/cook|recipe|food/i.test(combined)) categories['Food'] = (categories['Food'] || 0) + 1;
      if (/vlog|daily|life|travel/i.test(combined)) categories['Lifestyle'] = (categories['Lifestyle'] || 0) + 1;
      if (/science|research|space|nature/i.test(combined)) categories['Science'] = (categories['Science'] || 0) + 1;
      if (/news|politics|economy/i.test(combined)) categories['News'] = (categories['News'] || 0) + 1;
    });

    const totalCategorized = Object.values(categories).reduce((sum, c) => sum + c, 0) || 1;
    const contentCategories = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, count]) => ({
        category,
        percentage: Math.round((count / totalCategorized) * 100)
      }));

    // Calculate learning vs entertainment ratio
    const learningCategories = (categories['Education'] || 0) + (categories['Technology'] || 0) + (categories['Science'] || 0);
    const entertainmentCategories = (categories['Gaming'] || 0) + (categories['Music'] || 0) + (categories['Lifestyle'] || 0);
    const total = learningCategories + entertainmentCategories || 1;
    const learningRatio = Math.round((learningCategories / total) * 100);

    console.log(`[Reflection] Found ${subscriptions.length} subs, ${likedVideos.length} liked, ${extensionWatches.length} extension watches for user ${userId}`);

    return {
      success: subscriptions.length > 0 || likedVideos.length > 0 || extensionWatches.length > 0,
      data: {
        topChannels,
        topChannelNames: topChannels.map(c => c.name),
        recentLiked,
        subscriptionCount: subscriptions.length,
        likedVideoCount: likedVideos.length,
        contentCategories,
        learningRatio,
        entertainmentRatio: 100 - learningRatio,
        // Extension data
        recentWatchHistory: extensionWatches,
        searchQueries: extensionSearches,
        hasExtensionData: extensionWatches.length > 0 || extensionSearches.length > 0
      }
    };
  } catch (error) {
    console.error('[Reflection] YouTube data error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get Twitch data for reflection
 * Reads from user_platform_data (stored by Nango extraction)
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} { success, data?, error? }
 */
export async function getTwitchData(userId) {
  try {
    const { data: twitchData } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, data_type, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'twitch')
      .order('extracted_at', { ascending: false });

    if (!twitchData || twitchData.length === 0) {
      return { success: false, error: 'Twitch not connected or no data' };
    }

    // Extract followed channels
    const followedRow = twitchData.find(d => d.data_type === 'followedChannels');
    const followedChannels = followedRow?.raw_data?.data || [];
    const topChannels = followedChannels.slice(0, 15).map(c => ({
      name: c.broadcaster_name || c.broadcaster_login,
      gameName: c.game_name || null
    }));

    // Extract user info
    const userRow = twitchData.find(d => d.data_type === 'user');
    const twitchUser = userRow?.raw_data?.data?.[0] || {};

    // Derive gaming preferences from followed channels
    const gamePreferences = {};
    followedChannels.forEach(c => {
      if (c.game_name) {
        gamePreferences[c.game_name] = (gamePreferences[c.game_name] || 0) + 1;
      }
    });

    const totalGames = Object.values(gamePreferences).reduce((sum, c) => sum + c, 0) || 1;
    const gamingCategories = Object.entries(gamePreferences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([game, count]) => ({
        game,
        percentage: Math.round((count / totalGames) * 100)
      }));

    // Extension-sourced: stream watches
    const extensionStreamWatches = twitchData
      .filter(d => d.data_type === 'extension_stream_watch' && d.raw_data?.action === 'end')
      .slice(0, 20)
      .map(d => ({
        channelName: d.raw_data.channelName,
        gameName: d.raw_data.gameName,
        watchDuration: d.raw_data.watchDurationSeconds,
        timestamp: d.raw_data.timestamp
      }));

    // Extension-sourced: browse categories
    const extensionBrowses = twitchData
      .filter(d => d.data_type === 'extension_browse')
      .slice(0, 10)
      .map(d => d.raw_data.category)
      .filter(Boolean);

    // Merge extension game data into gamingCategories
    const extensionGameCounts = {};
    extensionStreamWatches.forEach(w => {
      if (w.gameName) extensionGameCounts[w.gameName] = (extensionGameCounts[w.gameName] || 0) + 1;
    });
    Object.entries(extensionGameCounts).forEach(([game, count]) => {
      const existing = gamingCategories.find(c => c.game === game);
      if (existing) {
        existing.percentage += Math.round((count / (totalGames + Object.values(extensionGameCounts).reduce((a, b) => a + b, 0))) * 100);
      } else {
        gamingCategories.push({ game, percentage: Math.round((count / Math.max(totalGames, 1)) * 100) });
      }
    });
    // Re-sort and re-normalize
    gamingCategories.sort((a, b) => b.percentage - a.percentage);

    console.log(`[Reflection] Found ${followedChannels.length} followed, ${extensionStreamWatches.length} extension watches for user ${userId}`);

    return {
      success: followedChannels.length > 0 || extensionStreamWatches.length > 0,
      data: {
        topChannels,
        topChannelNames: topChannels.map(c => c.name),
        followedChannelCount: followedChannels.length,
        gamingCategories,
        displayName: twitchUser.display_name || null,
        broadcasterType: twitchUser.broadcaster_type || null,
        accountCreated: twitchUser.created_at || null,
        // Extension data
        recentStreamWatches: extensionStreamWatches,
        browseCategories: extensionBrowses,
        hasExtensionData: extensionStreamWatches.length > 0 || extensionBrowses.length > 0
      }
    };
  } catch (error) {
    console.error('[Reflection] Twitch data error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get Web Browsing data for reflection
 * Reads from user_platform_data (stored by browser extension universal collector)
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} { success, data?, error? }
 */
export async function getWebBrowsingData(userId) {
  try {
    const { data: webData } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, data_type, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .order('extracted_at', { ascending: false })
      .limit(300);

    if (!webData || webData.length === 0) {
      return { success: false, error: 'No web browsing data captured yet' };
    }

    // Page visits
    const pageVisits = webData.filter(d =>
      ['extension_page_visit', 'extension_article_read', 'extension_web_video'].includes(d.data_type)
    );

    // Search queries
    const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');
    const recentSearches = searchEvents
      .slice(0, 15)
      .map(d => d.raw_data?.searchQuery)
      .filter(Boolean);

    // Top categories
    const categoryCounts = {};
    pageVisits.forEach(d => {
      const cat = d.raw_data?.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const totalVisits = pageVisits.length || 1;
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / totalVisits) * 100)
      }));

    // Top domains
    const domainCounts = {};
    pageVisits.forEach(d => {
      const domain = d.raw_data?.domain;
      if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([domain, count]) => ({ domain, count }));

    // Top topics
    const topicCounts = {};
    pageVisits.forEach(d => {
      (d.raw_data?.metadata?.topics || []).forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([topic]) => topic);

    // Reading profile
    const engagementScores = pageVisits
      .map(d => d.raw_data?.engagement?.engagementScore)
      .filter(s => s != null);
    const avgEngagement = engagementScores.length > 0
      ? Math.round(engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length)
      : null;

    const readingBehaviors = {};
    pageVisits.forEach(d => {
      const behavior = d.raw_data?.engagement?.readingBehavior;
      if (behavior) readingBehaviors[behavior] = (readingBehaviors[behavior] || 0) + 1;
    });
    const dominantBehavior = Object.entries(readingBehaviors)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const timeOnPages = pageVisits
      .map(d => d.raw_data?.engagement?.timeOnPage)
      .filter(t => t != null && t > 0);
    const avgTimeOnPage = timeOnPages.length > 0
      ? Math.round(timeOnPages.reduce((a, b) => a + b, 0) / timeOnPages.length)
      : null;

    // Content type distribution
    const contentTypeCounts = {};
    pageVisits.forEach(d => {
      const ct = d.raw_data?.metadata?.contentType || 'other';
      contentTypeCounts[ct] = (contentTypeCounts[ct] || 0) + 1;
    });

    // Recent activity (for display)
    const recentActivity = pageVisits.slice(0, 10).map(d => ({
      title: d.raw_data?.title,
      domain: d.raw_data?.domain,
      category: d.raw_data?.category,
      timeOnPage: d.raw_data?.engagement?.timeOnPage,
      timestamp: d.raw_data?.timestamp
    }));

    console.log(`[Reflection] Found ${pageVisits.length} page visits, ${searchEvents.length} searches for user ${userId}`);

    return {
      success: pageVisits.length > 0,
      data: {
        totalPageVisits: pageVisits.length,
        totalSearches: searchEvents.length,
        topCategories,
        topDomains,
        topTopics,
        recentSearches,
        readingProfile: {
          avgEngagement,
          avgTimeOnPage,
          dominantBehavior,
          readingBehaviors,
          contentTypeDistribution: contentTypeCounts
        },
        recentActivity,
        hasExtensionData: true
      }
    };
  } catch (error) {
    console.error('[Reflection] Web browsing data error:', error);
    return { success: false, error: error.message };
  }
}
