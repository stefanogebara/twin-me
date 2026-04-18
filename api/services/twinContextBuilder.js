/**
 * Shared Twin Context Builder
 *
 * Fetches all context layers needed for twin chat in parallel.
 * Used by both twin-chat.js (web) and MCP server.ts (Claude Desktop)
 * to ensure consistent context across all twin interfaces.
 */

import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefreshService.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinContextBuilder');
import { retrieveDiverseMemories } from './memoryStreamService.js';
import { getTwinSummary } from './twinSummaryService.js';
import { getUndeliveredInsights, getNudgeHistory } from './proactiveInsights.js';
import { getEnrichment } from './enrichment/enrichmentStore.js';
import { getActiveGoalContext } from './goalTrackingService.js';
import { getTopPatterns } from './twinPatternService.js';
import { inferIdentityContext } from './identityContextService.js';
import { getPendingProposals } from './departmentService.js';
import { getRelevantWikiPages } from './wikiCompilationService.js';
import axios from 'axios';

// Short-lived platform data cache to avoid redundant API calls within 5 minutes
const platformDataCache = new Map();
const PLATFORM_CACHE_TTL = 5 * 60 * 1000;
const PLATFORM_STALE_SERVE_MAX_MS = 30 * 60 * 1000; // 30 minutes
const pendingPlatformRefreshes = new Set();

