/**
 * Meeting Prep Service
 * =====================
 * Core orchestrator for Dimension-style pre-meeting briefings.
 *
 * Two entry points:
 *   generateBriefing(userId, event)   — cron path, idempotent (skips if briefing exists for same event+etag)
 *   generateBriefingForChat(userId, params) — on-demand from twin chat tool, bypasses cooldown
 *
 * Pipeline:
 *   1. Fetch calendar event details
 *   2. Identify external attendees
 *   3. Research each attendee in parallel (memories + contacts + web)
 *   4. Pull user's own relevant context (recent memories)
 *   5. LLM generates structured briefing JSON
 *   6. Store in meeting_briefings + proactive_insights tables
 */

import { researchAttendees } from './attendeeResearcher.js';
import { buildBriefingPrompt } from './briefingPromptBuilder.js';
import { shouldPrepEvent, isAgentCreatedEvent } from './eventPrepFilter.js';
import { complete, TIER_ANALYSIS, TIER_CHAT } from '../llmGateway.js';
import { retrieveMemories } from '../memoryStreamService.js';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { deliverInsight } from '../messageRouter.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('MeetingPrepService');

// Look-ahead window for the calendar scan. Widened from the original 2-4h
// to 0-26h so the dashboard's 24h "next meeting" card actually has
// something to show, and a meeting 30 min out that somehow wasn't briefed
// still gets caught. Idempotency (event_id + etag) prevents re-briefing.
const LOOK_AHEAD_MIN_HOURS = 0;
const LOOK_AHEAD_MAX_HOURS = 26;

/**
 * Scan the user's Google Calendar for upcoming events worth briefing
 * (0-26h ahead). Briefs meetings with other attendees, plus solo events
 * whose title/description signals external stakes (pitch, interview,
 * contract...).
 *
 * Skips (see eventPrepFilter.js — replan-2026-06-10 Track B): all-day
 * events, declined events, generic calendar blocks, attendee-less
 * personal events (tennis, therapy), and agent-created blocks.
 *
 * Shared by the cron and the on-demand /scan endpoint.
 */
export async function fetchUpcomingExternalEvents(userId) {
  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success) return [];

  const now = new Date();
  const minTime = new Date(now.getTime() + LOOK_AHEAD_MIN_HOURS * 3600000).toISOString();
  const maxTime = new Date(now.getTime() + LOOK_AHEAD_MAX_HOURS * 3600000).toISOString();

  const params = new URLSearchParams({
    timeMin: minTime,
    timeMax: maxTime,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } },
  );
  if (!res.ok) return [];

  const data = await res.json();
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();
  const userEmail = userRow?.email || '';

  return (data.items || []).filter((event) => {
    const decision = shouldPrepEvent(event, userEmail);
    if (!decision.prep) {
      log.debug('Skipping event for prep', { title: event.summary, reason: decision.reason });
    }
    return decision.prep;
  });
}

async function fetchCalendarEvent(userId, eventId) {
  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success) return null;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

async function getUserInfo(userId) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('name, first_name, email')
    .eq('id', userId)
    .single();
  return data;
}

function parseAttendees(gcalEvent, userEmail) {
  const attendees = gcalEvent.attendees || [];
  const userDomain = userEmail ? userEmail.split('@')[1] : null;

  return attendees
    // `!a.self` matters when the attendee email is an alias of the user's —
    // without it the researcher profiles the user as a stranger it googled
    // (replan-2026-06-10: "Stefano Gebara — likely a developer...").
    .filter(a => a.email !== userEmail && !a.resource && !a.self)
    .map(a => ({
      email: a.email,
      name: a.displayName || null,
      responseStatus: a.responseStatus,
      isExternal: userDomain ? !a.email.endsWith(`@${userDomain}`) : true,
    }));
}

