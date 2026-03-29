/**
 * Morning Briefing API
 * ====================
 * Dedicated endpoint that generates a rich, structured morning briefing
 * by pulling data from connected platforms and composing via LLM.
 *
 * GET /api/morning-briefing/generate
 *   - Authenticated (JWT)
 *   - Fetches calendar events, recent insights, sleep/recovery, music
 *   - Composes a structured briefing via TIER_EXTRACTION (cheap model)
 *   - Caches result for 4 hours (avoids repeated LLM calls)
 *
 * The existing "Morning Briefing ->" sidebar button fills the chat input.
 * This endpoint powers a future dedicated briefing panel.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('MorningBriefingAPI');
const router = express.Router();

const BRIEFING_CACHE_HOURS = 4;

/**
 * GET /api/morning-briefing/generate
 * Generates (or returns cached) morning briefing for the authenticated user.
 */
router.get('/generate', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Check cache: return existing briefing if generated within BRIEFING_CACHE_HOURS
    const cached = await getCachedBriefing(userId);
    if (cached) {
      return res.json({ success: true, briefing: cached, cached: true });
    }

    // 2. Fetch all data sources in parallel (Vercel cost rule: minimize wall time)
    const [
      calendarEvents,
      recentInsights,
      sleepData,
      recentMusic,
      userName,
      platformConnections,
    ] = await Promise.all([
      fetchCalendarEvents(userId),
      fetchRecentInsights(userId),
      fetchSleepRecovery(userId),
      fetchRecentMusic(userId),
      fetchUserName(userId),
      fetchConnectedPlatforms(userId),
    ]);

    const firstName = userName || 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

    // 3. If no data at all, return a lightweight briefing (no LLM call = free)
    const hasAnyData = calendarEvents.length > 0 ||
      recentInsights.length > 0 ||
      sleepData !== null ||
      recentMusic.length > 0;

    if (!hasAnyData) {
      const fallbackBriefing = {
        greeting: `${greeting}, ${firstName}`,
        schedule: [],
        insights: [],
        rest: null,
        music: null,
        suggestion: platformConnections.length === 0
          ? 'Connect a platform like Spotify or Google Calendar to power your briefings.'
          : 'Chat with your twin to help it learn more about you.',
        generatedAt: new Date().toISOString(),
      };

      await cacheBriefing(userId, fallbackBriefing);
      return res.json({ success: true, briefing: fallbackBriefing, cached: false });
    }

    // 4. Compose structured briefing via LLM (TIER_EXTRACTION = cheapest model)
    const briefing = await composeBriefing({
      firstName,
      greeting,
      calendarEvents,
      recentInsights,
      sleepData,
      recentMusic,
      userId,
    });

    // 5. Cache and return
    await cacheBriefing(userId, briefing);

    return res.json({ success: true, briefing, cached: false });
  } catch (err) {
    log.error('Morning briefing generation failed', { userId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to generate morning briefing' });
  }
});

// ── Internal Helpers ──────────────────────────────────────────────────

async function getCachedBriefing(userId) {
  const cutoff = new Date(Date.now() - BRIEFING_CACHE_HOURS * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('metadata')
    .eq('user_id', userId)
    .eq('category', 'morning_briefing_cache')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data?.metadata?.briefing) {
    log.info('Returning cached morning briefing', { userId });
    return data.metadata.briefing;
  }

  return null;
}

async function cacheBriefing(userId, briefing) {
  try {
    await supabaseAdmin
      .from('proactive_insights')
      .insert({
        user_id: userId,
        insight: `Morning briefing generated: ${briefing.greeting}`,
        urgency: 'low',
        category: 'morning_briefing_cache',
        delivered: true,
        metadata: { briefing },
      });
  } catch (err) {
    log.warn('Failed to cache morning briefing', { userId, error: err.message });
  }
}

async function fetchCalendarEvents(userId) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Pull calendar events from platform_data or user_memories
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'observation'])
    .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .ilike('content', '%calendar%')
    .order('created_at', { ascending: false })
    .limit(10);

  return (data || []).map(m => m.content).slice(0, 8);
}

async function fetchRecentInsights(userId) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('insight, category, urgency')
    .eq('user_id', userId)
    .neq('category', 'morning_briefing_cache')
    .neq('category', 'briefing_email')
    .gte('created_at', dayAgo)
    .order('created_at', { ascending: false })
    .limit(5);

  return data || [];
}

