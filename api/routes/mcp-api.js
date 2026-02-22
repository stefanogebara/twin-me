/**
 * MCP API Routes
 *
 * Exposes TwinMe MCP tools via REST API for any LLM client.
 * Each user authenticates with their own API key and gets their own data.
 */

import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../services/database.js';
import { getValidAccessToken } from '../services/tokenRefresh.js';
// Moltbot removed (TIER 1 cleanup) - stub out for backward compat
const getMemoryService = () => ({ getRecentMemories: async () => [], getLearnedFacts: async () => [] });
import { getClusterPersonalityBuilder } from '../services/clusterPersonalityBuilder.js';
import axios from 'axios';
import { complete, TIER_CHAT } from '../services/llmGateway.js';

const router = express.Router();

/**
 * Authenticate via API key
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.body?.api_key || req.query?.api_key;

  if (!apiKey || !apiKey.startsWith('twm_')) {
    return res.status(401).json({ error: 'Invalid or missing API key. Use X-API-Key header.' });
  }

  // Hash and lookup
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, user_id, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  if (!data.is_active) {
    return res.status(401).json({ error: 'API key is deactivated' });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return res.status(401).json({ error: 'API key has expired' });
  }

  // Update last_used_at
  const { error: updateErr } = await supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);
  if (updateErr) {
    console.error('[MCP API] Failed to update key last_used_at:', updateErr.message);
  }

  req.userId = data.user_id;
  next();
}

/**
 * GET /api/mcp/tools - List available tools
 */
router.get('/tools', (req, res) => {
  res.json({
    tools: [
      {
        name: 'chat_with_twin',
        description: 'Have a conversation with your TwinMe digital twin. The twin knows your personality, habits, and current state.',
        parameters: {
          message: { type: 'string', required: true, description: 'Your message to the twin' },
          platforms: { type: 'array', default: ['spotify', 'calendar', 'whoop'], description: 'Platforms to include' }
        }
      },
      {
        name: 'get_soul_signature',
        description: 'Get your complete personality profile derived from your digital footprint.'
      },
      {
        name: 'get_live_data',
        description: 'Get current real-time data from connected platforms.',
        parameters: {
          platforms: { type: 'array', default: ['spotify', 'calendar', 'whoop'] }
        }
      },
      {
        name: 'get_patterns',
        description: 'Get detected behavioral patterns and routines.'
      },
      {
        name: 'get_insights',
        description: 'Get AI-generated insights about your personality and recommendations.'
      },
      {
        name: 'get_predictions',
        description: 'Get behavioral predictions and forecasts.'
      }
    ]
  });
});

/**
 * POST /api/mcp/chat - Chat with your twin
 */
