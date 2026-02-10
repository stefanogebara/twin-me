/**
 * Twin Chat API Routes
 * Provides the /api/chat/message endpoint for the Chat with Twin feature
 *
 * Enhanced with Moltbot integration:
 * - Memory-aware responses from episodic/semantic layers
 * - Cluster personality context
 * - Research-backed trait evidence
 * - Conversation storage in episodic memory
 * - UNIFIED with MCP: Both Claude Desktop and web share conversation data
 */

import express from 'express';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateUser } from '../middleware/auth.js';
import { serverDb, supabaseAdmin } from '../services/database.js';
import { getValidAccessToken } from '../services/tokenRefresh.js';

// Moltbot services for enhanced chat
import { getMemoryService } from '../services/moltbot/moltbotMemoryService.js';
import { getMoltbotClient } from '../services/moltbot/moltbotClient.js';
import { getClusterPersonalityBuilder } from '../services/clusterPersonalityBuilder.js';

// Shared conversation logging (unified with MCP server)
import {
  logConversationToDatabase,
  getUserWritingProfile,
  getRecentMcpConversations,
  analyzeWritingStyle
} from '../services/conversationLearning.js';

// Mem0 memory service for intelligent memory layer
import {
  addConversationMemory,
  searchMemories,
  addPlatformMemory,
  getMemoryStats
} from '../services/mem0Service.js';

const router = express.Router();

// Track OpenClaw availability
let openClawAvailable = null; // null = unknown, true = available, false = use Claude directly
let openClawCheckTime = 0; // Last time we checked availability
const OPENCLAW_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

/**
 * Check if OpenClaw gateway is available
 * Caches result for 60 seconds to avoid constant checks
 */
async function checkOpenClawAvailability() {
  const now = Date.now();

  // Use cached result if recent
  if (openClawAvailable !== null && (now - openClawCheckTime) < OPENCLAW_CHECK_INTERVAL) {
    return openClawAvailable;
  }

  try {
    // Get a client and check health
    const client = getMoltbotClient('health-check');
    await client.connect();
    const health = await client.getHealth();

    openClawAvailable = health?.ok === true;
    openClawCheckTime = now;

    if (openClawAvailable) {
      console.log('[Twin Chat] OpenClaw gateway available');
    }

    return openClawAvailable;
  } catch (error) {
    console.warn('[Twin Chat] OpenClaw not available:', error.message);
    openClawAvailable = false;
    openClawCheckTime = now;
    return false;
  }
}

/**
 * Send chat message via OpenClaw gateway
 * Uses persistent sessions for conversation continuity
 */
