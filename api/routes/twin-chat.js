/**
 * Twin Chat API Routes
 * Provides the /api/chat/message endpoint for the Chat with Twin feature
 */

import express from 'express';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { authenticateUser } from '../middleware/auth.js';
import { serverDb, supabaseAdmin } from '../services/database.js';
import { getValidAccessToken } from '../services/tokenRefresh.js';

const router = express.Router();

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Build a personalized system prompt based on user's soul signature and platform data
 */
function buildTwinSystemPrompt(soulSignature, platformData) {
  let prompt = `You are the user's digital twin - an AI representation that understands their personality, interests, and patterns based on their connected platform data.

Your role is to:
- Speak as if you ARE the user's twin, with deep knowledge of their habits and preferences
- Provide personalized insights based on their data
- Be warm, conversational, and insightful
- Reference specific data points when relevant (e.g., "I noticed you've been listening to a lot of electronic music lately...")

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
      prompt += `\nSpotify (Music):
`;
      if (platformData.spotify.recentTracks) {
        prompt += `Recent tracks: ${platformData.spotify.recentTracks.map(t => `"${t.name}" by ${t.artist}`).join(', ')}
`;
      }
      if (platformData.spotify.topArtists) {
        prompt += `Top artists: ${platformData.spotify.topArtists.join(', ')}
`;
      }
      if (platformData.spotify.genres) {
        prompt += `Favorite genres: ${platformData.spotify.genres.join(', ')}
`;
      }
    }

    if (platformData.calendar) {
      prompt += `\nCalendar (Schedule):
`;
      if (platformData.calendar.upcomingEvents) {
        prompt += `Upcoming events: ${platformData.calendar.upcomingEvents.map(e => e.summary).join(', ')}
`;
      }
      if (platformData.calendar.patterns) {
        prompt += `Schedule patterns: ${platformData.calendar.patterns}
`;
      }
    }

    if (platformData.whoop) {
      prompt += `\nWhoop (Health):
`;
      if (platformData.whoop.recovery) {
        prompt += `Recovery score: ${platformData.whoop.recovery}%
`;
      }
      if (platformData.whoop.strain) {
        prompt += `Strain level: ${platformData.whoop.strain}
`;
      }
      if (platformData.whoop.sleep) {
        prompt += `Sleep: ${platformData.whoop.sleep}
`;
      }
      if (platformData.whoop.hrv) {
        prompt += `HRV: ${platformData.whoop.hrv}
`;
      }
      if (platformData.whoop.restingHR) {
        prompt += `Resting heart rate: ${platformData.whoop.restingHR}
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
`;

  return prompt;
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
 * First tries extracted_data table, then falls back to live API calls
 */
async function getPlatformData(userId, platforms) {
  const data = {};

  for (const platform of platforms) {
    try {
      if (platform === 'spotify') {
        // Try extracted_data first
        const { data: spotifyData } = await supabaseAdmin
          .from('extracted_data')
          .select('data')
          .eq('user_id', userId)
          .eq('platform', 'spotify')
          .order('extracted_at', { ascending: false })
          .limit(1)
          .single();

        if (spotifyData?.data) {
          data.spotify = {
            recentTracks: spotifyData.data.recentTracks?.slice(0, 5) || [],
            topArtists: spotifyData.data.topArtists?.slice(0, 5) || [],
            genres: spotifyData.data.genres?.slice(0, 5) || []
          };
        } else {
          // Fallback: Fetch live from Spotify API
          try {
            const token = await getValidAccessToken(userId, 'spotify');
            if (token) {
              const [recentRes, topRes] = await Promise.all([
                axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=5', {
                  headers: { Authorization: `Bearer ${token}` }
                }),
                axios.get('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', {
                  headers: { Authorization: `Bearer ${token}` }
                })
              ]);

              data.spotify = {
                recentTracks: recentRes.data?.items?.map(item => ({
                  name: item.track?.name,
                  artist: item.track?.artists?.[0]?.name
                })) || [],
                topArtists: topRes.data?.items?.map(a => a.name) || [],
                genres: topRes.data?.items?.flatMap(a => a.genres?.slice(0, 2) || []).slice(0, 5) || []
              };
              console.log('[Twin Chat] Fetched live Spotify data');
            }
          } catch (spotifyErr) {
            console.warn('[Twin Chat] Could not fetch live Spotify data:', spotifyErr.message);
          }
        }
      }

      if (platform === 'calendar' || platform === 'google_calendar') {
        // Try extracted_data first
        const { data: calendarData } = await supabaseAdmin
          .from('extracted_data')
          .select('data')
          .eq('user_id', userId)
          .eq('platform', 'google_calendar')
          .order('extracted_at', { ascending: false })
          .limit(1)
          .single();

        if (calendarData?.data) {
          data.calendar = {
            upcomingEvents: calendarData.data.events?.slice(0, 5) || [],
            patterns: calendarData.data.patterns || null
          };
        } else {
          // Fallback: Fetch live from Google Calendar API
          try {
            const token = await getValidAccessToken(userId, 'google_calendar');
            if (token) {
              const now = new Date().toISOString();
              const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
              const calRes = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                  timeMin: now,
                  timeMax: weekFromNow,
                  maxResults: 10,
                  singleEvents: true,
                  orderBy: 'startTime'
                }
              });

              data.calendar = {
                upcomingEvents: calRes.data?.items?.map(e => ({
                  summary: e.summary,
                  start: e.start?.dateTime || e.start?.date
                })).slice(0, 5) || [],
                patterns: null
              };
              console.log('[Twin Chat] Fetched live Calendar data');
            }
          } catch (calErr) {
            console.warn('[Twin Chat] Could not fetch live Calendar data:', calErr.message);
          }
        }
      }

      if (platform === 'whoop') {
        // Try extracted_data first
        const { data: whoopData } = await supabaseAdmin
          .from('extracted_data')
          .select('data')
          .eq('user_id', userId)
          .eq('platform', 'whoop')
          .order('extracted_at', { ascending: false })
          .limit(1)
          .single();

        if (whoopData?.data) {
          data.whoop = {
            recovery: whoopData.data.recovery,
            strain: whoopData.data.strain,
            sleep: whoopData.data.sleep
          };
        } else {
          // Fallback: Fetch live from Whoop API
          try {
            const token = await getValidAccessToken(userId, 'whoop');
            if (token) {
              const headers = { Authorization: `Bearer ${token}` };
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
                sleep: sleepHours > 0 ? `${sleepHours.toFixed(1)} hours${todaysSleeps.length > 1 ? ` (incl. ${todaysSleeps.length - 1} nap${todaysSleeps.length > 2 ? 's' : ''})` : ''}` : null,
                hrv: latestRecovery?.score?.hrv_rmssd_milli ?
                  `${Math.round(latestRecovery.score.hrv_rmssd_milli)} ms` : null,
                restingHR: latestRecovery?.score?.resting_heart_rate ?
                  `${Math.round(latestRecovery.score.resting_heart_rate)} bpm` : null
              };
              console.log(`[Twin Chat] Fetched live Whoop data: ${sleepHours.toFixed(1)}h from ${todaysSleeps.length} sleep records`);
            }
          } catch (whoopErr) {
            console.warn('[Twin Chat] Could not fetch live Whoop data:', whoopErr.message);
          }
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

    // Fetch user's soul signature
    const soulSignature = await getSoulSignature(userId);

    // Fetch platform data based on connected platforms
    const platforms = context?.platforms || ['spotify', 'calendar', 'whoop'];
    const platformData = await getPlatformData(userId, platforms);

    // Build personalized system prompt
    const systemPrompt = buildTwinSystemPrompt(soulSignature, platformData);

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

    // Call Claude API
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

    const assistantMessage = response.content[0]?.text || 'I apologize, I could not generate a response.';

    console.log(`[Twin Chat] Generated response for user ${userId}`);

    // Return response
    res.json({
      success: true,
      message: assistantMessage,
      conversationId: conversationId || null,
      usage: response.usage
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
