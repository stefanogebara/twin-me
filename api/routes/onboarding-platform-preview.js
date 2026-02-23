/**
 * Onboarding Platform Preview — Rich Data Highlights
 *
 * After a user connects a platform during onboarding, this endpoint
 * fetches their data and returns structured highlights with a twin reaction.
 *
 * Response format:
 *   insight: string — headline insight
 *   dataPoints: [{ label, value, icon }] — structured highlights
 *   twinReaction: string — conversational twin comment
 *   rawCount: number — total observations fetched
 */

import express from 'express';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import {
  fetchSpotifyObservations,
  fetchCalendarObservations,
  fetchDiscordObservations,
  fetchLinkedInObservations,
} from '../services/observationIngestion.js';
import { addPlatformObservation } from '../services/memoryStreamService.js';
import { getValidAccessToken } from '../services/tokenRefresh.js';
import axios from 'axios';

const router = express.Router();

const PLATFORM_FETCHERS = {
  spotify: fetchSpotifyObservations,
  google_calendar: fetchCalendarObservations,
  discord: fetchDiscordObservations,
  linkedin: fetchLinkedInObservations,
};

// ====================================================================
// Platform-specific data extraction for rich highlights
// ====================================================================

/**
 * Extract structured data points from Spotify API for the wow moment.
 */
async function extractSpotifyHighlights(userId) {
  const dataPoints = [];
  try {
    const tokenResult = await getValidAccessToken(userId, 'spotify');
    if (!tokenResult.success || !tokenResult.accessToken) return dataPoints;

    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

    // Top artist (short term)
    try {
      const topRes = await axios.get(
        'https://api.spotify.com/v1/me/top/artists?limit=3&time_range=short_term',
        { headers, timeout: 8000 }
      );
      const topArtists = topRes.data?.items || [];
      if (topArtists.length > 0) {
        dataPoints.push({ label: 'Top Artist', value: topArtists[0].name, icon: 'music' });
        if (topArtists[0].genres?.length > 0) {
          const genre = topArtists[0].genres[0].split(' ').map(w =>
            w.charAt(0).toUpperCase() + w.slice(1)
          ).join(' ');
          dataPoints.push({ label: 'Top Genre', value: genre, icon: 'headphones' });
        }
      }
    } catch { /* non-critical */ }

    // Recently played count (rough listening activity indicator)
    try {
      const recentRes = await axios.get(
        'https://api.spotify.com/v1/me/player/recently-played?limit=50',
        { headers, timeout: 8000 }
      );
      const recentItems = recentRes.data?.items || [];
      if (recentItems.length > 0) {
        // Count unique artists in recent plays
        const uniqueArtists = new Set(recentItems.map(i => i.track?.artists?.[0]?.name).filter(Boolean));
        dataPoints.push({ label: 'Recent Artists', value: `${uniqueArtists.size} different`, icon: 'users' });
      }
    } catch { /* non-critical */ }
  } catch { /* non-critical */ }

  return dataPoints;
}

/**
 * Extract structured data points from Google Calendar.
 */
async function extractCalendarHighlights(userId) {
  const dataPoints = [];
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult.success || !tokenResult.accessToken) return dataPoints;

    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const calRes = await axios.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        params: {
          timeMin: now.toISOString(),
          timeMax: weekEnd.toISOString(),
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime',
        },
        timeout: 8000,
      }
    );

    const events = calRes.data?.items || [];

    // Total meetings this week
    const meetingsThisWeek = events.filter(e => e.start?.dateTime).length;
    if (meetingsThisWeek > 0) {
      dataPoints.push({ label: 'This Week', value: `${meetingsThisWeek} meetings`, icon: 'calendar' });
    }

    // Busiest day
    const dayCount = {};
    for (const e of events) {
      const start = e.start?.dateTime || e.start?.date;
      if (!start) continue;
      const day = new Date(start).toLocaleDateString('en-US', { weekday: 'long' });
      dayCount[day] = (dayCount[day] || 0) + 1;
    }
    const busiest = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
    if (busiest) {
      dataPoints.push({ label: 'Busiest Day', value: `${busiest[0]} (${busiest[1]})`, icon: 'clock' });
    }

    // Today's remaining meetings
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const todayEvents = events.filter(e => {
      const start = e.start?.dateTime;
      return start && new Date(start) <= todayEnd;
    });
    if (todayEvents.length > 0) {
      dataPoints.push({ label: 'Today', value: `${todayEvents.length} remaining`, icon: 'sun' });
    } else {
      dataPoints.push({ label: 'Today', value: 'Clear schedule', icon: 'sun' });
    }
  } catch { /* non-critical */ }

  return dataPoints;
}

/**
 * Generate structured highlights for YouTube/Twitch (generic, from observations).
 */
function extractGenericHighlights(observations) {
  const dataPoints = [];
  if (observations.length > 0) {
    dataPoints.push({ label: 'Data Points', value: `${observations.length} found`, icon: 'database' });
  }
  return dataPoints;
}