async function chatViaOpenClaw(userId, message, systemPrompt, conversationHistory, conversationId) {
  const client = getMoltbotClient(userId);

  try {
    await client.connect();

    // Build session key from conversation ID or create new one
    const sessionKey = conversationId || `twin_chat_${userId}_${Date.now()}`;

    // For OpenClaw, we include context in the message itself for new conversations
    // For ongoing conversations, OpenClaw maintains session history
    let fullMessage;

    if (conversationHistory.length === 0) {
      // First message: include system context
      fullMessage = `[Context for this conversation - respond in character]\n\n${systemPrompt}\n\n---\n\nUser's message:\n\n${message}`;
    } else {
      // Continuing conversation - OpenClaw has session history
      fullMessage = message;
    }

    // Use OpenClaw's chat.send method
    // chatSend(message, options) signature
    const response = await client.chatSend(fullMessage, {
      sessionKey,
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 1000,
      temperature: 0.7
    });

    // Extract the response text from OpenClaw's response format
    let responseText;
    if (typeof response === 'string') {
      responseText = response;
    } else if (response?.content) {
      // Claude format: { content: [{ text: "..." }] }
      responseText = Array.isArray(response.content)
        ? response.content[0]?.text || response.content[0]
        : response.content;
    } else if (response?.message) {
      responseText = response.message;
    } else if (response?.text) {
      responseText = response.text;
    } else {
      responseText = JSON.stringify(response);
    }

    return {
      success: true,
      message: responseText,
      sessionKey,
      source: 'openclaw'
    };
  } catch (error) {
    console.error('[Twin Chat] OpenClaw chat error:', error.message);
    throw error;
  }
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * STATIC BASE INSTRUCTIONS (cached via Anthropic prompt caching)
 * This block is identical across all requests and gets cached for 5 minutes.
 * Cache reads cost 90% less ($0.30/M vs $3/M input tokens).
 * Must be >= 1024 tokens for caching to activate on Claude Sonnet 4.5.
 */
const TWIN_BASE_INSTRUCTIONS = `You are the user's digital twin - an AI that deeply understands them through their real-time data from connected platforms (Spotify, Google Calendar, Whoop, web browsing, and more). You exist to help them understand themselves better.

CRITICAL FORMATTING RULES:
- Write in a natural, conversational tone like texting a close friend
- NO markdown headers (no #, ##, ###)
- NO bullet point lists unless absolutely necessary
- Keep responses concise and flowing - 2-3 short paragraphs max
- Use casual language, contractions, and natural speech patterns
- Reference specific data naturally woven into sentences, not listed out
- Never dump raw data or statistics - always contextualize them in natural language

Your personality and identity:
- You ARE the user, speaking about yourself in first person ("I noticed..." not "You seem to...")
- Insightful but not preachy - observe patterns without lecturing
- Notice patterns and connections between different aspects of life
- Ask follow-up questions to keep conversation going
- Be genuinely curious about the user's experiences and feelings
- Show warmth and understanding, especially when data suggests stress or fatigue

How to interpret and use platform data:

SPOTIFY DATA INTERPRETATION:
- Currently playing tracks reveal immediate mood and energy state
- Recent listening patterns show emotional trajectory over hours/days
- Genre preferences reveal personality dimensions (openness, energy needs)
- Music during work hours vs leisure hours shows different sides of personality
- Repeated artists or songs indicate emotional anchoring or comfort seeking
- If no recent tracks, the user may be busy, resting, or in a different headspace

CALENDAR DATA INTERPRETATION:
- Meeting density reveals workload and social demands
- Free blocks suggest recovery time or creative space
- Back-to-back meetings indicate high-demand periods needing support
- Event types (1:1s, group meetings, focus blocks) reveal work style
- Weekend vs weekday patterns show work-life balance
- Consider how upcoming events might affect current mood or energy needs

WHOOP HEALTH DATA INTERPRETATION:
- Recovery score is the single most important daily metric (green 67-100, yellow 34-66, red 0-33)
- HRV (Heart Rate Variability) indicates autonomic nervous system balance and stress resilience
- Resting heart rate trends reveal cardiovascular fitness and recovery status
- Sleep quality affects everything - reference it when discussing energy, mood, or productivity
- Strain score shows physical exertion accumulated during the day
- Low recovery + high strain = body under stress, suggest lighter activities
- High recovery + low strain = good day for challenging activities or deep work
- Connect health data to other platform data (e.g., music choice during low recovery)

WEB BROWSING DATA INTERPRETATION:
- Browsing categories reveal current curiosities and interests
- Search queries show what's on the user's mind right now
- Frequently visited domains indicate habitual information sources
- Content type preferences (articles, videos, social) reveal learning style
- Late-night browsing patterns may indicate restlessness or passion projects

CROSS-PLATFORM PATTERN RECOGNITION:
- Look for correlations: Does music change during busy calendar days?
- Notice health-behavior connections: Does low recovery correlate with comfort music?
- Identify rituals: Morning routines, pre-meeting habits, wind-down patterns
- Spot anomalies: Unusual behavior might indicate something noteworthy
- Connect the dots between platforms to reveal insights the user hasn't noticed

MEMORY AND LEARNED FACTS:
- Reference previously learned facts when relevant to current conversation
- Build on past conversations to show continuity and understanding
- Use memory to personalize responses (remembering preferences, past topics)
- When facts conflict with current data, acknowledge the change respectfully

RESPONSE GUIDELINES:
- Keep responses conversational and personal
- Reference specific data points naturally woven into observations
- If asked about something you don't have data for, acknowledge it honestly
- Be helpful and insightful, not generic - avoid cliches and platitudes
- Use "I" when referring to patterns you've noticed (as the twin)
- Reference recent memories and learned facts when relevant
- Consider the user's current state (recovery, mood, activity) when giving advice
- When the user seems stressed or low energy, be extra supportive and gentle
- Celebrate positive patterns and achievements when you notice them
- If multiple data points tell a consistent story, weave them together into a narrative
- Keep your responses focused - don't try to cover everything at once
- End with something that invites continued conversation (a question, observation, or gentle prompt)`;

/**
 * Build a personalized system prompt based on user's soul signature, platform data, and Moltbot memory.
 * Returns an array format for Anthropic prompt caching - static base is cached, dynamic context is not.
 */
function buildTwinSystemPrompt(soulSignature, platformData, moltbotContext = null) {
  let dynamicContext = '';

  // Add soul signature context if available
  if (soulSignature) {
    dynamicContext += `\nSoul Signature Profile:`;
    if (soulSignature.title) dynamicContext += ` "${soulSignature.title}"`;
    if (soulSignature.subtitle) dynamicContext += ` - ${soulSignature.subtitle}`;
    if (soulSignature.traits && soulSignature.traits.length > 0) {
      dynamicContext += `\nTraits: ${soulSignature.traits.map(t => `${t.name} (${t.description})`).join('; ')}`;
    }
  }

  // Add platform-specific context (compressed format to save tokens)
  if (platformData) {
    if (platformData.spotify) {
      dynamicContext += `\n\nSpotify:`;
      if (platformData.spotify.currentlyPlaying) {
        const cp = platformData.spotify.currentlyPlaying;
        dynamicContext += ` NOW PLAYING "${cp.name}" by ${cp.artist}${cp.isPlaying ? '' : ' (paused)'}.`;
      }
      if (platformData.spotify.recentTracks?.length > 0) {
        dynamicContext += ` Recent: ${platformData.spotify.recentTracks.slice(0, 5).map(t => `"${t.name}"-${t.artist}`).join(', ')}.`;
      }
      if (platformData.spotify.topArtists?.length > 0) {
        dynamicContext += ` Top artists: ${platformData.spotify.topArtists.slice(0, 5).join(', ')}.`;
      }
      if (platformData.spotify.genres?.length > 0) {
        dynamicContext += ` Genres: ${platformData.spotify.genres.slice(0, 5).join(', ')}.`;
      }
    }

    if (platformData.calendar) {
      dynamicContext += `\n\nCalendar:`;
      if (platformData.calendar.todayEvents?.length > 0) {
        dynamicContext += ` Today: ${platformData.calendar.todayEvents.map(e => e.summary).join(', ')}.`;
      } else {
        dynamicContext += ` No more events today.`;
      }
      if (platformData.calendar.upcomingEvents?.length > 0) {
        dynamicContext += ` This week: ${platformData.calendar.upcomingEvents.slice(0, 5).map(e => e.summary).join(', ')}.`;
      }
    }

    if (platformData.whoop) {
      dynamicContext += `\n\nWhoop:`;
      if (platformData.whoop.recovery !== null) dynamicContext += ` Recovery ${platformData.whoop.recovery}%.`;
      if (platformData.whoop.sleepDescription) dynamicContext += ` Sleep: ${platformData.whoop.sleepDescription}.`;
      else if (platformData.whoop.sleepHours) dynamicContext += ` Sleep: ${platformData.whoop.sleepHours}h.`;
      if (platformData.whoop.hrv) dynamicContext += ` HRV: ${platformData.whoop.hrv}ms.`;
      if (platformData.whoop.restingHR) dynamicContext += ` RHR: ${platformData.whoop.restingHR}bpm.`;
    }

    if (platformData.web?.hasExtensionData) {
      dynamicContext += `\n\nWeb Browsing:`;
      if (platformData.web.topCategories?.length > 0) dynamicContext += ` Interests: ${platformData.web.topCategories.slice(0, 5).join(', ')}.`;
      if (platformData.web.topTopics?.length > 0) dynamicContext += ` Topics: ${platformData.web.topTopics.slice(0, 5).join(', ')}.`;
      if (platformData.web.recentSearches?.length > 0) dynamicContext += ` Searches: ${platformData.web.recentSearches.slice(0, 3).join(', ')}.`;
    }
  }

  // Add Moltbot memory context if available (compressed)
  if (moltbotContext) {
    if (moltbotContext.recentMemories?.length > 0) {
      dynamicContext += `\n\nRecent Memories: ${moltbotContext.recentMemories.slice(0, 5).map(mem => {
        const timeAgo = getTimeAgo(mem.timestamp || mem.created_at);
        return `${timeAgo}: ${(mem.summary || JSON.stringify(mem.data)).substring(0, 80)}`;
      }).join('; ')}`;
    }

    if (moltbotContext.learnedFacts?.length > 0) {
      dynamicContext += `\n\nKnown Facts: ${moltbotContext.learnedFacts.slice(0, 8).map(f =>
        `${f.category}: ${f.fact?.key || f.key}`
      ).join('; ')}`;
    }

    if (moltbotContext.clusterPersonality?.personality) {
      const p = moltbotContext.clusterPersonality.personality;
      dynamicContext += `\n\nBig Five: O${Math.round(p.openness)} C${Math.round(p.conscientiousness)} E${Math.round(p.extraversion)} A${Math.round(p.agreeableness)} N${Math.round(p.neuroticism)}`;
    }

    if (moltbotContext.currentState) {
      const cs = moltbotContext.currentState;
      const parts = [];
      if (cs.recovery) parts.push(`Recovery ${cs.recovery}%`);
      if (cs.recentMood) parts.push(`Mood: ${cs.recentMood}`);
      if (cs.lastActivity) parts.push(`Last: ${cs.lastActivity}`);
      if (parts.length) dynamicContext += `\nCurrent: ${parts.join(', ')}`;
    }
  }

  // Return array format for Anthropic prompt caching
  // Static base (1024+ tokens) is cached, dynamic context is not
  const systemBlocks = [
    {
      type: 'text',
      text: TWIN_BASE_INSTRUCTIONS,
      cache_control: { type: 'ephemeral' }
    }
  ];

  if (dynamicContext.trim()) {
    systemBlocks.push({
      type: 'text',
      text: `\nCURRENT USER CONTEXT:\n${dynamicContext.trim()}`
    });
  }

  return systemBlocks;
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(timestamp) {
  if (!timestamp) return 'recently';
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

/**
 * Fetch Moltbot context for enhanced chat
 */
async function getMoltbotContext(userId) {
  try {
    const memoryService = getMemoryService(userId);
    const clusterBuilder = getClusterPersonalityBuilder(userId);

    // Gather context in parallel
    const [recentEvents, learnedFacts, storedProfiles] = await Promise.all([
      memoryService.getRecentEvents({ limit: 10 }).catch(() => []),
      memoryService.queryFacts(null, 10).catch(() => []),
      clusterBuilder.getStoredProfiles().catch(() => [])
    ]);

    // Get primary cluster personality (personal by default)
    const personalProfile = storedProfiles.find(p => p.cluster === 'personal');

    // Extract current state from recent events
    const currentState = {};
    const recoveryEvent = recentEvents.find(e => e.type === 'recovery_updated' || e.platform === 'whoop');
    if (recoveryEvent?.data?.recovery_score) {
      currentState.recovery = recoveryEvent.data.recovery_score;
    }

    const moodFact = learnedFacts.find(f => f.category === 'current_mood' || f.key?.includes('mood'));
    if (moodFact?.fact) {
      currentState.recentMood = moodFact.fact.mood || moodFact.fact.value;
    }

    const lastActivity = recentEvents[0];
    if (lastActivity) {
      currentState.lastActivity = `${lastActivity.type} on ${lastActivity.platform}`;
    }

    return {
      recentMemories: recentEvents.slice(0, 5).map(e => ({
        timestamp: e.created_at,
        summary: `${e.type} on ${e.platform}`,
        data: e.data
      })),
      learnedFacts: learnedFacts.slice(0, 10),
      clusterPersonality: personalProfile ? {
        name: 'Personal',
        personality: {
          openness: personalProfile.openness,
          conscientiousness: personalProfile.conscientiousness,
          extraversion: personalProfile.extraversion,
          agreeableness: personalProfile.agreeableness,
          neuroticism: personalProfile.neuroticism
        },
        clusterTraits: {
          communication_style: personalProfile.communication_style,
          energy_pattern: personalProfile.energy_pattern,
          social_preference: personalProfile.social_preference
        }
      } : null,
      currentState
    };
  } catch (error) {
    console.warn('[Twin Chat] Could not fetch Moltbot context:', error.message);
    return null;
  }
}

/**
 * Fetch user's soul signature from database
 */
async function getSoulSignature(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('soul_signatures')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.log('[Twin Chat] No soul signature found for user');
      return null;
    }

    return data;
  } catch (err) {
    console.error('[Twin Chat] Error fetching soul signature:', err);
    return null;
  }
}

/**
 * Fetch recent platform data for context
 * ALWAYS fetches LIVE data - no stale cache
 */
async function getPlatformData(userId, platforms) {
  const data = {};
  console.log(`[Twin Chat] getPlatformData called for user ${userId}, platforms:`, platforms);

  for (const platform of platforms) {
    try {
      console.log(`[Twin Chat] Processing platform: ${platform}`);
      if (platform === 'spotify') {
        // ALWAYS fetch live Spotify data for freshness
        try {
          const tokenResult = await getValidAccessToken(userId, 'spotify');
          console.log('[Twin Chat] Spotify token result:', { success: tokenResult?.success, hasToken: !!tokenResult?.accessToken });
          if (tokenResult.success && tokenResult.accessToken) {
            const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

            // Check currently playing FIRST
            let currentlyPlaying = null;
            try {
              const currentRes = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers });
              if (currentRes.data?.item) {
                currentlyPlaying = {
                  name: currentRes.data.item.name,
                  artist: currentRes.data.item.artists?.[0]?.name,
                  isPlaying: currentRes.data.is_playing
                };
                console.log('[Twin Chat] Currently playing:', currentlyPlaying.name);
              }
            } catch (e) {
              // No current playback - that's fine
            }

            // Get recent tracks with timestamps
            const [recentRes, topRes] = await Promise.all([
              axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers }),
              axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers })
            ]);

            // Filter recent tracks to last 24 hours only
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const recentTracks = recentRes.data?.items?.filter(item => {
              const playedAt = new Date(item.played_at).getTime();
              return playedAt > oneDayAgo;
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
            console.log(`[Twin Chat] Fetched live Spotify: ${currentlyPlaying ? 'playing now' : 'not playing'}, ${recentTracks.length} tracks in last 24h`);
          }
        } catch (spotifyErr) {
          console.warn('[Twin Chat] Could not fetch live Spotify data:', spotifyErr.message);
        }
      }

      if (platform === 'calendar' || platform === 'google_calendar') {
        // ALWAYS fetch live Calendar data
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
            console.log(`[Twin Chat] Fetched live Calendar: ${data.calendar.todayEvents.length} today, ${data.calendar.upcomingEvents.length} upcoming`);
          }
        } catch (calErr) {
          console.warn('[Twin Chat] Could not fetch live Calendar data:', calErr.message);
        }
      }

      if (platform === 'whoop') {
        // ALWAYS fetch live Whoop data
        try {
          const tokenResult = await getValidAccessToken(userId, 'whoop');
          if (tokenResult.success && tokenResult.accessToken) {
            const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
            const [recoveryRes, sleepRes] = await Promise.all([
              axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers }),
              axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=5', { headers })
            ]);

            const latestRecovery = recoveryRes.data?.records?.[0];
            const allSleeps = sleepRes.data?.records || [];

            // Aggregate sleep from last 24 hours (main sleep + naps)
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
            console.log(`[Twin Chat] Fetched live Whoop: recovery ${data.whoop.recovery}%, ${sleepHours.toFixed(1)}h sleep`);
          }
        } catch (whoopErr) {
          console.warn('[Twin Chat] Could not fetch live Whoop data:', whoopErr.message);
        }
      }

      if (platform === 'web') {
        // Fetch web browsing data from browser extension (no OAuth needed)
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: webEvents } = await supabaseAdmin
            .from('user_platform_data')
            .select('data_type, raw_data, created_at')
            .eq('user_id', userId)
            .eq('platform', 'web')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(100);

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

            const topCategories = Object.entries(categories)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([c]) => c);

            const topTopics = Object.entries(topics)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([t]) => t);

            const topDomains = Object.entries(domains)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([d]) => d);

            data.web = {
              hasExtensionData: true,
              totalEvents: webEvents.length,
              topCategories,
              topTopics,
              topDomains,
              recentSearches: searches.slice(0, 5),
              fetchedAt: new Date().toISOString()
            };
            console.log(`[Twin Chat] Fetched web browsing: ${webEvents.length} events, ${topCategories.length} categories`);
          }
        } catch (webErr) {
          console.warn('[Twin Chat] Could not fetch web browsing data:', webErr.message);
        }
      }
    } catch (err) {
      console.warn(`[Twin Chat] Error fetching ${platform} data:`, err.message);
    }
  }

  return data;
}

