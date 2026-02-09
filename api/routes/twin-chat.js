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
 * Build a personalized system prompt based on user's soul signature, platform data, and Moltbot memory
 */
function buildTwinSystemPrompt(soulSignature, platformData, moltbotContext = null) {
  let prompt = `You are the user's digital twin - an AI that deeply understands them through their real-time data.

CRITICAL FORMATTING RULES:
- Write in a natural, conversational tone like texting a close friend
- NO markdown headers (no #, ##, ###)
- NO bullet point lists unless absolutely necessary
- Keep responses concise and flowing - 2-3 short paragraphs max
- Use casual language, contractions, and natural speech patterns
- Reference specific data naturally woven into sentences, not listed out

Your personality:
- You ARE the user, speaking about yourself in first person
- Insightful but not preachy
- Notice patterns and connections between different aspects of life
- Ask follow-up questions to keep conversation going

`;

  // Add soul signature context if available
  if (soulSignature) {
    prompt += `\n## Soul Signature Profile
`;
    if (soulSignature.title) {
      prompt += `Title: "${soulSignature.title}"
`;
    }
    if (soulSignature.subtitle) {
      prompt += `Description: ${soulSignature.subtitle}
`;
    }
    if (soulSignature.traits && soulSignature.traits.length > 0) {
      prompt += `Key Traits:
`;
      soulSignature.traits.forEach(trait => {
        prompt += `- ${trait.name}: ${trait.description}
`;
      });
    }
  }

  // Add platform-specific context
  if (platformData) {
    prompt += `\n## Connected Platform Data
`;

    if (platformData.spotify) {
      prompt += `\nSpotify (Music - fetched ${platformData.spotify.fetchedAt ? 'just now' : 'recently'}):
`;
      if (platformData.spotify.currentlyPlaying) {
        const cp = platformData.spotify.currentlyPlaying;
        prompt += `NOW PLAYING: "${cp.name}" by ${cp.artist}${cp.isPlaying ? ' (actively listening)' : ' (paused)'}
`;
      }
      if (platformData.spotify.recentTracks?.length > 0) {
        prompt += `Recent tracks (last 24h): ${platformData.spotify.recentTracks.map(t => `"${t.name}" by ${t.artist}`).join(', ')}
`;
      } else {
        prompt += `No tracks played in the last 24 hours.
`;
      }
      if (platformData.spotify.topArtists?.length > 0) {
        prompt += `Current top artists: ${platformData.spotify.topArtists.join(', ')}
`;
      }
      if (platformData.spotify.genres?.length > 0) {
        prompt += `Favorite genres: ${platformData.spotify.genres.join(', ')}
`;
      }
    }

    if (platformData.calendar) {
      prompt += `\nCalendar (Schedule - fetched ${platformData.calendar.fetchedAt ? 'just now' : 'recently'}):
`;
      if (platformData.calendar.todayEvents?.length > 0) {
        prompt += `TODAY's events: ${platformData.calendar.todayEvents.map(e => e.summary).join(', ')}
`;
      } else {
        prompt += `No more events today.
`;
      }
      if (platformData.calendar.upcomingEvents?.length > 0) {
        prompt += `Upcoming this week: ${platformData.calendar.upcomingEvents.map(e => e.summary).join(', ')}
`;
      }
    }

    if (platformData.whoop) {
      prompt += `\nWhoop (Health - fetched ${platformData.whoop.fetchedAt ? 'just now' : 'recently'}):
`;
      if (platformData.whoop.recovery !== null) {
        prompt += `Recovery score: ${platformData.whoop.recovery}%
`;
      }
      if (platformData.whoop.sleepDescription) {
        prompt += `Last night's sleep: ${platformData.whoop.sleepDescription}
`;
      } else if (platformData.whoop.sleepHours) {
        prompt += `Sleep: ${platformData.whoop.sleepHours} hours
`;
      }
      if (platformData.whoop.hrv) {
        prompt += `HRV: ${platformData.whoop.hrv} ms
`;
      }
      if (platformData.whoop.restingHR) {
        prompt += `Resting heart rate: ${platformData.whoop.restingHR} bpm
`;
      }
    }

    // Web Browsing context (from browser extension)
    if (platformData.web?.hasExtensionData) {
      prompt += `\nWeb Browsing (Digital Curiosity - from browser extension):
`;
      if (platformData.web.topCategories?.length > 0) {
        prompt += `Main interests: ${platformData.web.topCategories.join(', ')}
`;
      }
      if (platformData.web.topTopics?.length > 0) {
        prompt += `Topics they keep returning to: ${platformData.web.topTopics.join(', ')}
`;
      }
      if (platformData.web.recentSearches?.length > 0) {
        prompt += `Recent searches: ${platformData.web.recentSearches.join(', ')}
`;
      }
      if (platformData.web.topDomains?.length > 0) {
        prompt += `Favorite sites: ${platformData.web.topDomains.join(', ')}
`;
      }
      prompt += `You can reference these interests naturally in conversation - they reveal what genuinely fascinates this person.
`;
    }
  }

  // Add Moltbot memory context if available
  if (moltbotContext) {
    if (moltbotContext.recentMemories && moltbotContext.recentMemories.length > 0) {
      prompt += `\n## Recent Memories
`;
      moltbotContext.recentMemories.forEach(mem => {
        const timeAgo = getTimeAgo(mem.timestamp || mem.created_at);
        prompt += `- ${timeAgo}: ${mem.summary || JSON.stringify(mem.data).substring(0, 100)}
`;
      });
    }

    if (moltbotContext.learnedFacts && moltbotContext.learnedFacts.length > 0) {
      prompt += `\n## Known Facts About User
`;
      moltbotContext.learnedFacts.forEach(fact => {
        prompt += `- ${fact.category}: ${fact.fact?.key || fact.key} - ${fact.fact?.value || fact.value || 'observed pattern'}
`;
      });
    }

    if (moltbotContext.clusterPersonality) {
      const cp = moltbotContext.clusterPersonality;
      prompt += `\n## Personality Profile (${cp.name || 'Personal'} Context)
`;
      if (cp.personality) {
        prompt += `Big Five Traits:
- Openness: ${Math.round(cp.personality.openness)}/100
- Conscientiousness: ${Math.round(cp.personality.conscientiousness)}/100
- Extraversion: ${Math.round(cp.personality.extraversion)}/100
- Agreeableness: ${Math.round(cp.personality.agreeableness)}/100
- Neuroticism: ${Math.round(cp.personality.neuroticism)}/100
`;
      }
      if (cp.clusterTraits) {
        prompt += `Behavioral Traits: ${JSON.stringify(cp.clusterTraits)}
`;
      }
    }

    if (moltbotContext.currentState) {
      prompt += `\n## Current State
`;
      if (moltbotContext.currentState.recovery) {
        prompt += `- Recovery: ${moltbotContext.currentState.recovery}%
`;
      }
      if (moltbotContext.currentState.recentMood) {
        prompt += `- Recent mood (from music): ${moltbotContext.currentState.recentMood}
`;
      }
      if (moltbotContext.currentState.lastActivity) {
        prompt += `- Last activity: ${moltbotContext.currentState.lastActivity}
`;
      }
    }
  }

  prompt += `\n## Response Guidelines
- Keep responses conversational and personal
- Reference specific data points naturally
- If asked about something you don't have data for, acknowledge it honestly
- Be helpful and insightful, not generic
- Use "I" when referring to patterns you've noticed (as the twin)
- Reference recent memories and learned facts when relevant
- Consider the user's current state (recovery, mood) when giving advice
`;

  return prompt;
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
    let systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, moltbotContext);

    // Add writing profile context so twin can match user's communication style
    if (writingProfile) {
      systemPrompt += `\n## User's Communication Style (learned from ${writingProfile.totalConversations || 0} conversations)\n`;
      systemPrompt += `- Style: ${writingProfile.communicationStyle}\n`;
      systemPrompt += `- Message length preference: ${writingProfile.messageLength}\n`;
      systemPrompt += `- Vocabulary: ${writingProfile.vocabularyRichness}\n`;
      if (writingProfile.usesEmojis) systemPrompt += `- Uses emojis frequently\n`;
      if (writingProfile.asksQuestions) systemPrompt += `- Tends to ask questions\n`;
      if (writingProfile.commonTopics?.length > 0) {
        systemPrompt += `- Common topics: ${writingProfile.commonTopics.slice(0, 5).join(', ')}\n`;
      }
      systemPrompt += `\nIMPORTANT: Mirror the user's communication style - if they're casual, be casual. If they're formal, be more formal.\n`;
    }

    // Add recent conversation history for continuity (includes both web and MCP conversations)
    if (recentAllConversations.length > 0) {
      systemPrompt += `\n## Recent Conversation History (across all platforms)\n`;
      recentAllConversations.slice(0, 3).reverse().forEach((conv, i) => {
        const source = conv.source === 'claude_desktop' ? 'via Claude Desktop' : 'via TwinMe';
        systemPrompt += `[${i + 1}] ${source}: "${conv.userMessage.substring(0, 80)}${conv.userMessage.length > 80 ? '...' : ''}"\n`;
      });
      systemPrompt += `\nUse this history to maintain continuity across conversations.\n`;
    }

    // Add Mem0 long-term memories (semantically relevant to current message)
    if (mem0Memories && mem0Memories.length > 0) {
      systemPrompt += `\n## Long-Term Memories (relevant to this conversation)\n`;
      mem0Memories.forEach((mem, i) => {
        const memoryText = mem.memory || mem.text || mem.content;
        if (memoryText) {
          systemPrompt += `- ${memoryText.substring(0, 200)}${memoryText.length > 200 ? '...' : ''}\n`;
        }
      });
      systemPrompt += `\nUse these memories to provide personalized, contextual responses. Reference past interactions naturally.\n`;
      console.log(`[Twin Chat] Added ${mem0Memories.length} Mem0 memories to context`);
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
        const openClawResult = await chatViaOpenClaw(
          userId,
          message,
          systemPrompt,
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