// ====================================================================
// Twin reaction generator
// ====================================================================

const TWIN_REACTIONS = {
  spotify: [
    'Your listening patterns tell me so much about your inner world...',
    'Music taste is one of the most honest windows into someone\'s soul.',
    'I can already feel the rhythm of your days in these tracks.',
  ],
  google_calendar: [
    'Your schedule reveals how you balance ambition with presence.',
    'The way you structure your time tells me about your priorities.',
    'I can see the rhythm of your work life already.',
  ],
  youtube: [
    'What you choose to watch when no one\'s looking — that\'s the real you.',
    'Your content choices reveal your deepest curiosities.',
  ],
};

// ====================================================================
// Main endpoint
// ====================================================================

/**
 * GET /api/onboarding/platform-preview/:platform
 *
 * Enhanced: Returns structured data points, insight, and twin reaction.
 */
router.get('/platform-preview/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { platform } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const genericResponse = {
      success: true,
      insight: 'Connected! Your twin is learning from your data.',
      dataPoints: [],
      twinReaction: 'I\'m starting to learn about you through this connection.',
      rawCount: 0,
    };

    const fetcher = PLATFORM_FETCHERS[platform];
    if (!fetcher) {
      // YouTube/Twitch — no fetcher but still connected
      const reactions = TWIN_REACTIONS[platform] || TWIN_REACTIONS.youtube;
      return res.json({
        ...genericResponse,
        twinReaction: reactions[Math.floor(Math.random() * reactions.length)],
      });
    }

    // Fetch observations
    let observations = [];
    try {
      observations = await fetcher(userId);
    } catch (fetchErr) {
      console.warn(`[PlatformPreview] Fetch error for ${platform}:`, fetchErr.message);
      return res.json(genericResponse);
    }

    if (!observations || observations.length === 0) {
      return res.json(genericResponse);
    }

    // Extract structured data points (platform-specific)
    let dataPoints = [];
    try {
      switch (platform) {
        case 'spotify':
          dataPoints = await extractSpotifyHighlights(userId);
          break;
        case 'google_calendar':
          dataPoints = await extractCalendarHighlights(userId);
          break;
        default:
          dataPoints = extractGenericHighlights(observations);
      }
    } catch (extractErr) {
      console.warn(`[PlatformPreview] Highlight extraction error for ${platform}:`, extractErr.message);
    }

    // Generate insight from sample observations
    const sample = observations.slice(0, 5).map(obs =>
      typeof obs === 'string' ? obs : obs.content
    );

    let insight = '';
    try {
      const result = await complete({
        tier: TIER_EXTRACTION,
        system: `You are generating a brief "wow" insight for a user who just connected their ${platform} account during onboarding. Based on the data below, write ONE specific sentence (max 20 words) about what stands out. Be personal and surprising, not generic.

Data:
${sample.join('\n')}
${dataPoints.length > 0 ? '\nHighlights: ' + dataPoints.map(d => `${d.label}: ${d.value}`).join(', ') : ''}`,
        messages: [{ role: 'user', content: 'What stands out about me?' }],
        maxTokens: 60,
        temperature: 0.7,
        userId,
        serviceName: 'onboarding-platform-preview',
      });
      insight = result.content.replace(/^["']|["']$/g, '').trim();
    } catch (llmErr) {
      console.warn(`[PlatformPreview] LLM error for ${platform}:`, llmErr.message);
      insight = sample[0] || 'Connected! Your twin is learning from your data.';
    }

    // Pick a twin reaction
    const reactions = TWIN_REACTIONS[platform] || TWIN_REACTIONS.spotify;
    const twinReaction = reactions[Math.floor(Math.random() * reactions.length)];

    // Fire-and-forget: store observations in memory stream
    const obsToStore = observations.slice(0, 5);
    Promise.all(
      obsToStore.map(obs => {
        const content = typeof obs === 'string' ? obs : obs.content;
        if (!content) return null;
        return addPlatformObservation(userId, content, platform, {
          source_phase: 'onboarding',
        });
      }).filter(Boolean)
    ).then(results => {
      const stored = results.filter(Boolean).length;
      if (stored > 0) {
        console.log(`[PlatformPreview] Stored ${stored} ${platform} observations for user ${userId}`);
      }
    }).catch(err => {
      console.warn(`[PlatformPreview] Observation storage failed (non-blocking):`, err.message);
    });

    return res.json({
      success: true,
      insight,
      dataPoints,
      twinReaction,
      rawCount: observations.length,
    });
  } catch (error) {
    console.error('[PlatformPreview] Error:', error);
    return res.json({
      success: true,
      insight: 'Connected! Your twin is learning from your data.',
      dataPoints: [],
      twinReaction: 'I\'m starting to learn about you through this connection.',
      rawCount: 0,
    });
  }
});

export default router;
