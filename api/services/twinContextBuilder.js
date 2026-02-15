/**
 * Shared Twin Context Builder
 *
 * Fetches all context layers needed for twin chat in parallel.
 * Used by both twin-chat.js (web) and MCP server.ts (Claude Desktop)
 * to ensure consistent context across all twin interfaces.
 */

import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefresh.js';
import { retrieveMemories } from './memoryStreamService.js';
import { getTwinSummary } from './twinSummaryService.js';
import { getUndeliveredInsights } from './proactiveInsights.js';
import axios from 'axios';

// Short-lived platform data cache to avoid redundant API calls within 5 minutes
const platformDataCache = new Map();
const PLATFORM_CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch all twin context layers in parallel.
 *
 * @param {string} userId - The user ID (public.users.id)
 * @param {string} userMessage - The user's message (used for memory retrieval relevance)
 * @param {object} [options]
 * @param {string[]} [options.platforms] - Platform slugs to fetch data for (default: ['spotify', 'calendar', 'whoop', 'web'])
 * @param {boolean} [options.getSoulSignature] - Whether to fetch soul signature (default: true)
 * @param {boolean} [options.getPlatformData] - Whether to fetch platform data (default: true)
 * @param {boolean} [options.getPersonalityScores] - Whether to fetch personality scores (default: true)
 * @returns {Promise<TwinContext>}
 */
async function fetchTwinContext(userId, userMessage, options = {}) {
  const {
    platforms = ['spotify', 'calendar', 'whoop', 'web'],
    getSoulSignature: fetchSoul = true,
    getPlatformData: fetchPlatforms = true,
    getPersonalityScores: fetchPersonality = true,
  } = options;

  const [
    soulSignature,
    platformData,
    personalityScores,
    writingProfile,
    memories,
    twinSummary,
    proactiveInsights,
  ] = await Promise.all([
    fetchSoul
      ? _fetchSoulSignature(userId).catch(err => {
          console.warn('[TwinContext] Soul signature fetch failed:', err.message);
          return null;
        })
      : Promise.resolve(null),

    fetchPlatforms
      ? _fetchPlatformData(userId, platforms).catch(err => {
          console.warn('[TwinContext] Platform data fetch failed:', err.message);
          return {};
        })
      : Promise.resolve({}),

    fetchPersonality
      ? _fetchPersonalityScores(userId).catch(err => {
          console.warn('[TwinContext] Personality scores fetch failed:', err.message);
          return null;
        })
      : Promise.resolve(null),

    _fetchWritingProfile(userId).catch(err => {
      console.warn('[TwinContext] Writing profile fetch failed:', err.message);
      return null;
    }),

    retrieveMemories(userId, userMessage, 15).catch(err => {
      console.warn('[TwinContext] Memory retrieval failed:', err.message);
      return [];
    }),

    getTwinSummary(userId).catch(err => {
      console.warn('[TwinContext] Twin summary fetch failed:', err.message);
      return null;
    }),

    getUndeliveredInsights(userId).catch(err => {
      console.warn('[TwinContext] Proactive insights fetch failed:', err.message);
      return [];
    }),
  ]);

  return {
    soulSignature,
    platformData,
    personalityScores,
    writingProfile,
    memories,
    twinSummary,
    proactiveInsights,
  };
}

/**
 * Build contextSources metadata for API response.
 * Provides a summary of what data was available for the twin's response.
 *
 * @param {TwinContext} context - The context object from fetchTwinContext
 * @returns {object} contextSources metadata
 */
