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
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';
import { getProfile } from '../services/personalityProfileService.js';

// First-party sources that contain authentic user voice (same list used by twin chat).
// Kept local to avoid importing the full context builder for a simple DB query.
const VOICE_SOURCES = [
  'twin_chat',
  'onboarding_interview',
  'soul_interview_emotions', 'soul_interview_fears', 'soul_interview_goals',
  'soul_interview_habits', 'soul_interview_identity', 'soul_interview_joy',
  'soul_interview_relationships', 'soul_interview_values', 'soul_interview_work',
  'telegram', 'whatsapp', 'whatsapp_chat',
];

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
      userProfile,
      platformConnections,
    ] = await Promise.all([
      fetchCalendarEvents(userId),
      fetchRecentInsights(userId),
      fetchSleepRecovery(userId),
      fetchRecentMusic(userId),
      fetchUserProfile(userId),
      fetchConnectedPlatforms(userId),
    ]);

    const firstName = userProfile?.first_name || 'there';
    const hour = getUserLocalHour(userProfile?.timezone);
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

  // Pull calendar observations from last 24h — filter out JSON/extraction summaries
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata, created_at')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'observation'])
    .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .ilike('content', '%calendar%')
    .order('created_at', { ascending: false })
    .limit(15);

  if (!data || data.length === 0) return [];

  // Filter out raw JSON extraction summaries and dedup similar content
  const seen = new Set();
  return data
    .map(m => m.content)
    .filter(content => {
      // Skip raw JSON / extraction summaries
      if (content.includes('extraction_summary') || content.includes('"itemsExtracted"') || content.includes('"extract')) return false;
      // Skip very short or metadata-like content
      if (content.length < 20) return false;
      // Dedup: use "Calendar schedule today" prefix as a key (same-day summaries are redundant)
      const key = content.startsWith('Calendar schedule today')
        ? 'calendar_schedule_today'
        : content.substring(0, 50).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
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

async function fetchUserProfile(userId) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('first_name, timezone')
    .eq('id', userId)
    .single();

  return data || null;
}

/**
 * Get the current hour in the user's stored timezone.
 * Falls back to America/Sao_Paulo (primary market) if no timezone stored.
 */
function getUserLocalHour(timezone) {
  const tz = timezone || 'America/Sao_Paulo';
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date());
    return parseInt(hourStr, 10);
  } catch {
    // Invalid timezone string — fall back to São Paulo (UTC-3)
    const nowUtc = new Date();
    return (nowUtc.getUTCHours() - 3 + 24) % 24;
  }
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

  // Pull personality + voice samples in parallel so the briefing sounds like the user,
  // not like a generic assistant. Both queries fail closed (undefined) so absent data
  // degrades gracefully to the prior behavior.
  const [personalityProfile, voiceSamples] = await Promise.all([
    getProfile(userId).catch(() => null),
    fetchVoiceSamples(userId, 6).catch(() => []),
  ]);

  const voiceBlock = voiceSamples.length > 0
    ? `\nHOW THIS PERSON ACTUALLY TALKS (verbatim samples — mirror cadence, vocabulary, punctuation):\n${voiceSamples.map(s => `> ${s}`).join('\n')}\n`
    : '';

  const toneBlock = personalityProfile
    ? `\nWRITING FINGERPRINT: avg sentence length ${Math.round(personalityProfile.avg_sentence_length || 14)} words, formality ${(personalityProfile.formality_score ?? 0.5).toFixed(2)}, emotional expressiveness ${(personalityProfile.emotional_expressiveness ?? 0.5).toFixed(2)}. Use contractions, lowercase starts where they would, and the same registers visible in the samples above.\n`
    : '';

  const prompt = `You are writing ${firstName}'s personal morning briefing IN THEIR OWN VOICE — as if they were narrating their day to themselves. Not a dashboard. Not a generic "perceptive friend." Their voice.
${voiceBlock}${toneBlock}
Use ONLY the data provided below — never invent facts. If a section has no data, return null for that field.

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
  "schedule_summary": "1-2 sentence summary of today's schedule IN THEIR VOICE, or 'Your day is wide open' if no events",
  "patterns": ["insight in their voice", "insight in their voice"],
  "rest_summary": "1 sentence about sleep/recovery in their voice, or null if no data",
  "music_summary": "1 sentence about recent listening in their voice, or null if no data",
  "suggestion": "One actionable suggestion IN THEIR VOICE"
}

Be concise — max 30 words per field. Match the voice samples above. Do NOT sound like a service-desk agent or a dashboard.`;

  // Use personality-derived temperature when available so the briefing's spikiness
  // matches the user's OCEAN-derived baseline. Fall back to 0.7 otherwise.
  const temperature = personalityProfile?.temperature ?? 0.7;

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature,
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
 * Fetch a small set of recent user messages from authentic first-party sources
 * (twin chat, soul interviews, messaging platforms). These act as voice samples
 * the LLM can mirror so the briefing doesn't sound like a generic assistant.
 */
async function fetchVoiceSamples(userId, limit = 6) {
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, metadata, created_at')
    .eq('user_id', userId)
    .eq('memory_type', 'conversation')
    .eq('metadata->>role', 'user')
    .in('metadata->>source', VOICE_SOURCES)
    .order('created_at', { ascending: false })
    .limit(limit * 4); // Pull extra so we can filter out trivial/short messages

  if (!data || data.length === 0) return [];

  const cleaned = data
    .map(m => {
      let text = (m.content || '').trim();
      if (text.startsWith('User said: ')) text = text.slice(11);
      if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
      return text.trim();
    })
    .filter(t => t.length >= 20 && t.length <= 500 && !t.startsWith('/') && !t.startsWith('['));

  // Deduplicate near-identical samples (keep first occurrence).
  const seen = new Set();
  const unique = [];
  for (const t of cleaned) {
    const key = t.slice(0, 40).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
      if (unique.length >= limit) break;
    }
  }
  return unique;
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