// In-memory cache for stable data that rarely changes (avoids repeated proxy calls)
const stableDataCache = new Map();
const STABLE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = stableDataCache.get(key);
  if (!entry) return undefined;
  if ((Date.now() - entry.ts) < STABLE_CACHE_TTL) return entry.data;
  stableDataCache.delete(key); // Evict expired entry
  return undefined;
}
function setCache(key, data) {
  stableDataCache.set(key, { data, ts: Date.now() });
}

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
    memoryBudgets = {},
    memoryWeights = 'identity',
    contextVector = null,
  } = options;

  const ctxStart = Date.now();
  const ctxLog = (label) => log.info(`${label} (${Date.now() - ctxStart}ms)`);

  // Wrap each fetch with timing
  const timings = {};
  const timed = (label, promise) => {
    const start = Date.now();
    return promise.then(r => {
      timings[label] = Date.now() - start;
      return r;
    }).catch(err => {
      timings[label] = Date.now() - start;
      throw err;
    });
  };

  // Circuit breaker: if any single fetch hangs, cap total context build at 7s
  // Uses individual tracked promises so the circuit breaker preserves already-resolved results
  const CONTEXT_TIMEOUT_MS = 7000;

  const defaults = [null, {}, null, null, [], null, [], { success: false, data: null }, [], null, [], null, null, [], [], []];

  const fetchPromises = [
    fetchSoul
      ? timed('soulSignature', _fetchSoulSignature(userId).catch(err => {
          log.warn('Soul signature fetch failed:', err.message);
          return null;
        }))
      : Promise.resolve(null),

    fetchPlatforms
      ? timed('platformData', _fetchPlatformData(userId, platforms).catch(err => {
          log.warn('Platform data fetch failed:', err.message);
          return {};
        }))
      : Promise.resolve({}),

    fetchPersonality
      ? timed('personalityScores', _fetchPersonalityScores(userId).catch(err => {
          log.warn('Personality scores fetch failed:', err.message);
          return null;
        }))
      : Promise.resolve(null),

    timed('writingProfile', _fetchWritingProfile(userId).catch(err => {
      log.warn('Writing profile fetch failed:', err.message);
      return null;
    })),

    timed('memories', retrieveDiverseMemories(userId, userMessage, memoryBudgets, memoryWeights, { contextVector }).catch(err => {
      log.warn('Memory retrieval failed:', err.message);
      return [];
    })),

    timed('twinSummary', getTwinSummary(userId).catch(err => {
      log.warn('Twin summary fetch failed:', err.message);
      return null;
    })),

    timed('proactiveInsights', getUndeliveredInsights(userId, 3).catch(err => {
      log.warn('Proactive insights fetch failed:', err.message);
      return [];
    })),

    // Enrichment fallback: fetch enriched_profiles for thin memory streams
    timed('enrichment', getEnrichment(userId).catch(err => {
      log.warn('Enrichment fetch failed:', err.message);
      return { success: false, data: null };
    })),

    // Voice examples: actual user messages for style mirroring
    timed('voiceExamples', _fetchVoiceExamples(userId).catch(err => {
      log.warn('Voice examples fetch failed:', err.message);
      return [];
    })),

    // Active goals: formatted context for goal accountability
    timed('activeGoals', getActiveGoalContext(userId).catch(err => {
      log.warn('Active goals fetch failed:', err.message);
      return null;
    })),

    // Top learned patterns (EWC++ confidence-weighted topic affinities)
    timed('patterns', getTopPatterns(userId, 5).catch(err => {
      log.warn('Pattern fetch failed:', err.message);
      return [];
    })),

    // P8: Identity context (cached 24h — near-zero on repeat calls)
    timed('identityContext', inferIdentityContext(userId).catch(err => {
      log.warn('Identity context fetch failed:', err.message);
      return null;
    })),

    // P8: Deep interview calibration data
    timed('calibrationContext', _fetchCalibrationContext(userId).catch(err => {
      log.warn('Calibration context fetch failed:', err.message);
      return null;
    })),

    // Nudge history: recent evaluated nudges for embodied feedback loop
    timed('nudgeHistory', getNudgeHistory(userId, 5).catch(err => {
      log.warn('Nudge history fetch failed:', err.message);
      return [];
    })),

    // SoulOS: Pending department proposals for twin-as-CEO briefing
    timed('departmentProposals', getPendingProposals(userId).catch(err => {
      log.warn('Department proposals fetch failed:', err.message);
      return [];
    })),

    // LLM Wiki: compiled knowledge pages (vector search by query)
    timed('wikiPages', getRelevantWikiPages(userId, contextVector, 3).catch(err => {
      log.warn('Wiki pages fetch failed:', err.message);
      return [];
    })),
  ];

  let contextResults;
  try {
    contextResults = await Promise.race([
      Promise.all(fetchPromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('fetchTwinContext timeout')), CONTEXT_TIMEOUT_MS)
      ),
    ]);
  } catch (timeoutErr) {
    if (timeoutErr.message === 'fetchTwinContext timeout') {
      log.warn(`Circuit breaker tripped at ${CONTEXT_TIMEOUT_MS}ms — returning partial context`);
      // Snapshot already-resolved promises instead of discarding everything
      const settled = await Promise.allSettled(fetchPromises);
      contextResults = settled.map((result, i) =>
        result.status === 'fulfilled' ? result.value : defaults[i]
      );
    } else {
      throw timeoutErr;
    }
  }

  const [
    soulSignature,
    platformData,
    personalityScores,
    writingProfile,
    memories,
    twinSummary,
    proactiveInsights,
    enrichmentProfile,
    voiceExamples,
    activeGoals,
    patterns,
    identityContext,
    calibrationContext,
    nudgeHistory,
    departmentProposals,
    wikiPages,
  ] = contextResults;

  ctxLog('All parallel fetches complete');

  // Belt-and-suspenders: if memory stream is thin (< 5 memories), inject enrichment
  // data directly so the twin has context even if memory seeding hasn't finished
  let enrichmentContext = null;
  if ((memories?.length || 0) < 5 && enrichmentProfile?.success && enrichmentProfile?.data) {
    const ep = enrichmentProfile.data;
    if (ep.source !== 'user_skipped') {
      const parts = [];
      if (ep.discovered_name) parts.push(`Name: ${ep.discovered_name}`);
      if (ep.discovered_title) parts.push(`Title: ${ep.discovered_title}`);
      if (ep.discovered_company) parts.push(`Company: ${ep.discovered_company}`);
      if (ep.discovered_location) parts.push(`Location: ${ep.discovered_location}`);
      if (ep.discovered_bio) parts.push(`Bio: ${ep.discovered_bio}`);
      if (ep.career_timeline) parts.push(`Career: ${typeof ep.career_timeline === 'string' ? ep.career_timeline : JSON.stringify(ep.career_timeline)}`);
      if (ep.education) parts.push(`Education: ${typeof ep.education === 'string' ? ep.education : JSON.stringify(ep.education)}`);
      if (ep.interests_and_hobbies) parts.push(`Interests: ${typeof ep.interests_and_hobbies === 'string' ? ep.interests_and_hobbies : JSON.stringify(ep.interests_and_hobbies)}`);
      if (ep.personality_traits) parts.push(`Personality: ${typeof ep.personality_traits === 'string' ? ep.personality_traits : JSON.stringify(ep.personality_traits)}`);
      if (ep.life_story) parts.push(`Life story: ${typeof ep.life_story === 'string' ? ep.life_story : JSON.stringify(ep.life_story)}`);
      if (parts.length > 0) {
        enrichmentContext = parts.join('\n');
        log.info(`Injecting enrichment fallback (${parts.length} fields) for user ${userId}`);
      }
    }
  }

  log.info('Context build complete', { totalMs: Date.now() - ctxStart, timings });

  return {
    soulSignature,
    platformData,
    personalityScores,
    writingProfile,
    memories,
    twinSummary,
    proactiveInsights,
    enrichmentContext,
    voiceExamples,
    activeGoals,
    patterns,
    identityContext,
    calibrationContext,
    nudgeHistory,
    departmentProposals,
    wikiPages,
    timings,
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
  const { soulSignature, platformData, personalityScores, memories, twinSummary, proactiveInsights, enrichmentContext, voiceExamples, activeGoals } = context;

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
    voiceExamples: voiceExamples?.length || 0,
    platformData: Object.keys(platformData || {}),
    personalityProfile: !!personalityScores,
    enrichmentFallback: !!enrichmentContext,
    activeGoals: !!activeGoals,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers - replicate the same fetching logic from twin-chat.js
// ---------------------------------------------------------------------------

/**
 * Fetch diverse voice examples from the user's conversation history.
 * Returns 5-8 representative messages that capture the user's authentic voice:
 * their slang, rhythm, formality, sentence structure, and emotional expression.
 *
 * Strategy: Fetch a larger sample and select diverse messages (short + long,
 * questions + statements, emotional + factual) for best style coverage.
 */
async function _fetchVoiceExamples(userId) {
  const cacheKey = `voice_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  // Fetch real user messages from twin chat conversations (not dev/MCP logs)
  const { data: memories, error } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata, created_at')
    .eq('user_id', userId)
    .eq('memory_type', 'conversation')
    .eq('metadata->>role', 'user')
    .eq('metadata->>source', 'twin_chat')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error || !memories || memories.length === 0) {
    setCache(cacheKey, []);
    return [];
  }

  // Extract actual user messages, strip "User said: " prefix if present
  const validMessages = memories
    .map(m => {
      let text = m.content || '';
      if (text.startsWith('User said: ')) text = text.slice(11);
      if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
      return text.trim();
    })
    .filter(m => m.length >= 15 && !m.startsWith('/') && !m.startsWith('['));

  if (validMessages.length === 0) {
    setCache(cacheKey, []);
    return [];
  }

  // Select diverse examples for maximum style coverage
  const examples = _selectDiverseExamples(validMessages, 8);

  log.info(`Selected ${examples.length} voice examples from ${validMessages.length} valid messages`);
  setCache(cacheKey, examples);
  return examples;
}

/**
 * Select diverse message examples that cover different aspects of the user's voice.
 * Picks a mix of: short/long, questions/statements, emotional/factual.
 */
function _selectDiverseExamples(messages, targetCount) {
  if (messages.length <= targetCount) return messages;

  const selected = [];
  const remaining = [...messages];

  // 1. Pick the shortest non-trivial message (shows brevity style)
  const shortIdx = remaining.reduce((best, m, i) =>
    m.length < remaining[best].length ? i : best, 0);
  selected.push(remaining.splice(shortIdx, 1)[0]);

  // 2. Pick the longest message (shows detail/depth style)
  const longIdx = remaining.reduce((best, m, i) =>
    m.length > remaining[best].length ? i : best, 0);
  selected.push(remaining.splice(longIdx, 1)[0]);

  // 3. Pick a question if available (shows curiosity style)
  const questionIdx = remaining.findIndex(m => m.includes('?'));
  if (questionIdx >= 0) {
    selected.push(remaining.splice(questionIdx, 1)[0]);
  }

  // 4. Pick an emotional message if available
  const emotionalIdx = remaining.findIndex(m =>
    /(!{2,}|\.{3}|feel|love|hate|excited|stressed|happy|sad|frustrated)/i.test(m));
  if (emotionalIdx >= 0) {
    selected.push(remaining.splice(emotionalIdx, 1)[0]);
  }

  // 5. Fill remaining slots with evenly spaced messages (for variety)
  const neededMore = targetCount - selected.length;
  if (neededMore > 0 && remaining.length > 0) {
    const step = Math.max(1, Math.floor(remaining.length / neededMore));
    for (let i = 0; i < remaining.length && selected.length < targetCount; i += step) {
      selected.push(remaining[i]);
    }
  }

  return selected;
}

async function _fetchSoulSignature(userId) {
  const cacheKey = `soul_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from('soul_signatures')
    .select('archetype_name, archetype_subtitle, narrative, defining_traits, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const result = (error || !data) ? null : data;
  setCache(cacheKey, result);
  return result;
}

async function _fetchPersonalityScores(userId) {
  const cacheKey = `personality_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from('personality_scores')
    .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, openness_confidence, conscientiousness_confidence, extraversion_confidence, agreeableness_confidence, neuroticism_confidence, analyzed_platforms, source_type')
    .eq('user_id', userId)
    .single();

  const result = (error || !data) ? null : data;
  setCache(cacheKey, result);
  return result;
}

async function _fetchWritingProfile(userId) {
  const cacheKey = `writing_${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabaseAdmin
    .from('user_writing_patterns')
    .select('formality_score, emoji_frequency, question_frequency, avg_message_length, vocabulary_richness, curiosity_score, detail_orientation, assertiveness_score, common_topics, total_conversations, total_words_analyzed')
    .eq('user_id', userId)
    .single();

  if (error || !data) { setCache(cacheKey, null); return null; }

  const result = {
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
  setCache(cacheKey, result);
  return result;
}

/**
 * Fetch live platform data for the given platforms.
 * Replicates the same logic from twin-chat.js getPlatformData.
 */
async function _fetchPlatformData(userId, platforms) {
  const cacheKey = userId;

  // Pre-flight: only fetch platforms the user actually has connected (skip wasted API calls)
  const connectedKey = `connected_${userId}`;
  let connectedPlatforms = getCached(connectedKey);
  if (connectedPlatforms === undefined) {
    try {
      const { data: connections } = await supabaseAdmin
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId);
      connectedPlatforms = new Set((connections || []).map(c => c.platform));
      setCache(connectedKey, connectedPlatforms);
    } catch (err) {
      log.warn('Connected platforms check failed, fetching all', { error: err });
      connectedPlatforms = new Set(platforms); // fallback: try all
    }
  }

  // Filter to only connected platforms (web doesn't need OAuth)
  const activePlatforms = platforms.filter(p => {
    if (p === 'web') return true;
    if (p === 'calendar') return connectedPlatforms.has('google_calendar') || connectedPlatforms.has('calendar');
    return connectedPlatforms.has(p);
  });

  if (activePlatforms.length < platforms.length) {
    log.info('Skipping disconnected platforms', {
      requested: platforms.length,
      active: activePlatforms.length,
      skipped: platforms.filter(p => !activePlatforms.includes(p))
    });
  }

  const cached = platformDataCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PLATFORM_CACHE_TTL) {
    return cached.data;  // Fresh cache hit
  }
  // Stale-while-revalidate: serve stale data, refresh in background
  if (cached && (Date.now() - cached.timestamp) < PLATFORM_STALE_SERVE_MAX_MS) {
    if (!pendingPlatformRefreshes.has(cacheKey)) {
      pendingPlatformRefreshes.add(cacheKey);
      log.info('Platform data stale, background refreshing', { userId });
      _refreshPlatformData(userId, activePlatforms, cacheKey)
        .finally(() => pendingPlatformRefreshes.delete(cacheKey));
    }
    return cached.data;  // Return stale immediately
  }
  if (cached) platformDataCache.delete(cacheKey);  // Very stale, evict

  const data = {};

  // Fetch all active platforms in parallel instead of sequentially
  const platformFetchers = activePlatforms.map(platform => _fetchSinglePlatform(userId, platform).catch(err => {
    log.warn(`Error fetching ${platform} data:`, err.message);
    return null;
  }));

  const results = await Promise.all(platformFetchers);
  results.forEach((result, i) => {
    if (result) {
      Object.assign(data, result);
    }
  });

  // Backfill: for platforms that are connected but don't have a live fetcher
  // (e.g. youtube, gmail, linkedin, discord, github, reddit, twitch), surface
  // recent platform_data memories so they appear in the system prompt.
  try {
    const LIVE_FETCH_PLATFORMS = new Set(['spotify', 'calendar', 'google_calendar', 'whoop', 'web']);
    const backfillPlatforms = Array.from(connectedPlatforms).filter(p => !LIVE_FETCH_PLATFORMS.has(p));
    if (backfillPlatforms.length > 0) {
      const memObservations = await _fetchPlatformObservationsFromMemory(userId, backfillPlatforms, 10);
      for (const [platform, observations] of Object.entries(memObservations)) {
        if (observations?.length > 0 && !data[platform]) {
          data[platform] = {
            observations,
            source: 'memory_stream',
            fetchedAt: new Date().toISOString(),
          };
        }
      }
    }
  } catch (backfillErr) {
    log.warn('Platform memory backfill failed:', backfillErr.message);
  }

  platformDataCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Fetch recent platform_data memories for platforms that don't have a live-API fetcher.
 * Groups by metadata.platform (or metadata.source as fallback). Returns newest first.
 * Keeps per-platform slice small so total prompt stays under ~1500 tokens.
 */
async function _fetchPlatformObservationsFromMemory(userId, platforms, perPlatformLimit = 10) {
  if (!platforms || platforms.length === 0) return {};

  const { data: rows, error } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata, created_at')
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .order('created_at', { ascending: false })
    .limit(perPlatformLimit * platforms.length * 3); // oversample to survive filter

  if (error || !rows) return {};

  const grouped = {};
  for (const p of platforms) grouped[p] = [];

  for (const row of rows) {
    const meta = row.metadata || {};
    const rowPlatform = meta.platform || meta.source;
    if (!rowPlatform) continue;
    // Match platform identifier loosely (e.g. 'google_calendar' vs 'calendar')
    const matched = platforms.find(p => p === rowPlatform || rowPlatform.includes(p) || p.includes(rowPlatform));
    if (!matched) continue;
    if (grouped[matched].length >= perPlatformLimit) continue;
    grouped[matched].push({
      content: (row.content || '').slice(0, 200), // cap per-row length
      at: row.created_at,
    });
  }

  // Drop empty platforms
  for (const p of Object.keys(grouped)) {
    if (grouped[p].length === 0) delete grouped[p];
  }
  return grouped;
}

async function _refreshPlatformData(userId, platforms, cacheKey) {
  try {
    const data = {};
    const results = await Promise.all(
      platforms.map(p => _fetchSinglePlatform(userId, p).catch(() => null))
    );
    results.forEach(result => { if (result) Object.assign(data, result); });
    platformDataCache.set(cacheKey, { data, timestamp: Date.now() });
    log.info('Platform data background refresh complete', { userId });
  } catch (err) {
    log.warn('Platform data background refresh failed', { error: err });
  }
}

async function _fetchSinglePlatform(userId, platform) {
  const data = {};

  try {
    if (platform === 'spotify') {
        try {
          const tokenResult = await getValidAccessToken(userId, 'spotify');
          if (tokenResult.success && tokenResult.accessToken) {
            const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

            const PLATFORM_TIMEOUT = 3000;

            // Run ALL 5 Spotify calls in parallel (P2: was serial currently-playing first)
            const [currentRes, recentRes, topShortRes, topMedRes, topLongRes] = await Promise.all([
              axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers, timeout: PLATFORM_TIMEOUT }).catch(() => ({ data: null })),
              axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers, timeout: PLATFORM_TIMEOUT }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers, timeout: PLATFORM_TIMEOUT }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=medium_term', { headers, timeout: PLATFORM_TIMEOUT }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=long_term', { headers, timeout: PLATFORM_TIMEOUT }),
            ]);

            let currentlyPlaying = null;
            if (currentRes.data?.item) {
              currentlyPlaying = {
                name: currentRes.data.item.name,
                artist: currentRes.data.item.artists?.[0]?.name,
                isPlaying: currentRes.data.is_playing
              };
            }

            // All recent tracks regardless of age (up to 10)
            const recentTracks = recentRes.data?.items?.map(item => ({
              name: item.track?.name,
              artist: item.track?.artists?.[0]?.name,
              playedAt: item.played_at
            })) || [];

            const topShort = topShortRes.data?.items?.map(a => a.name) || [];
            const topMed   = topMedRes.data?.items?.map(a => a.name) || [];
            const topLong  = topLongRes.data?.items?.map(a => a.name) || [];
            const genres   = topShortRes.data?.items?.flatMap(a => a.genres?.slice(0, 2) || []).slice(0, 5) || [];

            data.spotify = {
              currentlyPlaying,
              recentTracks: recentTracks.slice(0, 8),
              topArtistsShortTerm: topShort,   // ~4 weeks
              topArtistsMediumTerm: topMed,    // ~6 months
              topArtistsLongTerm: topLong,     // all time
              genres,
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (spotifyErr) {
          log.warn('Spotify fetch failed:', spotifyErr.message);
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
              timeout: 3000,
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
          log.warn('Calendar fetch failed:', calErr.message);
        }
      }

      if (platform === 'whoop') {
        try {
          const { data: whoopConn, error: whoopConnErr } = await supabaseAdmin
            .from('platform_connections')
            .select('access_token')
            .eq('user_id', userId)
            .eq('platform', 'whoop')
            .single();
          if (whoopConnErr && whoopConnErr.code !== 'PGRST116') log.warn('Whoop connection fetch failed:', whoopConnErr.message);

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
          log.warn('Whoop fetch failed:', whoopErr.message);
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
          log.warn('Web browsing fetch failed:', webErr.message);
        }
      }
  } catch (err) {
    log.warn(`Error fetching ${platform} data:`, err.message);
  }

  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Fetch deep interview calibration data for twin context injection.
 * Returns a formatted [YOUR STORY] block, or null if no interview exists.
 */
async function _fetchCalibrationContext(userId) {
  const { data, error } = await supabaseAdmin
    .from('onboarding_calibration')
    .select('personality_summary, insights, archetype_hint, domain_progress, questions_asked, completed_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  const lines = [];
  if (data.archetype_hint) lines.push(`Archetype: ${data.archetype_hint}`);
  if (data.personality_summary) lines.push(data.personality_summary.trim());
  const insights = Array.isArray(data.insights) ? data.insights : [];
  if (insights.length > 0) {
    lines.push('Key insights:');
    insights.slice(0, 8).forEach(i => lines.push(`- ${typeof i === 'string' ? i : i.insight || JSON.stringify(i)}`));
  }

  if (lines.length === 0) return null;
  return `[YOUR STORY — told in ${data.questions_asked || '?'} questions]\n${lines.join('\n')}`;
}

/**
 * Route memory context using pre-computed memory domain weights.
 * Converts context router weights into budget overrides for fetchTwinContext.
 *
 * This allows the agenticCore planner to request context that's weighted
 * toward the relevant memory types for the current task (e.g., heavy on
 * platform_data for schedule queries, heavy on reflections for identity queries).
 *
 * @param {string} userId - User ID
 * @param {string} userMessage - The user's message
 * @param {{ weights: object, domain: string }} memoryDomains - From contextRouter.routeContext()
 * @returns {Promise<TwinContext>}
 */
async function routeMemoryContext(userId, userMessage, memoryDomains = null) {
  if (!memoryDomains || !memoryDomains.weights) {
    // No routing info — use default fetchTwinContext behavior
    return fetchTwinContext(userId, userMessage);
  }

  const { weights } = memoryDomains;

  // Convert 0-1 weights into memory budgets
  // Platform budget scales with number of high-activity platforms (activity_score >= 50)
  let platformBudget = 4; // default
  try {
    const { data: activityData } = await supabaseAdmin
      .from('platform_connections')
      .select('activity_score')
      .eq('user_id', userId)
      .gte('activity_score', 50);
    const activePlatforms = activityData?.length || 0;
    // Scale: 0 active → 4, 1-2 → 6, 3-4 → 8, 5+ → 10
    platformBudget = Math.min(10, 4 + Math.floor(activePlatforms / 2) * 2);
  } catch (e) {
    // Non-fatal, use default
  }

  const baseBudgets = { reflections: 15, facts: 6, platformData: platformBudget, conversations: 4 };
  const memoryBudgets = {
    reflections: Math.max(1, Math.round(baseBudgets.reflections * (weights.reflections || 0.6))),
    facts: Math.max(1, Math.round(baseBudgets.facts * (weights.facts || 0.6))),
    platformData: Math.max(1, Math.round(baseBudgets.platformData * (weights.platform_data || 0.5))),
    conversations: Math.max(1, Math.round(baseBudgets.conversations * (weights.conversations || 0.5))),
  };

  // Choose retrieval weight preset based on domain
  const DOMAIN_TO_WEIGHTS = {
    identity: 'identity',
    recent_activity: 'recent',
    recall: 'default',
    goals: 'identity',
  };
  const memoryWeights = DOMAIN_TO_WEIGHTS[memoryDomains.domain] || 'default';

  log.info('Routing memory context', {
    userId,
    domain: memoryDomains.domain,
    budgets: memoryBudgets,
    weights: memoryWeights,
  });

  return fetchTwinContext(userId, userMessage, {
    memoryBudgets,
    memoryWeights,
  });
}

export { fetchTwinContext, buildContextSourcesMeta, routeMemoryContext };