function formatDuration(gcalEvent) {
  const start = new Date(gcalEvent.start?.dateTime || gcalEvent.start?.date);
  const end = new Date(gcalEvent.end?.dateTime || gcalEvent.end?.date);
  return Math.round((end - start) / 60000);
}

async function storeBriefing(userId, eventId, etag, briefing, rawJson, gcalEvent = null) {
  // Embed event metadata into briefing_json under _meta so the GET endpoint
  // can render upcoming/past meetings without re-hitting Google Calendar.
  // Old rows without _meta still work — frontend handles missing values.
  const enriched = gcalEvent ? {
    ...rawJson,
    _meta: {
      summary: gcalEvent.summary || null,
      startTime: gcalEvent.start?.dateTime || gcalEvent.start?.date || null,
      endTime: gcalEvent.end?.dateTime || gcalEvent.end?.date || null,
      location: gcalEvent.location || null,
      hangoutLink: gcalEvent.hangoutLink || null,
      meetingUrl: gcalEvent.conferenceData?.entryPoints?.[0]?.uri || null,
      attendees: (gcalEvent.attendees || []).map((a) => ({
        email: a.email,
        name: a.displayName || null,
        responseStatus: a.responseStatus || null,
        organizer: !!a.organizer,
      })),
    },
  } : rawJson;

  await supabaseAdmin.from('meeting_briefings').upsert(
    {
      user_id: userId,
      event_id: eventId,
      event_etag: etag,
      headline: briefing.headline,
      briefing_json: enriched,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,event_id' }
  );
}

async function storeAsProactiveInsight(userId, briefing, eventSummary) {
  const text = `Meeting prep for "${eventSummary}": ${briefing.headline}`;

  const { data } = await supabaseAdmin.from('proactive_insights').insert({
    user_id: userId,
    insight: text,
    category: 'meeting_prep',
    urgency: 'high',
    delivered: false,
    metadata: { briefing_json: briefing },
  }).select('id, insight, category, urgency, metadata').single();

  return data;
}

// Honorifics + generic appointment words to strip when deriving the
// memory-search query from a solo-appointment title. "Dra Ana Academia da
// Mente" → "Ana Academia Mente" → still a strong semantic anchor.
const TITLE_STOPWORDS = new Set([
  'dr', 'dra', 'dr.', 'dra.', 'sr', 'sra', 'sr.', 'sra.', 'mr', 'mrs', 'ms',
  'reuniao', 'reunião', 'meeting', 'call', 'sync', 'catchup', 'catch-up',
  'com', 'with', 'de', 'da', 'do', 'the', 'a', 'o', 'e', '1:1', '1on1',
  'consulta', 'sessao', 'sessão', 'appointment', 'appt',
]);

function deriveMemoryQuery(eventSummary) {
  if (!eventSummary) return '';
  return eventSummary
    .split(/\s+/)
    .filter((w) => w && !TITLE_STOPWORDS.has(w.toLowerCase().replace(/[.,]/g, '')))
    .join(' ')
    .trim();
}

/**
 * Build the user's own context for the briefing.
 *
 * For meetings with external attendees, a single broad retrieval is enough —
 * the attendee research carries most of the weight.
 *
 * For SOLO appointments (no other attendees — a doctor, a 1:1, a personal
 * appointment), there's no attendee research to lean on, so we do richer
 * retrieval: the raw title (direct semantic match) AND a stopword-stripped
 * keyword query, deduped, more memories. This is what makes "Dra Ana
 * Academia da Mente" prep actually reference the user's past reflections
 * and health context instead of generic filler.
 */
async function buildUserContext(userId, eventSummary, attendeeCount = 0) {
  const isSolo = attendeeCount === 0;

  if (!isSolo) {
    const memories = await retrieveMemories(
      userId,
      `meeting ${eventSummary} upcoming context priorities`,
      5,
      { weights: [0.8, 0.7, 1.0] },
    ).catch(() => []);
    return { recentMemories: memories.map((m) => m.content).slice(0, 5) };
  }

  // Solo appointment — two retrievals, deduped, deeper.
  const keywordQuery = deriveMemoryQuery(eventSummary);
  const [byTitle, byKeyword] = await Promise.all([
    retrieveMemories(userId, eventSummary, 6, { weights: [0.5, 0.7, 1.0] }).catch(() => []),
    keywordQuery && keywordQuery !== eventSummary
      ? retrieveMemories(userId, keywordQuery, 6, { weights: [0.4, 0.7, 1.0] }).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Dedupe by content, keep order (title-match first — it's the strongest signal).
  const seen = new Set();
  const merged = [];
  for (const m of [...byTitle, ...byKeyword]) {
    const c = (m.content || '').trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    merged.push(c);
  }

  return { recentMemories: merged.slice(0, 8) };
}

async function generateBriefingForEvent(userId, gcalEvent) {
  const userInfo = await getUserInfo(userId);
  const userEmail = userInfo?.email;
  const userName = userInfo?.first_name || userInfo?.name;

  const attendees = parseAttendees(gcalEvent, userEmail);

  const [attendeeResearch, userContext] = await Promise.all([
    researchAttendees(userId, attendees),
    buildUserContext(userId, gcalEvent.summary || '', attendees.length),
  ]);

  const eventPayload = {
    summary: gcalEvent.summary,
    startTime: gcalEvent.start?.dateTime || gcalEvent.start?.date,
    durationMinutes: formatDuration(gcalEvent),
    description: gcalEvent.description,
  };

  const prompt = buildBriefingPrompt({
    event: eventPayload,
    attendeeResearch,
    userContext: { ...userContext, name: userName },
  });

  let result;
  try {
    result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      temperature: 0.3,
    });
  } catch (err) {
    // Fallback to Claude if DeepSeek times out — meeting prep is high-value
    log.warn('TIER_ANALYSIS failed for briefing, falling back to TIER_CHAT', { error: err.message });
    result = await complete({
      tier: TIER_CHAT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      temperature: 0.3,
    });
  }

  const text = result.content?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) throw new Error('LLM returned no JSON');

  return JSON.parse(jsonMatch[0]);
}

export async function generateBriefing(userId, gcalEvent) {
  // Defense in depth: the scan filter already drops agent-created events,
  // but any future caller passing a raw event must not brief the agent's
  // own blocks either (replan-2026-06-10 circular content loop).
  if (isAgentCreatedEvent(gcalEvent)) {
    log.debug('Skipping agent-created event', { eventId: gcalEvent.id, title: gcalEvent.summary });
    return null;
  }

  const eventId = gcalEvent.id;
  const etag = gcalEvent.etag;

  const { data: existing } = await supabaseAdmin
    .from('meeting_briefings')
    .select('id, event_etag')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing && existing.event_etag === etag) {
    log.debug('Briefing already up-to-date', { eventId });
    return null;
  }

  log.info('Generating meeting briefing', { eventId, title: gcalEvent.summary });

  const briefing = await generateBriefingForEvent(userId, gcalEvent);

  const [, insightRow] = await Promise.all([
    storeBriefing(userId, eventId, etag, briefing, briefing, gcalEvent),
    storeAsProactiveInsight(userId, briefing, gcalEvent.summary || 'upcoming meeting'),
  ]);

  // Deliver immediately — don't wait for the hourly deliver-insights cron
  if (insightRow) {
    deliverInsight(userId, insightRow).catch(err =>
      log.warn('Immediate delivery failed', { userId, error: err.message })
    );
  }

  return briefing;
}

