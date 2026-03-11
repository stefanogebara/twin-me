/**
 * Reflection Store
 *
 * Database and cache operations for reflections.
 * Handles storing, retrieving, history, expiration, and response formatting.
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { CACHE_TTL_HOURS } from './reflectionConstants.js';
import { createLogger } from '../logger.js';

const log = createLogger('Reflectionstore');

/**
 * Store reflection in database
 *
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @param {Object} reflection - Reflection object to store
 */
export async function storeReflection(userId, platform, reflection) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

  const { error } = await supabaseAdmin
    .from('reflection_history')
    .insert({
      user_id: userId,
      platform,
      reflection_text: reflection.text,
      themes: reflection.themes,
      confidence: reflection.confidence,
      reflection_type: 'observation',
      expires_at: expiresAt.toISOString(),
      data_snapshot: {
        patterns: reflection.patterns,
        evidence: reflection.evidence || [],
        contextSnapshot: reflection.contextSnapshot || null
      }
    });
  if (error) log.error('Failed to store reflection:', error.message);
}

/**
 * Get cached reflection from database
 *
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @returns {Promise<Object|null>} Cached reflection or null
 */
export async function getCachedReflection(userId, platform) {
  try {
    const { data } = await supabaseAdmin
      .from('reflection_history')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .is('dismissed_at', null)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Check if reflection is expired
 *
 * @param {Object} reflection - Reflection with expires_at field
 * @returns {boolean} True if expired
 */
export function isExpired(reflection) {
  if (!reflection.expires_at) return true;
  return new Date(reflection.expires_at) < new Date();
}

/**
 * Get reflection history for a platform
 *
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @param {number} limit - Max results
 * @returns {Promise<Array>} History entries
 */
export async function getHistory(userId, platform, limit = 5) {
  try {
    const { data } = await supabaseAdmin
      .from('reflection_history')
      .select('id, reflection_text, generated_at, themes')
      .eq('user_id', userId)
      .eq('platform', platform)
      .is('dismissed_at', null)
      .order('generated_at', { ascending: false })
      .range(1, limit); // Skip the first (current) one

    return data || [];
  } catch (error) {
    return [];
  }
}

/**
 * Format the response for the API
 *
 * @param {Object} reflection - Current reflection (stored or fresh)
 * @param {Array} history - Historical reflections
 * @param {Object|null} lifeContext - Life context
 * @param {Object|null} visualData - Visual/raw data for display
 * @returns {Object} Formatted response
 */
export function formatResponse(reflection, history, lifeContext = null, visualData = null) {
  // Handle both stored and freshly generated reflections
  const reflectionData = reflection.reflection_text
    ? {
        id: reflection.id,
        text: reflection.reflection_text,
        generatedAt: reflection.generated_at,
        expiresAt: reflection.expires_at,
        confidence: reflection.confidence,
        themes: reflection.themes || [],
        source: reflection.source || 'ai'
      }
    : {
        id: null,
        text: reflection.text,
        generatedAt: new Date().toISOString(),
        expiresAt: null,
        confidence: reflection.confidence,
        themes: reflection.themes || [],
        source: reflection.source || 'ai'
      };

  const patterns = reflection.data_snapshot?.patterns || reflection.patterns || [];
  const evidence = reflection.data_snapshot?.evidence || reflection.evidence || [];
  const contextSnapshot = reflection.data_snapshot?.contextSnapshot || reflection.contextSnapshot || null;

  // Build cross-platform context info for the frontend
  const crossPlatformContext = {
    lifeContext: lifeContext ? {
      currentStatus: lifeContext.currentStatus,
      isOnVacation: lifeContext.isOnVacation,
      promptSummary: lifeContext.promptSummary,
      activeEvents: lifeContext.activeEvents || []
    } : contextSnapshot?.lifeContext || null
  };

  // Prefer fresh visualData over cached snapshot for up-to-date metrics
  const rawData = visualData || contextSnapshot?.rawDataUsed || {};

  return {
    success: true,
    reflection: reflectionData,
    evidence: evidence.map((e, i) => ({
      id: `evidence-${i}`,
      observation: e.observation || e.claim,
      dataPoints: e.dataPoints || [],
      confidence: e.confidence || 'medium'
    })),
    patterns: patterns.map((p, i) => ({
      id: `pattern-${i}`,
      text: typeof p === 'string' ? p : p.text,
      occurrences: typeof p === 'object' ? p.occurrences : 'noticed'
    })),
    crossPlatformContext,
    history: history.map(h => ({
      id: h.id,
      text: h.reflection_text,
      generatedAt: h.generated_at
    })),
    // NEW: Visual data for engaging display (no more textbook style)
    // Use structured data if available, otherwise parse from track names
    recentTracks: rawData.recentTracksStructured?.slice(0, 5)?.map(t => ({
      name: t.name,
      artist: t.artist,
      playedAt: t.playedAt
    })) || rawData.recentTrackNames?.slice(0, 5)?.map(name => {
      const parts = name.split(' by ');
      return {
        name: parts[0] || name,
        artist: parts[1] || 'Unknown Artist'
      };
    }) || [],
    topArtists: rawData.topArtists?.slice(0, 6) || [],
    currentMood: rawData.listeningContext ? {
      label: rawData.listeningContext,
      energy: rawData.averageEnergy || 0.5,
      valence: rawData.averageValence || 0.5
    } : null,
    // Spotify: Chart visualization data
    topArtistsWithPlays: rawData.topArtistsWithPlays || [],
    topGenres: rawData.topGenres || [],
    listeningHours: rawData.listeningHours || [],
    // Whoop: Metrics and visualization data
    currentMetrics: rawData.currentMetrics || null,
    sleepBreakdown: rawData.sleepBreakdown || null,
    recentTrends: rawData.recentTrends || [],
    history7Day: rawData.history7Day || [],
    // Calendar: Schedule visualization data
    todayEvents: rawData.todayEvents || [],
    upcomingEvents: rawData.upcomingEvents || [],
    eventTypeDistribution: rawData.eventTypeDistribution || [],
    weeklyHeatmap: rawData.weeklyHeatmap || [],
    scheduleStats: rawData.scheduleStats || null,
    // YouTube: Content visualization data
    youtubeChannels: rawData.topChannels || [],
    youtubeChannelNames: rawData.topChannelNames || [],
    youtubeRecentLiked: rawData.recentLiked || [],
    youtubeContentCategories: rawData.contentCategories || [],
    youtubeSubscriptionCount: rawData.subscriptionCount || 0,
    youtubeLikedVideoCount: rawData.likedVideoCount || 0,
    youtubeLearningRatio: rawData.learningRatio ?? null,
    // Twitch: Gaming visualization data
    twitchChannels: rawData.topChannels || [],
    twitchChannelNames: rawData.topChannelNames || [],
    twitchFollowedCount: rawData.followedChannelCount || 0,
    twitchGamingCategories: rawData.gamingCategories || [],
    twitchDisplayName: rawData.displayName || null,
    // Extension data for deeper insights
    youtubeWatchHistory: rawData.recentWatchHistory || [],
    youtubeSearchQueries: rawData.searchQueries || [],
    twitchStreamWatches: rawData.recentStreamWatches || [],
    twitchBrowseCategories: rawData.browseCategories || [],
    hasExtensionData: rawData.hasExtensionData || false,
    // Web browsing data
    webTopCategories: rawData.topCategories || [],
    webTopDomains: rawData.topDomains || [],
    webTopTopics: rawData.topTopics || [],
    webRecentSearches: rawData.recentSearches || [],
    webReadingProfile: rawData.readingProfile || null,
    webRecentActivity: rawData.recentActivity || [],
    webTotalPageVisits: rawData.totalPageVisits || 0,
    webTotalSearches: rawData.totalSearches || 0,
    // Discord data
    discordServers: rawData.servers || [],
    discordTotalServers: rawData.totalServers || 0,
    discordCategoryBreakdown: rawData.categoryBreakdown || [],
    discordTopCategories: rawData.topCategories || [],
    // LinkedIn data
    linkedinHeadline: rawData.headline || null,
    linkedinIndustry: rawData.industry || null,
    linkedinLocale: rawData.locale || null,
    linkedinSkills: rawData.skills || [],
    linkedinConnectionCount: rawData.connectionCount || null
  };
}
