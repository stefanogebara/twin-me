/**
 * Morning Briefing Service
 * ========================
 * Generates a personalized morning briefing for email delivery.
 * Uses TIER_ANALYSIS (DeepSeek) to compose a brief, personal message
 * from recent memories, platform connections, and proactive insights.
 *
 * Returns a structured briefing object suitable for the email template.
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefreshService.js';
import { createLogger } from './logger.js';
import { scoreForInsightSelection } from './inSilicoEngine.js';

const log = createLogger('MorningBriefing');

const MIN_MEMORIES_FOR_FULL_BRIEFING = 5;

/**
 * Generate a personalized morning briefing for a user.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   greeting: string,
 *   highlight: string,
 *   stats: { memoriesLearned: number, platformsConnected: number, insightsReady: number },
 *   cta: string,
 *   isGettingStarted: boolean
 * }>}
 */
export async function generateMorningBriefing(userId) {
  // Fetch all data in parallel to minimize wall time (Vercel cost rule)
  const [
    recentMemories,
    totalMemoryCount,
    platformConnections,
    pendingInsights,
    userProfile,
    todayEvents,
  ] = await Promise.all([
    fetchRecentMemories(userId),
    fetchTotalMemoryCount(userId),
    fetchPlatformConnections(userId),
    fetchPendingInsights(userId),
    fetchUserProfile(userId),
    fetchTodayCalendarEvents(userId),
  ]);

  const firstName = userProfile?.first_name || 'there';
  const memoriesLearned = totalMemoryCount;
  const platformsConnected = platformConnections.length;
  const insightsReady = pendingInsights.length;

  const stats = { memoriesLearned, platformsConnected, insightsReady };

  // Greeting uses the user's stored timezone, falling back to São Paulo (primary market)
  const userHour = getUserLocalHour(userProfile?.timezone);
  const timeGreeting = userHour < 12 ? 'Good morning' : userHour < 17 ? 'Good afternoon' : 'Good evening';

  // Low-data users get a "getting started" briefing (no LLM call = free)
  if (memoriesLearned < MIN_MEMORIES_FOR_FULL_BRIEFING) {
    return {
      greeting: `${timeGreeting}, ${firstName}`,
      highlight: buildGettingStartedHighlight(platformsConnected),
      stats,
      cta: platformsConnected === 0 ? 'Connect a platform' : 'Chat with your twin',
      isGettingStarted: true,
    };
  }

  // Full briefing: use LLM to compose a personal highlight
  const highlight = await composeBriefingHighlight({
    recentMemories,
    platformConnections,
    pendingInsights,
    todayEvents,
    firstName,
    stats,
    userId,
  });

  // Build meeting prep section (Dimension-style)
  const meetingPrep = todayEvents.length > 0
    ? todayEvents.slice(0, 5).map(e => ({
        title: e.summary || '(No title)',
        time: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day',
        attendees: (e.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email?.split('@')[0] || 'someone').slice(0, 3),
      }))
    : [];

  return {
    greeting: `${timeGreeting}, ${firstName}`,
    highlight,
    stats,
    todayEvents: meetingPrep,
    eventCount: todayEvents.length,
    cta: todayEvents.length > 0 ? 'Review your day with your twin' : 'Chat with your twin about what it\'s learning',
    isGettingStarted: false,
  };
}

/**
 * Check if a user has already received a briefing email in the last 20 hours.
 * Uses the proactive_insights table with category 'briefing_email'.
 */
export async function hasRecentBriefingEmail(userId) {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('proactive_insights')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', 'briefing_email')
    .gte('created_at', cutoff);

  return (count || 0) > 0;
}

/**
 * Record that a briefing email was sent (for cooldown tracking).
 */
export async function recordBriefingEmailSent(userId) {
  await supabaseAdmin
    .from('proactive_insights')
    .insert({
      user_id: userId,
      insight: 'Morning briefing email sent',
      urgency: 'low',
      category: 'briefing_email',
      delivered: true,
    });
}

// ── Internal helpers ─────────────────────────────────────────────────

async function fetchRecentMemories(userId) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, memory_type, importance_score, metadata')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'reflection', 'observation'])
    .gte('created_at', dayAgo)
    .order('importance_score', { ascending: false })
    .limit(20);

  return data || [];
}

async function fetchTotalMemoryCount(userId) {
  const { count } = await supabaseAdmin
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return count || 0;
}

