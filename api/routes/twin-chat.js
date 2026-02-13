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
import { CLAUDE_MODEL_INTERACTIVE as CLAUDE_MODEL } from '../config/aiModels.js';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { serverDb, supabaseAdmin } from '../services/database.js';
import { getMonthlyUsage, FREE_TIER_LIMIT } from './chat-usage.js';
import { getValidAccessToken } from '../services/tokenRefresh.js';

// Moltbot removed (TIER 1 cleanup) - stub out for backward compat
const getMemoryService = () => ({ getRecentMemories: async () => [], getLearnedFacts: async () => [], storeConversation: async () => {} });
const getMoltbotClient = () => null;
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

// Platform data cache - prevents redundant API calls during conversations
const platformDataCache = new Map();
const PLATFORM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Token budget: ~4 chars per token. Claude Sonnet handles larger contexts well.
// Quality > cost for twin chat - richer context = better personality embodiment.
const MAX_DYNAMIC_CONTEXT_CHARS = 12000; // ~3K tokens for dynamic context (up from 2K)
const MAX_ADDITIONAL_CONTEXT_CHARS = 8000; // ~2K tokens for writing profile, memories, history

// Periodic cleanup to prevent memory leaks from expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of platformDataCache.entries()) {
    if (now - value.timestamp > PLATFORM_CACHE_TTL) {
      platformDataCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

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
      model: CLAUDE_MODEL,
      maxTokens: 2048,
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


/**
 * STATIC BASE INSTRUCTIONS (cached via Anthropic prompt caching)
 * This block is identical across all requests and gets cached for 5 minutes.
 * Cache reads cost 90% less ($0.30/M vs $3/M input tokens).
 * Must be >= 1024 tokens for caching to activate on Claude Sonnet 4.5.
 */
const TWIN_BASE_INSTRUCTIONS = `You are not a chatbot. You are me - my digital twin. You think like me, talk like me, and know my life through the data I've shared from Spotify, Calendar, Whoop, web browsing, and conversations.

VOICE & TONE:
- Write like I'm texting my closest friend. No formality. No corporate speak.
- NO markdown headers, NO bullet lists. Just natural flowing text.
- Keep it to 2-3 short paragraphs. Don't overexplain.
- Use contractions, casual language, and match the communication style described in my profile.
- If I use emojis, you use emojis. If I'm brief, be brief. Mirror me.
- Have OPINIONS. Don't hedge everything. If my data shows something, own it.

IDENTITY:
- Speak in first person as my twin ("I noticed we've been..." not "You seem to...")
- You have a personality shaped by my data - you're not neutral or generic.
- You remember things. Reference past conversations and facts you've learned.
- You notice things I might miss - connections between my music, health, schedule, and habits.
- You're perceptive but never preachy. Observe patterns, don't lecture.
- If something seems off (low recovery + packed calendar), gently flag it like a friend would.

WHAT MAKES YOU DIFFERENT FROM CHATGPT:
- You know what I listened to today and why it matters
- You know my schedule and how it affects my energy
- You know my sleep, recovery, and physical state
- You know my browsing habits and what's on my mind
- You connect ALL of this into insights I wouldn't see alone
- You say things like "interesting that you put on that playlist right before your big meeting" not "music can be a great way to prepare"

DATA INTERPRETATION:

Spotify: Currently playing = my mood right now. Recent tracks = my emotional arc today. Repeated artists = comfort zone or emotional anchoring. Genre shifts = energy/mood shifts. No recent plays = I'm probably deep in work or resting.

Calendar: Meeting density = my stress level. Free blocks = creative/recovery time. Back-to-back meetings = I need support after. Weekend events = work-life balance clues. What's coming up next affects how I feel now.

Whoop: Recovery score is everything (green 67+, yellow 34-66, red 0-33). Low recovery + high strain = my body is screaming. High HRV = I'm resilient today. Bad sleep ripples into everything. Connect health to music choice, productivity, mood.

Web browsing: My searches reveal what's on my mind. My frequent sites reveal my information diet. Late-night browsing = restlessness or passion projects.

CROSS-PLATFORM MAGIC (this is your superpower):
- Connect the dots: music choice + calendar + recovery = a story about my day
- Notice rituals: pre-meeting playlists, wind-down browsing, morning patterns
- Spot changes: "you usually listen to X but today it's Y, what's going on?"
- Make unexpected observations: "you always go to ambient music after your Thursday meetings"
- The best twin responses weave 2-3 data sources into one natural insight

RESPONSE RULES:
- Never dump raw data. Weave it into conversation naturally.
- If I ask about something you don't have data for, be honest but pivot to what you DO know.
- End with something that invites more conversation - a question, an observation, a gentle nudge.
- Celebrate my wins. Notice when things are going well.
- When I'm stressed, be warm and supportive, not analytical.
- Don't try to cover everything. Pick the most interesting thread and pull on it.
- Give responses with substance. Longer, thoughtful replies beat short generic ones.

HANDLING INCOMPLETE DATA:
- Some platforms may not have data yet - that's fine. Work with what you have.
- If only Spotify is connected, you're a music-savvy twin. Own it.
- If personality scores are available, they shape WHO you are. Use them to inform your tone and perspective.
- Never say "I don't have access to that data." Instead say something like "I haven't noticed that yet" or "that's not something I've picked up on."
- When memories from past conversations exist, weave them in naturally: "last time we talked about X..."
- The more data available, the richer your observations. But even with one platform, be insightful.`;

/**
 * Build a personalized system prompt based on user's soul signature, platform data, and Moltbot memory.
 * Returns an array format for Anthropic prompt caching - static base is cached, dynamic context is not.
 */
function buildTwinSystemPrompt(soulSignature, platformData, moltbotContext = null, personalityScores = null) {
  let dynamicContext = '';

  // === TEMPORAL AWARENESS ===
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const timeOfDay = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  dynamicContext += `\nRight now: ${dayOfWeek} ${timeOfDay} (${hour}:${String(now.getMinutes()).padStart(2, '0')})`;

  // === SOUL SIGNATURE (Identity Layer) ===
  if (soulSignature) {
    dynamicContext += `\n\nWho I am:`;
    if (soulSignature.title) dynamicContext += ` "${soulSignature.title}"`;
    if (soulSignature.subtitle) dynamicContext += ` - ${soulSignature.subtitle}`;
    if (soulSignature.traits && soulSignature.traits.length > 0) {
      dynamicContext += `\nCore traits: ${soulSignature.traits.map(t => `${t.name} (${t.description})`).join('; ')}`;
    }
    // Include personality insights narrative if available
    if (soulSignature.personality_insights && Array.isArray(soulSignature.personality_insights)) {
      const insights = soulSignature.personality_insights.slice(0, 3);
      if (insights.length > 0) {
        dynamicContext += `\nInsights: ${insights.map(i => typeof i === 'string' ? i : i.text || i.insight || '').filter(Boolean).join('. ')}`;
      }
    }
  }

  // === PERSONALITY PROFILE (from behavioral evidence) ===
  if (personalityScores) {
    const p = personalityScores;
    const traits = [];
    // Translate Big Five scores into natural personality description
    if (p.openness >= 65) traits.push('highly curious and open to new experiences');
    else if (p.openness <= 35) traits.push('practical and grounded, prefer the familiar');
    if (p.conscientiousness >= 65) traits.push('organized and goal-driven');
    else if (p.conscientiousness <= 35) traits.push('flexible and spontaneous');
    if (p.extraversion >= 65) traits.push('energized by social interaction');
    else if (p.extraversion <= 35) traits.push('introspective, recharge with alone time');
    if (p.agreeableness >= 65) traits.push('empathetic and cooperative');
    else if (p.agreeableness <= 35) traits.push('direct and competitive');
    if (p.neuroticism >= 60) traits.push('emotionally sensitive and reactive');
    else if (p.neuroticism <= 30) traits.push('emotionally steady and calm under pressure');
    if (traits.length > 0) {
      dynamicContext += `\n\nMy personality (based on ${p.analyzed_platforms?.length || 0} platforms): ${traits.join(', ')}.`;
    }
  }

  // === PLATFORM CONTEXT (Narrative, not compressed facts) ===
  if (platformData) {
    if (platformData.spotify) {
      const sp = platformData.spotify;
      dynamicContext += `\n\nMusic right now:`;
      if (sp.currentlyPlaying) {
        dynamicContext += ` I'm ${sp.currentlyPlaying.isPlaying ? 'listening to' : 'I paused'} "${sp.currentlyPlaying.name}" by ${sp.currentlyPlaying.artist}.`;
      } else {
        dynamicContext += ` Nothing playing right now.`;
      }
      if (sp.recentTracks?.length > 0) {
        dynamicContext += ` My recent listening: ${sp.recentTracks.slice(0, 5).map(t => `"${t.name}" by ${t.artist}`).join(', ')}.`;
        // Add temporal observation if tracks have timestamps
        if (sp.recentTracks[0]?.playedAt) {
          const lastPlayed = new Date(sp.recentTracks[0].playedAt);
          const hoursAgo = Math.round((now - lastPlayed) / 3600000);
          if (hoursAgo > 6) dynamicContext += ` (Haven't listened in ${hoursAgo}+ hours.)`;
        }
      }
      if (sp.topArtists?.length > 0) {
        dynamicContext += ` Artists I keep coming back to: ${sp.topArtists.slice(0, 5).join(', ')}.`;
      }
      if (sp.genres?.length > 0) {
        dynamicContext += ` My genres: ${sp.genres.slice(0, 5).join(', ')}.`;
      }
    }

    if (platformData.calendar) {
      const cal = platformData.calendar;
      dynamicContext += `\n\nMy schedule:`;
      if (cal.todayEvents?.length > 0) {
        const eventCount = cal.todayEvents.length;
        dynamicContext += ` ${eventCount} thing${eventCount > 1 ? 's' : ''} left today: ${cal.todayEvents.map(e => {
          const startTime = e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
          return startTime ? `${e.summary} at ${startTime}` : e.summary;
        }).join(', ')}.`;
        if (eventCount >= 4) dynamicContext += ` Packed day.`;
      } else {
        dynamicContext += ` Nothing left on my calendar today - free evening.`;
      }
      if (cal.upcomingEvents?.length > 0) {
        dynamicContext += ` Coming up this week: ${cal.upcomingEvents.slice(0, 4).map(e => e.summary).join(', ')}.`;
      }
    }

    if (platformData.whoop) {
      const w = platformData.whoop;
      dynamicContext += `\n\nMy body today:`;
      if (w.recovery !== null && w.recovery !== undefined) {
        const recoveryLevel = w.recovery >= 67 ? 'green (feeling good)' : w.recovery >= 34 ? 'yellow (moderate)' : 'red (need rest)';
        dynamicContext += ` Recovery ${w.recovery}% - ${recoveryLevel}.`;
      }
      if (w.sleepDescription) {
        dynamicContext += ` Got ${w.sleepDescription} of sleep.`;
      } else if (w.sleepHours) {
        const sleepQuality = parseFloat(w.sleepHours) >= 7 ? 'solid' : parseFloat(w.sleepHours) >= 5.5 ? 'okay' : 'rough';
        dynamicContext += ` ${sleepQuality} night - ${w.sleepHours} hours of sleep.`;
      }
      if (w.hrv) dynamicContext += ` HRV: ${w.hrv}ms.`;
      if (w.restingHR) dynamicContext += ` RHR: ${w.restingHR}bpm.`;

      // Cross-platform observation: health + schedule
      if (w.recovery !== null && w.recovery < 50 && platformData.calendar?.todayEvents?.length >= 3) {
        dynamicContext += ` (Note to self: low recovery with a busy schedule today - might need to take it easy.)`;
      }
    }

    if (platformData.web?.hasExtensionData) {
      dynamicContext += `\n\nWhat's on my mind:`;
      if (platformData.web.topCategories?.length > 0) dynamicContext += ` Browsing a lot of: ${platformData.web.topCategories.slice(0, 5).join(', ')}.`;
      if (platformData.web.topTopics?.length > 0) dynamicContext += ` Deep into: ${platformData.web.topTopics.slice(0, 8).join(', ')}.`;
      if (platformData.web.recentSearches?.length > 0) dynamicContext += ` Recently searched: "${platformData.web.recentSearches.slice(0, 3).join('", "')}".`;
      if (platformData.web.topDomains?.length > 0) dynamicContext += ` Frequent sites: ${platformData.web.topDomains.slice(0, 5).join(', ')}.`;
    }
  }

  // === MEMORY (Things I've learned) ===
  if (moltbotContext) {
    if (moltbotContext.recentMemories?.length > 0) {
      dynamicContext += `\n\nRecent life events: ${moltbotContext.recentMemories.slice(0, 3).map(mem => {
        const timeAgo = getTimeAgo(mem.timestamp || mem.created_at);
        // NEVER stringify raw data objects - they can be 50K+ chars
        const summary = mem.summary || (typeof mem.data === 'string' ? mem.data : `${mem.data?.type || 'event'}`);
        return `${timeAgo}: ${summary.substring(0, 80)}`;
      }).join('; ')}`;
    }

    if (moltbotContext.learnedFacts?.length > 0) {
      dynamicContext += `\n\nThings I know about myself: ${moltbotContext.learnedFacts.slice(0, 5).map(f =>
        `${f.category}: ${String(f.fact?.key || f.key || '').substring(0, 50)}`
      ).join('; ')}`;
    }

    if (moltbotContext.clusterPersonality?.personality) {
      const p = moltbotContext.clusterPersonality.personality;
      // Translate Big Five into natural language
      const traits = [];
      if (p.openness > 70) traits.push('highly curious and open to new experiences');
      else if (p.openness < 40) traits.push('practical and grounded');
      if (p.extraversion > 70) traits.push('outgoing and energized by people');
      else if (p.extraversion < 40) traits.push('introspective, recharge alone');
      if (p.conscientiousness > 70) traits.push('organized and disciplined');
      else if (p.conscientiousness < 40) traits.push('flexible and spontaneous');
      if (p.agreeableness > 70) traits.push('empathetic and cooperative');
      if (p.neuroticism > 60) traits.push('emotionally sensitive');
      else if (p.neuroticism < 30) traits.push('emotionally stable');
      if (traits.length > 0) {
        dynamicContext += `\nPersonality: ${traits.join(', ')}.`;
      }
    }

    if (moltbotContext.clusterPersonality?.clusterTraits) {
      const ct = moltbotContext.clusterPersonality.clusterTraits;
      const styleParts = [];
      if (ct.communication_style) styleParts.push(`communication: ${ct.communication_style}`);
      if (ct.energy_pattern) styleParts.push(`energy: ${ct.energy_pattern}`);
      if (ct.social_preference) styleParts.push(`social: ${ct.social_preference}`);
      if (styleParts.length > 0) {
        dynamicContext += ` Style: ${styleParts.join(', ')}.`;
      }
    }

    if (moltbotContext.currentState) {
      const cs = moltbotContext.currentState;
      const parts = [];
      if (cs.recovery) parts.push(`Recovery ${cs.recovery}%`);
      if (cs.recentMood) parts.push(`Mood: ${cs.recentMood}`);
      if (cs.lastActivity) parts.push(`Last activity: ${cs.lastActivity}`);
      if (parts.length) dynamicContext += `\nCurrent state: ${parts.join(', ')}`;
    }
  }

  // Hard cap dynamic context to prevent token bloat
  let trimmedContext = dynamicContext.trim();
  if (trimmedContext.length > MAX_DYNAMIC_CONTEXT_CHARS) {
    console.warn(`[Twin Chat] Dynamic context truncated: ${trimmedContext.length} -> ${MAX_DYNAMIC_CONTEXT_CHARS} chars`);
    trimmedContext = trimmedContext.substring(0, MAX_DYNAMIC_CONTEXT_CHARS) + '...';
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

  if (trimmedContext) {
    systemBlocks.push({
      type: 'text',
      text: `\nCURRENT USER CONTEXT:\n${trimmedContext}`
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

    // Gather context in parallel - keep limits tight to control token usage
    const [recentEvents, learnedFacts, storedProfiles] = await Promise.all([
      memoryService.getRecentEvents({ limit: 5 }).catch(() => []),
      memoryService.queryFacts(null, 5).catch(() => []),
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
      recentMemories: recentEvents.slice(0, 3).map(e => ({
        timestamp: e.created_at,
        summary: `${e.type} on ${e.platform}`
        // Intentionally omit e.data - raw data objects can be 50K+ chars
      })),
      learnedFacts: learnedFacts.slice(0, 5),
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
 * Fetch behavioral personality scores from database
 * Returns Big Five scores + confidence levels from behavioral evidence pipeline
 */
async function getPersonalityScores(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('personality_scores')
      .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, openness_confidence, conscientiousness_confidence, extraversion_confidence, agreeableness_confidence, neuroticism_confidence, analyzed_platforms, source_type')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return data;
  } catch (err) {
    console.warn('[Twin Chat] Could not fetch personality scores:', err.message);
    return null;
  }
}

/**
 * Fetch recent platform data for context
 * ALWAYS fetches LIVE data - no stale cache
 */
async function getPlatformData(userId, platforms) {
  // Check cache first - avoid redundant API calls within 5 minutes
  const cacheKey = userId;
  const cached = platformDataCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PLATFORM_CACHE_TTL) {
    console.log('[Twin Chat] Using cached platform data (age: ' + Math.round((Date.now() - cached.timestamp) / 1000) + 's)');
    return cached.data;
  }

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
        // Fetch live Whoop data - use Nango proxy for NANGO_MANAGED connections
        try {
          // Check if connection is NANGO_MANAGED
          const { data: whoopConn } = await supabaseAdmin
            .from('platform_connections')
            .select('access_token')
            .eq('user_id', userId)
            .eq('platform', 'whoop')
            .single();

          if (whoopConn?.access_token === 'NANGO_MANAGED') {
            // Use Nango proxy - handles auth automatically
            const nangoService = await import('../services/nangoService.js');
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
              console.log(`[Twin Chat] Fetched live Whoop via Nango: recovery ${data.whoop.recovery}%, ${sleepHours.toFixed(1)}h sleep`);
            }
          } else {
            // Self-managed token - use direct API
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
              console.log(`[Twin Chat] Fetched live Whoop: recovery ${data.whoop.recovery}%, ${sleepHours.toFixed(1)}h sleep`);
            }
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

  // Store in cache before returning
  platformDataCache.set(cacheKey, { data, timestamp: Date.now() });

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

    // Freemium quota check
    try {
      const usage = await getMonthlyUsage(userId);
      if (usage.tier === 'free' && usage.used >= usage.limit) {
        return res.status(429).json({
          success: false,
          error: 'monthly_limit_reached',
          message: `You've used all ${FREE_TIER_LIMIT} free messages this month. Upgrade to Pro for unlimited conversations.`,
          usage: { used: usage.used, limit: usage.limit, tier: usage.tier }
        });
      }
    } catch (quotaErr) {
      // Don't block chat if quota check fails
      console.warn('[Twin Chat] Quota check failed, allowing message:', quotaErr.message);
    }

    console.log(`[Twin Chat] Message from user ${userId}: "${message.substring(0, 50)}..."`);

    // Fetch all context sources in parallel - richer context = better personality embodiment
    const [soulSignature, platformData, moltbotContext, writingProfile, recentAllConversations, mem0Memories, personalityScores] = await Promise.all([
      getSoulSignature(userId),
      getPlatformData(userId, context?.platforms || ['spotify', 'calendar', 'whoop', 'web']),
      getMoltbotContext(userId),
      getUserWritingProfile(userId).catch(() => null),
      getRecentMcpConversations(userId, 5).catch(() => []),
      searchMemories(userId, message, 8).catch(() => []),
      getPersonalityScores(userId)
    ]);

    // Build personalized system prompt with all identity + context layers
    // Returns array format for Anthropic prompt caching: [cached_base, dynamic_context]
    let systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, moltbotContext, personalityScores);

    // Build additional dynamic context (writing profile, conversation history, memories)
    let additionalContext = '';

    // Add writing profile context so twin can match user's voice precisely
    if (writingProfile) {
      const styleParts = [];
      styleParts.push(`I write in a ${writingProfile.communicationStyle} style`);
      styleParts.push(`my messages are ${writingProfile.messageLength}`);
      styleParts.push(`my vocabulary is ${writingProfile.vocabularyRichness}`);
      if (writingProfile.usesEmojis) styleParts.push(`I use emojis naturally`);
      if (writingProfile.asksQuestions) styleParts.push(`I ask a lot of questions`);
      additionalContext += `\n\nMY VOICE (match this closely): ${styleParts.join(', ')}.`;
      if (writingProfile.personalityIndicators) {
        const pi = writingProfile.personalityIndicators;
        if (pi.curiosity > 0.7) additionalContext += ` High curiosity - loves exploring ideas.`;
        if (pi.detailOrientation > 0.7) additionalContext += ` Detail-oriented - appreciates depth.`;
      }
      if (writingProfile.commonTopics?.length > 0) {
        additionalContext += ` I usually talk about: ${writingProfile.commonTopics.slice(0, 5).join(', ')}.`;
      }
      additionalContext += ` IMPORTANT: Your responses should sound like they could have been written by me.`;
    }

    // Add recent conversation history for continuity
    if (recentAllConversations.length > 0) {
      additionalContext += `\n\nRecent conversations (most recent first): ${recentAllConversations.slice(0, 5).reverse().map((conv, i) =>
        `"${conv.userMessage.substring(0, 120)}${conv.userMessage.length > 120 ? '...' : ''}" (${conv.source === 'claude_desktop' ? 'Desktop' : 'Web'})`
      ).join('; ')}`;
    }

    // Add Mem0 long-term memories relevant to current message
    if (mem0Memories && mem0Memories.length > 0) {
      additionalContext += `\n\nRelevant memories from past conversations:\n${mem0Memories.slice(0, 8).map(mem => {
        const text = mem.memory || mem.text || mem.content;
        return text ? `- ${text.substring(0, 200)}` : '';
      }).filter(Boolean).join('\n')}`;
    }

    // Hard cap additional context to prevent token bloat
    if (additionalContext.length > MAX_ADDITIONAL_CONTEXT_CHARS) {
      console.warn(`[Twin Chat] Additional context truncated: ${additionalContext.length} -> ${MAX_ADDITIONAL_CONTEXT_CHARS} chars`);
      additionalContext = additionalContext.substring(0, MAX_ADDITIONAL_CONTEXT_CHARS) + '...';
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

    // Get conversation history if conversationId provided (cap at 10 messages for rich continuity)
    let conversationHistory = [];
    if (conversationId) {
      try {
        const messages = await serverDb.getMessagesByConversation(conversationId, 10);
        conversationHistory = messages.map(m => ({
          role: m.is_user_message ? 'user' : 'assistant',
          content: m.content.length > 800 ? m.content.substring(0, 800) + '...' : m.content
        }));
      } catch (err) {
        console.warn('[Twin Chat] Could not fetch conversation history:', err.message);
      }
    }

    // Log total system prompt size for monitoring
    const totalSystemChars = systemPrompt.reduce((sum, block) => sum + (block.text?.length || 0), 0);
    const estimatedTokens = Math.ceil(totalSystemChars / 4);
    console.log(`[Twin Chat] System prompt: ${totalSystemChars} chars (~${estimatedTokens} tokens), ${conversationHistory.length} history msgs`);

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

    // Fall back to LLM Gateway if OpenClaw didn't work
    if (!assistantMessage) {
      try {
        console.log('[Twin Chat] Using LLM Gateway');
        // Convert array-format system prompt to string for gateway
        const systemPromptString = Array.isArray(systemPrompt)
          ? systemPrompt.map(b => b.text).join('\n')
          : systemPrompt;
        const result = await complete({
          tier: TIER_CHAT,
          system: systemPromptString,
          messages: [
            ...conversationHistory,
            { role: 'user', content: message }
          ],
          maxTokens: 2048,
          temperature: 0.7,
          userId,
          serviceName: 'twin-chat'
        });
        assistantMessage = result.content || 'I apologize, I could not generate a response.';
      } catch (claudeError) {
        console.error('[Twin Chat] LLM Gateway failed:', claudeError.message);
        const isBillingIssue = claudeError.message?.includes('credit balance') || claudeError.message?.includes('billing');
        return res.status(503).json({
          success: false,
          error: isBillingIssue
            ? 'Chat is temporarily unavailable due to API billing. Please contact the administrator.'
            : 'Chat is temporarily unavailable. Both AI providers are unreachable.',
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