function buildContextSourcesMeta(context) {
  const { soulSignature, platformData, personalityScores, memories, twinSummary, proactiveInsights } = context;

  return {
    soulSignature: !!soulSignature,
    twinSummary: twinSummary ? twinSummary.substring(0, 200) : null,
    memoryStream: {
      total: memories?.length || 0,
      reflections: memories?.filter(m => m.memory_type === 'reflection').length || 0,
      facts: memories?.filter(m => m.memory_type === 'fact').length || 0,
    },
    proactiveInsights: proactiveInsights?.map(i => ({
      insight: i.insight, category: i.category, urgency: i.urgency
    })) || [],
    platformData: Object.keys(platformData || {}),
    personalityProfile: !!personalityScores,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers - replicate the same fetching logic from twin-chat.js
// ---------------------------------------------------------------------------

async function _fetchSoulSignature(userId) {
  const { data, error } = await supabaseAdmin
    .from('soul_signatures')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

async function _fetchPersonalityScores(userId) {
  const { data, error } = await supabaseAdmin
    .from('personality_scores')
    .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, openness_confidence, conscientiousness_confidence, extraversion_confidence, agreeableness_confidence, neuroticism_confidence, analyzed_platforms, source_type')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

async function _fetchWritingProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_writing_patterns')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return {
    communicationStyle: data.formality_score >= 60 ? 'formal' : data.formality_score >= 40 ? 'balanced' : 'casual',
    formalityScore: data.formality_score,
    usesEmojis: data.emoji_frequency > 0.5,
    asksQuestions: data.question_frequency > 0.3,
    messageLength: data.avg_message_length > 100 ? 'detailed' : data.avg_message_length > 30 ? 'moderate' : 'brief',
    vocabularyRichness: data.vocabulary_richness > 0.7 ? 'diverse' : data.vocabulary_richness > 0.5 ? 'moderate' : 'focused',
    personalityIndicators: {
      curiosity: data.curiosity_score,
      detailOrientation: data.detail_orientation,
      assertiveness: data.assertiveness_score,
    },
    commonTopics: data.common_topics,
    totalConversations: data.total_conversations,
    totalWordsAnalyzed: data.total_words_analyzed,
  };
}

/**
 * Fetch live platform data for the given platforms.
 * Replicates the same logic from twin-chat.js getPlatformData.
 */
async function _fetchPlatformData(userId, platforms) {
  const cacheKey = userId;
  const cached = platformDataCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PLATFORM_CACHE_TTL) {
    return cached.data;
  }

  const data = {};

  for (const platform of platforms) {
    try {
      if (platform === 'spotify') {
        try {
          const tokenResult = await getValidAccessToken(userId, 'spotify');
          if (tokenResult.success && tokenResult.accessToken) {
            const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

            let currentlyPlaying = null;
            try {
              const currentRes = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers });
              if (currentRes.data?.item) {
                currentlyPlaying = {
                  name: currentRes.data.item.name,
                  artist: currentRes.data.item.artists?.[0]?.name,
                  isPlaying: currentRes.data.is_playing
                };
              }
            } catch {
              // No current playback
            }

            const [recentRes, topRes] = await Promise.all([
              axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers })
            ]);

            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const recentTracks = recentRes.data?.items?.filter(item => {
              return new Date(item.played_at).getTime() > oneDayAgo;
            }).map(item => ({
              name: item.track?.name,
              artist: item.track?.artists?.[0]?.name,
              playedAt: item.played_at
            })) || [];

            data.spotify = {
              currentlyPlaying,
              recentTracks: recentTracks.slice(0, 5),
              topArtists: topRes.data?.items?.map(a => a.name) || [],
              genres: topRes.data?.items?.flatMap(a => a.genres?.slice(0, 2) || []).slice(0, 5) || [],
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (spotifyErr) {
          console.warn('[TwinContext] Spotify fetch failed:', spotifyErr.message);
        }
      }

      if (platform === 'calendar' || platform === 'google_calendar') {
        try {
          const tokenResult = await getValidAccessToken(userId, 'google_calendar');
          if (tokenResult.success && tokenResult.accessToken) {
            const now = new Date();
            const todayEnd = new Date(now);
            todayEnd.setHours(23, 59, 59, 999);
            const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            const calRes = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
              params: {
                timeMin: now.toISOString(),
                timeMax: weekFromNow.toISOString(),
                maxResults: 15,
                singleEvents: true,
                orderBy: 'startTime'
              }
            });

            const events = calRes.data?.items?.map(e => ({
              summary: e.summary,
              start: e.start?.dateTime || e.start?.date,
              isToday: new Date(e.start?.dateTime || e.start?.date) <= todayEnd
            })) || [];

            data.calendar = {
              todayEvents: events.filter(e => e.isToday).slice(0, 5),
              upcomingEvents: events.filter(e => !e.isToday).slice(0, 5),
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (calErr) {
          console.warn('[TwinContext] Calendar fetch failed:', calErr.message);
        }
      }

      if (platform === 'whoop') {
        try {
          const { data: whoopConn } = await supabaseAdmin
            .from('platform_connections')
            .select('access_token')
            .eq('user_id', userId)
            .eq('platform', 'whoop')
            .single();

          if (whoopConn?.access_token === 'NANGO_MANAGED') {
            const nangoService = await import('./nangoService.js');
            const [recoveryResult, sleepResult] = await Promise.all([
              nangoService.whoop.getRecovery(userId, 1),
              nangoService.whoop.getSleep(userId, 5)
            ]);

            const latestRecovery = recoveryResult.success ? recoveryResult.data?.records?.[0] : null;
            const allSleeps = sleepResult.success ? (sleepResult.data?.records || []) : [];

            if (latestRecovery || allSleeps.length > 0) {
              const now = new Date();
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const todaysSleeps = allSleeps.filter(s => new Date(s.end) >= yesterday);

              let totalSleepMs = 0;
              todaysSleeps.forEach(sleep => {
                const stageSummary = sleep.score?.stage_summary || {};
                totalSleepMs += sleep.score?.total_sleep_time_milli ||
                               (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0)) ||
                               stageSummary.total_in_bed_time_milli || 0;
              });

              const sleepHours = totalSleepMs / (1000 * 60 * 60);
              data.whoop = {
                recovery: latestRecovery?.score?.recovery_score || null,
                strain: latestRecovery?.score?.user_calibrating ? 'calibrating' : null,
                sleepHours: sleepHours > 0 ? sleepHours.toFixed(1) : null,
                sleepDescription: sleepHours > 0 ? `${sleepHours.toFixed(1)} hours${todaysSleeps.length > 1 ? ` (incl. ${todaysSleeps.length - 1} nap${todaysSleeps.length > 2 ? 's' : ''})` : ''}` : null,
                hrv: latestRecovery?.score?.hrv_rmssd_milli ? Math.round(latestRecovery.score.hrv_rmssd_milli) : null,
                restingHR: latestRecovery?.score?.resting_heart_rate ? Math.round(latestRecovery.score.resting_heart_rate) : null,
                fetchedAt: new Date().toISOString()
              };
            }
          } else {
            const tokenResult = await getValidAccessToken(userId, 'whoop');
            if (tokenResult.success && tokenResult.accessToken) {
              const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
              const [recoveryRes, sleepRes] = await Promise.all([
                axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers }),
                axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=5', { headers })
              ]);

              const latestRecovery = recoveryRes.data?.records?.[0];
              const allSleeps = sleepRes.data?.records || [];
              const now = new Date();
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const todaysSleeps = allSleeps.filter(s => new Date(s.end) >= yesterday);

              let totalSleepMs = 0;
              todaysSleeps.forEach(sleep => {
                const stageSummary = sleep.score?.stage_summary || {};
                totalSleepMs += sleep.score?.total_sleep_time_milli ||
                               (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0)) ||
                               stageSummary.total_in_bed_time_milli || 0;
              });

              const sleepHours = totalSleepMs / (1000 * 60 * 60);
              data.whoop = {
                recovery: latestRecovery?.score?.recovery_score || null,
                strain: latestRecovery?.score?.user_calibrating ? 'calibrating' : null,
                sleepHours: sleepHours > 0 ? sleepHours.toFixed(1) : null,
                sleepDescription: sleepHours > 0 ? `${sleepHours.toFixed(1)} hours${todaysSleeps.length > 1 ? ` (incl. ${todaysSleeps.length - 1} nap${todaysSleeps.length > 2 ? 's' : ''})` : ''}` : null,
                hrv: latestRecovery?.score?.hrv_rmssd_milli ? Math.round(latestRecovery.score.hrv_rmssd_milli) : null,
                restingHR: latestRecovery?.score?.resting_heart_rate ? Math.round(latestRecovery.score.resting_heart_rate) : null,
                fetchedAt: new Date().toISOString()
              };
            }
          }
        } catch (whoopErr) {
          console.warn('[TwinContext] Whoop fetch failed:', whoopErr.message);
        }
      }

      if (platform === 'web') {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: webEvents } = await supabaseAdmin
            .from('user_platform_data')
            .select('data_type, raw_data, created_at')
            .eq('user_id', userId)
            .eq('platform', 'web')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(25);

          if (webEvents?.length > 0) {
            const categories = {};
            const topics = {};
            const searches = [];
            const domains = {};

            for (const event of webEvents) {
              const raw = event.raw_data || {};
              const category = raw.category || raw.metadata?.category;
              if (category) categories[category] = (categories[category] || 0) + 1;

              const domain = raw.domain || raw.metadata?.domain;
              if (domain) domains[domain] = (domains[domain] || 0) + 1;

              const eventTopics = raw.topics || raw.metadata?.topics || [];
              for (const t of eventTopics) topics[t] = (topics[t] || 0) + 1;

              if (event.data_type === 'extension_search_query' && raw.query) {
                searches.push(raw.query);
              }
            }

            data.web = {
              hasExtensionData: true,
              totalEvents: webEvents.length,
              topCategories: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c),
              topTopics: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t),
              topDomains: Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d),
              recentSearches: searches.slice(0, 5),
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (webErr) {
          console.warn('[TwinContext] Web browsing fetch failed:', webErr.message);
        }
      }
    } catch (err) {
      console.warn(`[TwinContext] Error fetching ${platform} data:`, err.message);
    }
  }

  platformDataCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

export { fetchTwinContext, buildContextSourcesMeta };