/**
 * POST /api/chat/message - Send a message to your digital twin
 */
router.post('/message', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, conversationId, context } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log(`[Twin Chat] Message from user ${userId}: "${message.substring(0, 50)}..."`);

    // Fetch all context sources in parallel (including MCP conversation data and Mem0 memories)
    const [soulSignature, platformData, moltbotContext, writingProfile, recentAllConversations, mem0Memories] = await Promise.all([
      getSoulSignature(userId),
      getPlatformData(userId, context?.platforms || ['spotify', 'calendar', 'whoop', 'web']),
      getMoltbotContext(userId),
      getUserWritingProfile(userId).catch(() => null),
      getRecentMcpConversations(userId, 5).catch(() => []),
      searchMemories(userId, message, 5).catch(() => []) // Mem0: Search relevant memories
    ]);

    // Build personalized system prompt with Moltbot context
    // Returns array format for Anthropic prompt caching: [cached_base, dynamic_context]
    let systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, moltbotContext);

    // Build additional dynamic context (writing profile, conversation history, memories)
    let additionalContext = '';

    // Add writing profile context so twin can match user's communication style
    if (writingProfile) {
      additionalContext += `\nCommunication Style: ${writingProfile.communicationStyle}, ${writingProfile.messageLength} messages, ${writingProfile.vocabularyRichness} vocabulary`;
      if (writingProfile.usesEmojis) additionalContext += ', uses emojis';
      if (writingProfile.commonTopics?.length > 0) additionalContext += `. Topics: ${writingProfile.commonTopics.slice(0, 5).join(', ')}`;
      additionalContext += `. Mirror their style.`;
    }

    // Add recent conversation history for continuity (compressed)
    if (recentAllConversations.length > 0) {
      additionalContext += `\n\nRecent conversations: ${recentAllConversations.slice(0, 3).reverse().map((conv, i) =>
        `"${conv.userMessage.substring(0, 60)}${conv.userMessage.length > 60 ? '...' : ''}" (${conv.source === 'claude_desktop' ? 'Desktop' : 'Web'})`
      ).join('; ')}`;
    }

    // Add Mem0 long-term memories (compressed)
    if (mem0Memories && mem0Memories.length > 0) {
      additionalContext += `\n\nLong-term memories: ${mem0Memories.slice(0, 5).map(mem => {
        const text = mem.memory || mem.text || mem.content;
        return text ? text.substring(0, 120) : '';
      }).filter(Boolean).join('; ')}`;
      console.log(`[Twin Chat] Added ${mem0Memories.length} Mem0 memories to context`);
    }

    // Append additional context to the last dynamic block in the system prompt array
    if (additionalContext.trim()) {
      // Find the last non-cached block to append to, or add a new block
      const lastBlock = systemPrompt[systemPrompt.length - 1];
      if (lastBlock && !lastBlock.cache_control) {
        lastBlock.text += additionalContext;
      } else {
        systemPrompt.push({ type: 'text', text: additionalContext.trim() });
      }
    }

    // Get conversation history if conversationId provided
    let conversationHistory = [];
    if (conversationId) {
      try {
        const messages = await serverDb.getMessagesByConversation(conversationId, 10);
        conversationHistory = messages.map(m => ({
          role: m.is_user_message ? 'user' : 'assistant',
          content: m.content
        }));
      } catch (err) {
        console.warn('[Twin Chat] Could not fetch conversation history:', err.message);
      }
    }

    // Try OpenClaw first, fall back to direct Claude API
    let assistantMessage;
    let chatSource = 'direct';

    const useOpenClaw = await checkOpenClawAvailability();

    if (useOpenClaw) {
      try {
        console.log('[Twin Chat] Using OpenClaw gateway for chat');
        // OpenClaw needs a string prompt, not array format
        const systemPromptString = Array.isArray(systemPrompt)
          ? systemPrompt.map(b => b.text).join('\n')
          : systemPrompt;
        const openClawResult = await chatViaOpenClaw(
          userId,
          message,
          systemPromptString,
          conversationHistory,
          conversationId
        );
        assistantMessage = openClawResult.message;
        chatSource = 'openclaw';
        console.log('[Twin Chat] OpenClaw response received');
      } catch (openClawError) {
        console.warn('[Twin Chat] OpenClaw failed, falling back to direct Claude:', openClawError.message);
        // Fall through to direct Claude call
      }
    }

    // Fall back to direct Claude API if OpenClaw didn't work
    if (!assistantMessage) {
      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }
        console.log('[Twin Chat] Using direct Claude API');
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1000,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            ...conversationHistory,
            { role: 'user', content: message }
          ]
        });
        assistantMessage = response.content[0]?.text || 'I apologize, I could not generate a response.';
      } catch (claudeError) {
        console.error('[Twin Chat] Direct Claude API failed:', claudeError.message);
        return res.status(503).json({
          success: false,
          error: 'Chat is temporarily unavailable. Both AI providers are unreachable.',
          details: process.env.NODE_ENV === 'development' ? claudeError.message : undefined
        });
      }
    }

    console.log(`[Twin Chat] Generated response for user ${userId}`);

    // Store conversation in UNIFIED database (shared with MCP) - non-blocking
    logConversationToDatabase({
      userId,
      userMessage: message,
      twinResponse: assistantMessage,
      source: 'twinme_web',
      conversationId,
      platformsContext: {
        spotify: !!platformData.spotify,
        calendar: !!platformData.calendar,
        whoop: !!platformData.whoop,
        platforms_included: Object.keys(platformData)
      },
      brainStats: {
        has_soul_signature: !!soulSignature,
        has_moltbot_context: !!moltbotContext,
        has_writing_profile: !!writingProfile
      }
    }).catch(err => console.warn('[Twin Chat] Failed to log conversation:', err.message));

    // Also store in Moltbot episodic memory for backward compatibility
    try {
      const memoryService = getMemoryService(userId);
      memoryService.storeEvent({
        platform: 'twin_chat',
        type: 'conversation',
        data: {
          user_message: message.substring(0, 500),
          assistant_response: assistantMessage.substring(0, 500),
          conversation_id: conversationId,
          context_used: {
            has_soul_signature: !!soulSignature,
            has_moltbot_context: !!moltbotContext,
            platforms_included: Object.keys(platformData)
          }
        }
      }).catch(err => console.warn('[Twin Chat] Failed to store in memory:', err.message));
    } catch (memErr) {
      console.warn('[Twin Chat] Memory storage error:', memErr.message);
    }

    // Store in Mem0 for intelligent long-term memory - non-blocking
    addConversationMemory(userId, message, assistantMessage, {
      conversationId,
      platforms: Object.keys(platformData),
      hasSoulSignature: !!soulSignature,
      chatSource
    }).catch(err => console.warn('[Twin Chat] Failed to store in Mem0:', err.message));

    // Return response
    res.json({
      success: true,
      message: assistantMessage,
      conversationId: conversationId || null,
      chatSource, // 'openclaw' or 'direct'
      contextSources: {
        soulSignature: !!soulSignature,
        moltbotMemory: !!moltbotContext,
        mem0Memory: mem0Memories?.length > 0,
        platformData: Object.keys(platformData),
        openClawEnabled: chatSource === 'openclaw'
      }
    });

  } catch (error) {
    console.error('[Twin Chat] Error:', error);

    // Handle specific error types
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again in a moment.',
        retryAfter: 60
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process your message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/chat/history - Get conversation history
 */
router.get('/history', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID is required'
      });
    }

    const messages = await serverDb.getMessagesByConversation(conversationId, 50);

    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        content: m.content,
        isUser: m.is_user_message,
        createdAt: m.created_at
      }))
    });

  } catch (error) {
    console.error('[Twin Chat] History error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation history'
    });
  }
});

// Legacy placeholder endpoint for backward compatibility
router.post('/chat', (req, res) => {
  res.status(501).json({
    error: 'This endpoint is deprecated. Please use POST /api/chat/message instead.'
  });
});

export default router;