export async function generateBriefingForChat(userId, params) {
  const { eventId, summary } = params || {};

  let gcalEvent = null;

  if (eventId) {
    gcalEvent = await fetchCalendarEvent(userId, eventId);
  }

  if (!gcalEvent) {
    if (summary) {
      gcalEvent = {
        id: `chat-${Date.now()}`,
        etag: null,
        summary,
        description: null,
        start: { dateTime: new Date().toISOString() },
        end: { dateTime: new Date(Date.now() + 60 * 60000).toISOString() },
        attendees: [],
      };
    } else {
      return { success: false, error: 'Could not find calendar event. Provide an eventId or meeting title.' };
    }
  }

  try {
    const briefing = await generateBriefingForEvent(userId, gcalEvent);

    if (eventId) {
      await storeBriefing(userId, eventId, gcalEvent.etag, briefing, briefing, gcalEvent).catch(() => {});
    }

    return { success: true, briefing };
  } catch (err) {
    log.error('generateBriefingForChat failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Read already-generated briefings for the twin chat's get_meeting_prep
 * tool. Reads from meeting_briefings (no LLM regeneration) and returns a
 * compact, twin-speakable shape split into inProgress / upcoming / recent.
 *
 * A meeting is "in progress" when it has started but not yet ended — the
 * twin should talk about it as happening right now, not as past or future.
 *
 * timeframe: 'upcoming' | 'recent' | 'all'
 */
export async function listMeetingBriefingsForChat(userId, timeframe = 'upcoming') {
  const windowMs = 14 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data, error } = await supabaseAdmin
    .from('meeting_briefings')
    .select('event_id, generated_at, headline, briefing_json')
    .eq('user_id', userId)
    .gte('generated_at', since)
    .order('generated_at', { ascending: false })
    .limit(40);

  if (error) {
    return { success: false, error: error.message };
  }

  const now = Date.now();
  const compact = (row) => {
    const bj = row.briefing_json || {};
    const meta = bj._meta || {};
    return {
      title: meta.summary || bj.headline || 'meeting',
      startTime: meta.startTime || null,
      endTime: meta.endTime || null,
      headline: bj.headline || null,
      talkingPoints: Array.isArray(bj.talkingPoints) ? bj.talkingPoints.slice(0, 4) : [],
      watchOuts: Array.isArray(bj.watchOuts) ? bj.watchOuts.slice(0, 3) : [],
      attendees: Array.isArray(bj.attendees)
        ? bj.attendees.map((a) => a.name).filter(Boolean)
        : [],
      hasDebrief: !!bj.debrief,
      debriefSummary: bj.debrief?.summary || null,
    };
  };

  const inProgress = [];
  const upcoming = [];
  const recent = [];
  for (const row of data || []) {
    const meta = row.briefing_json?._meta || {};
    const startMs = meta.startTime ? new Date(meta.startTime).getTime() : null;
    const endMs = meta.endTime
      ? new Date(meta.endTime).getTime()
      : (startMs !== null ? startMs + 60 * 60 * 1000 : null);
    const item = compact(row);
    if (startMs !== null && startMs <= now && endMs !== null && now < endMs) {
      inProgress.push(item);
    } else if (startMs !== null && startMs > now) {
      upcoming.push(item);
    } else {
      recent.push(item);
    }
  }
  inProgress.sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));
  upcoming.sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));

  if (timeframe === 'upcoming') {
    // "In progress" meetings are surfaced alongside upcoming — when the user
    // asks "what's next", a meeting happening right now is the most relevant
    // answer, not something to bury under "recent".
    const meetings = [...inProgress, ...upcoming];
    return {
      success: true,
      timeframe,
      count: meetings.length,
      inProgressCount: inProgress.length,
      meetings,
      note: meetings.length === 0
        ? 'No upcoming meetings have been briefed. The user can hit "Atualizar" on the /meetings page to scan their calendar now.'
        : undefined,
    };
  }
  if (timeframe === 'recent') {
    return { success: true, timeframe, count: recent.length, meetings: recent.slice(0, 10) };
  }
  return {
    success: true,
    timeframe: 'all',
    inProgress,
    upcoming,
    recent: recent.slice(0, 10),
  };
}