async function fetchSleepRecovery(userId) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'observation'])
    .gte('created_at', dayAgo)
    .or('content.ilike.%recovery%,content.ilike.%sleep%,content.ilike.%whoop%,content.ilike.%hrv%')
    .order('created_at', { ascending: false })
    .limit(3);

  if (!data || data.length === 0) return null;

  return data.map(m => m.content).join(' | ');
}

async function fetchRecentMusic(userId) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'observation'])
    .gte('created_at', dayAgo)
    .or('content.ilike.%spotify%,content.ilike.%listened%,content.ilike.%music%,content.ilike.%playlist%')
    .order('created_at', { ascending: false })
    .limit(5);

  return (data || []).map(m => m.content);
}

async function fetchUserName(userId) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('first_name')
    .eq('id', userId)
    .single();

  return data?.first_name || null;
}

async function fetchConnectedPlatforms(userId) {
  const { data } = await supabaseAdmin
    .from('platform_connections')
    .select('platform')
    .eq('user_id', userId)
    .eq('status', 'connected');

  return data || [];
}

async function composeBriefing({ firstName, greeting, calendarEvents, recentInsights, sleepData, recentMusic, userId }) {
  const calendarSection = calendarEvents.length > 0
    ? calendarEvents.join('\n')
    : 'No calendar data available';

  const insightsSection = recentInsights.length > 0
    ? recentInsights.map(i => `- ${i.insight}`).join('\n')
    : 'No recent insights';

  const sleepSection = sleepData || 'No sleep/recovery data';

  const musicSection = recentMusic.length > 0
    ? recentMusic.join('\n')
    : 'No recent music data';

  const prompt = `Generate a structured morning briefing for ${firstName}. Use ONLY the data provided below — never invent facts.

CALENDAR DATA:
${calendarSection}

RECENT INSIGHTS (last 24h):
${insightsSection}

SLEEP/RECOVERY:
${sleepSection}

RECENT MUSIC:
${musicSection}

Return a JSON object with this EXACT structure (no markdown, no code fences, pure JSON):
{
  "schedule_summary": "1-2 sentence summary of today's schedule, or 'Your day is wide open' if no events",
  "patterns": ["insight 1", "insight 2"],
  "rest_summary": "1 sentence about sleep/recovery, or null if no data",
  "music_summary": "1 sentence about recent listening, or null if no data",
  "suggestion": "One actionable suggestion for the day based on the data"
}

Be concise — max 30 words per field. Write as a perceptive close friend, not a dashboard.`;

  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0.6,
      userId,
      serviceName: 'morning-briefing-api',
    });

    const raw = (result?.content || '').trim();

    // Parse the JSON response
    const parsed = parseJsonResponse(raw);

    return {
      greeting: `${greeting}, ${firstName}`,
      schedule: calendarEvents.slice(0, 5),
      schedule_summary: parsed.schedule_summary || 'No schedule data available',
      insights: recentInsights.slice(0, 3).map(i => i.insight),
      patterns: parsed.patterns || [],
      rest: parsed.rest_summary || null,
      music: parsed.music_summary || null,
      suggestion: parsed.suggestion || 'Take a moment to check in with yourself today.',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    log.warn('LLM briefing composition failed, using structured fallback', { error: err.message });

    // Fallback: structured briefing without LLM
    return {
      greeting: `${greeting}, ${firstName}`,
      schedule: calendarEvents.slice(0, 5),
      schedule_summary: calendarEvents.length > 0
        ? `You have ${calendarEvents.length} event${calendarEvents.length > 1 ? 's' : ''} on your calendar.`
        : 'Your day is wide open.',
      insights: recentInsights.slice(0, 3).map(i => i.insight),
      patterns: [],
      rest: sleepData ? 'Recovery data is available from your Whoop.' : null,
      music: recentMusic.length > 0 ? 'You were listening to music recently.' : null,
      suggestion: 'Chat with your twin to explore what it has noticed.',
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Parse a JSON response from the LLM, handling common formatting issues.
 */
function parseJsonResponse(raw) {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    log.warn('Failed to parse LLM JSON response', { raw: raw.slice(0, 200) });
    return {};
  }
}

export default router;