async function fetchPlatformConnections(userId) {
  const { data } = await supabaseAdmin
    .from('platform_connections')
    .select('platform, status')
    .eq('user_id', userId)
    .eq('status', 'connected');

  return data || [];
}

async function fetchPendingInsights(userId) {
  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, insight, category')
    .eq('user_id', userId)
    .eq('delivered', false)
    .neq('category', 'briefing_email')
    .limit(10);

  return data || [];
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

async function fetchTodayCalendarEvents(userId) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult.success || !tokenResult.accessToken) return [];

    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: tokenResult.accessToken });
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
    });

    return res.data.items || [];
  } catch (err) {
    log.warn('Calendar fetch for briefing failed (non-fatal)', { userId, error: err.message });
    return [];
  }
}

function buildGettingStartedHighlight(platformsConnected) {
  if (platformsConnected === 0) {
    return 'Your twin is still learning about you. Connect Spotify or YouTube to give it something to work with.';
  }
  return 'Your twin is building its first impressions. Chat with it to help it understand you better.';
}

async function composeBriefingHighlight({ recentMemories, platformConnections, pendingInsights, todayEvents, firstName, stats, userId }) {
  // In-silico ranking: select memories that resonate most with personality axes (TRIBE v2)
  let rankedMemories = recentMemories;
  try {
    if (recentMemories.length > 3) {
      const scored = await scoreForInsightSelection(
        userId,
        recentMemories.map(m => m.content.slice(0, 150))
      );
      if (scored.length > 0 && scored[0]?.engagement_score != null) {
        // Reorder memories by predicted engagement
        const scoreMap = new Map(scored.map(s => [s.text, s.engagement_score]));
        rankedMemories = [...recentMemories].sort((a, b) => {
          const sa = scoreMap.get(a.content.slice(0, 150)) ?? 0;
          const sb = scoreMap.get(b.content.slice(0, 150)) ?? 0;
          return sb - sa;
        });
        log.info('In-silico ranked briefing memories', { userId, topScore: scored[0]?.engagement_score?.toFixed(3) });
      }
    }
  } catch (err) {
    log.warn('In-silico ranking skipped for briefing', { error: err.message });
  }

  const memorySnippets = rankedMemories
    .slice(0, 10)
    .map(m => `[${m.memory_type}] ${m.content.slice(0, 150)}`)
    .join('\n');

  const platforms = platformConnections.map(p => p.platform).join(', ');

  const insightSnippets = pendingInsights
    .slice(0, 3)
    .map(i => i.insight.slice(0, 150))
    .join('\n');

  const calendarSection = (todayEvents || []).length > 0
    ? `TODAY'S CALENDAR (${todayEvents.length} events):\n` + todayEvents.slice(0, 5).map(e => {
        const time = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day';
        const who = (e.attendees || []).filter(a => !a.self).slice(0, 2).map(a => a.displayName || a.email?.split('@')[0]).join(', ');
        return `- ${time}: ${e.summary || '(No title)'}${who ? ' with ' + who : ''}`;
      }).join('\n')
    : 'TODAY\'S CALENDAR: No events scheduled';

  const prompt = `You are composing a morning briefing highlight for ${firstName}'s daily email.
You are their digital twin — a perceptive close friend who notices patterns.

RECENT OBSERVATIONS (last 24h):
${memorySnippets || 'No recent observations'}

${calendarSection}

CONNECTED PLATFORMS: ${platforms || 'None'}

PENDING INSIGHTS:
${insightSnippets || 'None yet'}

STATS: ${stats.memoriesLearned} memories learned, ${stats.platformsConnected} platforms connected, ${stats.insightsReady} insights ready.

Write 2-3 sentences for a morning briefing:
1. Lead with today's most important event or observation (be specific)
2. Add a personal insight or pattern you noticed from their data
3. If they have meetings, mention who they're meeting and any relevant context

Write as a perceptive close friend, not a report. Reference real data.
Return ONLY the briefing text, nothing else.`;

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 80,
      temperature: 0.7,
      serviceName: 'morning-briefing-email',
    });

    const text = (result?.content || '').trim();
    if (text && text.length > 10) return text;
  } catch (err) {
    log.warn('LLM briefing highlight failed, using fallback', { error: err.message });
  }

  // Fallback: no LLM call needed
  if (stats.insightsReady > 0) {
    return `Your twin has ${stats.insightsReady} new insight${stats.insightsReady > 1 ? 's' : ''} ready for you based on recent activity.`;
  }
  return `Your twin has learned ${stats.memoriesLearned} things about you so far. See what it\'s picked up.`;
}
