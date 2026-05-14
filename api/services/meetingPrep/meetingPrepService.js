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
import { complete, TIER_ANALYSIS, TIER_CHAT } from '../llmGateway.js';
import { retrieveMemories } from '../memoryStreamService.js';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { deliverInsight } from '../messageRouter.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('MeetingPrepService');

const USER_EMAIL_DOMAINS = new Set(); // populated per-call from user's own email

// Look-ahead window for the calendar scan. Widened from the original 2-4h
// to 0-26h so the dashboard's 24h "next meeting" card actually has
// something to show, and a meeting 30 min out that somehow wasn't briefed
// still gets caught. Idempotency (event_id + etag) prevents re-briefing.
const LOOK_AHEAD_MIN_HOURS = 0;
const LOOK_AHEAD_MAX_HOURS = 26;

// Generic calendar-block titles that aren't real appointments — focus time,
// lunch holds, "busy" exports from other calendars, etc. Briefing these is
// noise. Matched case-insensitively against the whole title.
const GENERIC_BLOCK_PATTERNS = [
  /^busy$/i,
  /^blocked?$/i,
  /^focus(\s*time)?$/i,
  /^lunch$/i,
  /^break$/i,
  /^hold$/i,
  /^ooo$/i,
  /^out of office$/i,
  /^dnd$/i,
  /^do not disturb$/i,
  /^free$/i,
  /^tentative$/i,
  /^private$/i,
];

function isGenericBlock(summary) {
  if (!summary) return true; // untitled events aren't worth briefing
  const trimmed = summary.trim();
  return GENERIC_BLOCK_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Scan the user's Google Calendar for upcoming events worth briefing
 * (0-26h ahead). Briefs ANY real timed appointment — multi-person business
 * meetings AND solo appointments (a doctor, a hairdresser, a 1:1) — because
 * a real personal calendar is mostly the latter and they're all worth
 * walking in prepared for.
 *
 * Skips: all-day events (no dateTime), events the user has declined,
 * and generic calendar blocks (focus time, "busy", lunch holds).
 *
 * Shared by the cron and the on-demand /scan endpoint.
 * (Kept the name fetchUpcomingExternalEvents for import compat — the
 *  behaviour is now "all real meetings", not "external-attendee only".)
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
    // Timed events only — all-day events (start.date instead of dateTime)
    // are usually birthdays, OOO, multi-day trips — not appointments to prep.
    if (!event.start?.dateTime) return false;

    // Skip generic calendar blocks (focus time, busy, lunch).
    if (isGenericBlock(event.summary)) return false;

    // Skip events the user explicitly declined.
    const selfAttendee = (event.attendees || []).find((a) => a.email === userEmail || a.self);
    if (selfAttendee?.responseStatus === 'declined') return false;

    // Everything else — solo appointments AND multi-person meetings — is
    // worth a briefing. Attendee research just runs lighter when there
    // are no other attendees.
    return true;
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
    .filter(a => a.email !== userEmail && !a.resource)
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

async function buildUserContext(userId, eventSummary) {
  const memories = await retrieveMemories(
    userId,
    `meeting ${eventSummary} upcoming context priorities`,
    5,
    { weights: [0.8, 0.7, 1.0] }
  ).catch(() => []);

  return {
    recentMemories: memories.map(m => m.content).slice(0, 5),
  };
}

async function generateBriefingForEvent(userId, gcalEvent) {
  const userInfo = await getUserInfo(userId);
  const userEmail = userInfo?.email;
  const userName = userInfo?.first_name || userInfo?.name;

  const attendees = parseAttendees(gcalEvent, userEmail);

  const [attendeeResearch, userContext] = await Promise.all([
    researchAttendees(userId, attendees),
    buildUserContext(userId, gcalEvent.summary || ''),
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