router.post('/chat', authenticateApiKey, async (req, res) => {
  try {
    const userId = req.userId;
    const { message, platforms = ['spotify', 'calendar', 'whoop'] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Fetch context in parallel
    const [soulSignature, platformData, moltbotContext] = await Promise.all([
      getSoulSignature(userId),
      getPlatformData(userId, platforms),
      getMoltbotContext(userId)
    ]);

    // Build system prompt
    const systemPrompt = buildTwinSystemPrompt(soulSignature, platformData, moltbotContext);

    // Call LLM Gateway
    const result = await complete({
      tier: TIER_CHAT,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
      maxTokens: 1000,
      temperature: 0.7,
      serviceName: 'mcpChat'
    });

    const assistantMessage = result.content || 'I could not generate a response.';

    res.json({
      success: true,
      response: assistantMessage,
      context: {
        hasSoulSignature: !!soulSignature,
        platforms: Object.keys(platformData),
        hasMemory: !!moltbotContext
      }
    });

  } catch (error) {
    console.error('[MCP API] Chat error:', error);
    res.status(500).json({ error: error.message || 'Internal error' });
  }
});

/**
 * GET /api/mcp/soul-signature - Get soul signature
 */
router.get('/soul-signature', authenticateApiKey, async (req, res) => {
  try {
    const signature = await getSoulSignature(req.userId);
    res.json({ success: true, data: signature });
  } catch (error) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/mcp/live-data - Get live platform data
 */
router.get('/live-data', authenticateApiKey, async (req, res) => {
  try {
    const platforms = req.query.platforms?.split(',') || ['spotify', 'calendar', 'whoop'];
    const data = await getPlatformData(req.userId, platforms);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/mcp/patterns - Get behavioral patterns
 */
router.get('/patterns', authenticateApiKey, async (req, res) => {
  try {
    const patterns = await getPatterns(req.userId);
    res.json({ success: true, data: patterns });
  } catch (error) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/mcp/insights - Get insights
 */
router.get('/insights', authenticateApiKey, async (req, res) => {
  try {
    const insights = await getInsights(req.userId);
    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/mcp/predictions - Get predictions
 */
router.get('/predictions', authenticateApiKey, async (req, res) => {
  try {
    const predictions = await getPredictions(req.userId);
    res.json({ success: true, data: predictions });
  } catch (error) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

// ============ Helper Functions ============

async function getSoulSignature(userId) {
  const { data, error } = await supabaseAdmin
    .from('soul_signatures')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error('[MCP API] Failed to fetch soul signature:', error.message);
  }
  return data;
}

async function getPlatformData(userId, platforms) {
  const data = {};

  for (const platform of platforms) {
    try {
      if (platform === 'spotify') {
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
          } catch (e) { /* no playback */ }

          const [recentRes, topRes] = await Promise.all([
            axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers }),
            axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers })
          ]);

          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const recentTracks = recentRes.data?.items?.filter(item =>
            new Date(item.played_at).getTime() > oneDayAgo
          ).map(item => ({
            name: item.track?.name,
            artist: item.track?.artists?.[0]?.name
          })).slice(0, 5) || [];

          data.spotify = {
            currentlyPlaying,
            recentTracks,
            topArtists: topRes.data?.items?.map(a => a.name) || [],
            genres: topRes.data?.items?.flatMap(a => a.genres?.slice(0, 2) || []).slice(0, 5) || []
          };
        }
      }

      if (platform === 'calendar') {
        const tokenResult = await getValidAccessToken(userId, 'google_calendar');
        if (tokenResult.success && tokenResult.accessToken) {
          const now = new Date();
          const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          const calRes = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
            params: {
              timeMin: now.toISOString(),
              timeMax: weekFromNow.toISOString(),
              maxResults: 10,
              singleEvents: true,
              orderBy: 'startTime'
            }
          });

          const todayEnd = new Date(now);
          todayEnd.setHours(23, 59, 59, 999);

          data.calendar = {
            todayEvents: calRes.data?.items?.filter(e =>
              new Date(e.start?.dateTime || e.start?.date) <= todayEnd
            ).map(e => ({ summary: e.summary })).slice(0, 5) || [],
            upcomingEvents: calRes.data?.items?.filter(e =>
              new Date(e.start?.dateTime || e.start?.date) > todayEnd
            ).map(e => ({ summary: e.summary })).slice(0, 5) || []
          };
        }
      }

      if (platform === 'whoop') {
        const tokenResult = await getValidAccessToken(userId, 'whoop');
        if (tokenResult.success && tokenResult.accessToken) {
          const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
          const [recoveryRes, sleepRes] = await Promise.all([
            axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers }),
            axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1', { headers })
          ]);

          const latestRecovery = recoveryRes.data?.records?.[0];
          const latestSleep = sleepRes.data?.records?.[0];

          data.whoop = {
            recovery: latestRecovery?.score?.recovery_score || null,
            sleepHours: latestSleep?.score?.total_sleep_time_milli
              ? (latestSleep.score.total_sleep_time_milli / 3600000).toFixed(1)
              : null,
            hrv: latestRecovery?.score?.hrv_rmssd_milli
              ? Math.round(latestRecovery.score.hrv_rmssd_milli)
              : null,
            restingHR: latestRecovery?.score?.resting_heart_rate
              ? Math.round(latestRecovery.score.resting_heart_rate)
              : null
          };
        }
      }
    } catch (err) {
      console.warn(`[MCP API] Error fetching ${platform}:`, err.message);
    }
  }

  return data;
}

async function getMoltbotContext(userId) {
  try {
    const memoryService = getMemoryService(userId);
    const clusterBuilder = getClusterPersonalityBuilder(userId);

    const [recentEvents, storedProfiles] = await Promise.all([
      memoryService.getRecentEvents({ limit: 5 }).catch(() => []),
      clusterBuilder.getStoredProfiles().catch(() => [])
    ]);

    const personalProfile = storedProfiles.find(p => p.cluster === 'personal');

    return {
      recentMemories: recentEvents.map(e => ({
        timestamp: e.created_at,
        summary: `${e.type} on ${e.platform}`
      })),
      personality: personalProfile ? {
        openness: personalProfile.openness,
        conscientiousness: personalProfile.conscientiousness,
        extraversion: personalProfile.extraversion,
        agreeableness: personalProfile.agreeableness,
        neuroticism: personalProfile.neuroticism
      } : null
    };
  } catch (err) {
    return null;
  }
}

function buildTwinSystemPrompt(soulSignature, platformData, moltbotContext) {
  let prompt = `You are the user's digital twin - an AI that deeply understands them through their real-time data.

Write naturally like texting a close friend. Keep responses concise (2-3 paragraphs max). Reference data naturally, not as lists.

`;

  if (soulSignature?.title) {
    prompt += `Soul Signature: "${soulSignature.title}"\n`;
    if (soulSignature.traits?.length) {
      prompt += `Traits: ${soulSignature.traits.map(t => t.name).join(', ')}\n`;
    }
  }

  if (platformData.spotify) {
    prompt += `\nSpotify: `;
    if (platformData.spotify.currentlyPlaying) {
      prompt += `NOW PLAYING "${platformData.spotify.currentlyPlaying.name}" by ${platformData.spotify.currentlyPlaying.artist}. `;
    }
    if (platformData.spotify.recentTracks?.length) {
      prompt += `Recent: ${platformData.spotify.recentTracks.map(t => t.name).join(', ')}. `;
    }
    if (platformData.spotify.topArtists?.length) {
      prompt += `Top artists: ${platformData.spotify.topArtists.join(', ')}.`;
    }
  }

  if (platformData.calendar) {
    prompt += `\nCalendar: `;
    if (platformData.calendar.todayEvents?.length) {
      prompt += `Today: ${platformData.calendar.todayEvents.map(e => e.summary).join(', ')}. `;
    }
    if (platformData.calendar.upcomingEvents?.length) {
      prompt += `Upcoming: ${platformData.calendar.upcomingEvents.map(e => e.summary).join(', ')}.`;
    }
  }

  if (platformData.whoop) {
    prompt += `\nWhoop: `;
    if (platformData.whoop.recovery) prompt += `Recovery ${platformData.whoop.recovery}%. `;
    if (platformData.whoop.sleepHours) prompt += `Sleep ${platformData.whoop.sleepHours}h. `;
    if (platformData.whoop.hrv) prompt += `HRV ${platformData.whoop.hrv}ms.`;
  }

  if (moltbotContext?.personality) {
    const p = moltbotContext.personality;
    prompt += `\nPersonality: O:${Math.round(p.openness)} C:${Math.round(p.conscientiousness)} E:${Math.round(p.extraversion)} A:${Math.round(p.agreeableness)} N:${Math.round(p.neuroticism)}`;
  }

  return prompt;
}

async function getPatterns(userId) {
  const { data: events, error: eventsErr } = await supabaseAdmin
    .from('realtime_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (eventsErr) {
    console.error('[MCP API] Failed to fetch patterns:', eventsErr.message);
  }

  const patterns = { timePatterns: [], platformPatterns: [] };

  if (events?.length) {
    // Analyze time patterns
    const hourCounts = {};
    events.forEach(e => {
      const hour = new Date(e.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    if (peakHour) {
      patterns.timePatterns.push({
        type: 'peak_activity',
        description: `Most active around ${peakHour[0]}:00`,
        confidence: Math.min(peakHour[1] / events.length, 1)
      });
    }

    // Platform patterns
    const platformCounts = {};
    events.forEach(e => {
      platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
    });
    patterns.platformPatterns = Object.entries(platformCounts).map(([p, c]) => ({
      platform: p,
      eventCount: c
    }));
  }

  return patterns;
}

async function getInsights(userId) {
  const [soulSignature, platformData] = await Promise.all([
    getSoulSignature(userId),
    getPlatformData(userId, ['spotify', 'whoop'])
  ]);

  const insights = [];

  if (soulSignature?.title) {
    insights.push({
      type: 'personality',
      insight: `Your soul signature "${soulSignature.title}" reflects your unique identity`
    });
  }

  if (platformData.spotify?.genres?.length) {
    insights.push({
      type: 'music',
      insight: `Your music taste shows preference for ${platformData.spotify.genres.slice(0, 3).join(', ')}`
    });
  }

  if (platformData.whoop?.recovery) {
    const recovery = platformData.whoop.recovery;
    insights.push({
      type: 'health',
      insight: recovery >= 67
        ? `Great recovery (${recovery}%) - good day for challenges!`
        : recovery <= 33
        ? `Low recovery (${recovery}%) - consider prioritizing rest`
        : `Moderate recovery (${recovery}%) - balanced day ahead`
    });
  }

  return { insights };
}

async function getPredictions(userId) {
  const platformData = await getPlatformData(userId, ['calendar', 'whoop']);
  const predictions = [];

  if (platformData.calendar?.todayEvents?.length) {
    predictions.push({
      type: 'schedule',
      prediction: `You have ${platformData.calendar.todayEvents.length} events today`,
      items: platformData.calendar.todayEvents.map(e => e.summary)
    });
  }

  if (platformData.whoop?.recovery) {
    const recovery = platformData.whoop.recovery;
    predictions.push({
      type: 'energy',
      prediction: recovery >= 67 ? 'High energy day predicted' :
                  recovery <= 33 ? 'Low energy day - plan accordingly' :
                  'Moderate energy expected'
    });
  }

  return { predictions };
}

export default router;
