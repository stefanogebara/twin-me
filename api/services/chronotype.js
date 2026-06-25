/**
 * Chronotype — does your calendar run on the same clock as your energy? (2026-06-15)
 * =================================================================================
 * The third Whoop-FREE self-revelation. It needs only Gmail + Calendar, and it
 * answers a question people are genuinely curious about: am I scheduling my day
 * against my own rhythm?
 *
 * Signal A: when you're naturally most active — the hour-of-day distribution of
 *   the email you SEND (self-initiated, a decent "at the keyboard, engaged" proxy).
 * Signal B: when your meetings cluster — the hour-of-day distribution of events.
 * Finding: surface only when your activity peak and your meeting peak sit on
 *   different parts of the day (your energy and your calendar disagree).
 *
 * Privacy: reads only message timestamps, never content. Same factory shape as
 * the other correlations (gather -> pure tested core -> candidate -> Editor).
 */
import { getValidAccessToken } from './tokenRefreshService.js';
import { createCalendarClient } from './calendar/client.js';
import { localParts, fetchTimeZone } from './correlationSignals.js';
import { editInsights } from './insightEditor.js';
import { supabaseAdmin } from './database.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('Chronotype');

export const WINDOW_DAYS = 28;
export const GAP_FLOOR = 3; // hours between activity peak and meeting peak to be worth saying
const MIN_ACTIVITY = 15; // sent emails needed to read a rhythm
const MIN_MEETINGS = 10;
const MAX_SENT = 150;
const FETCH_CHUNK = 12;
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * PURE. Center hour of the densest `windowSize`-hour window in an hour list.
 * Wraps around midnight. @returns {number|null} 0-23
 */
export function peakWindowCenter(hours, windowSize = 3) {
  if (!Array.isArray(hours) || hours.length === 0) return null;
  const counts = new Array(24).fill(0);
  for (const h of hours) {
    const hr = Math.floor(h);
    if (hr >= 0 && hr < 24) counts[hr] += 1;
  }
  let best = -1, bestStart = 0;
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let k = 0; k < windowSize; k++) c += counts[(s + k) % 24];
    if (c > best) { best = c; bestStart = s; }
  }
  return (bestStart + Math.floor(windowSize / 2)) % 24;
}

/** PURE. Signed hour difference a-b on a 24h clock, in (-12, 12]. */
export function circularHourDiff(a, b) {
  let d = (((a - b) % 24) + 24) % 24; // 0..23
  if (d > 12) d -= 24;
  return d;
}

/** PURE. Time-of-day label for an hour. */
export function hourLabel(h) {
  if (h >= 5 && h < 8) return 'early morning';
  if (h >= 8 && h < 11) return 'morning';
  if (h >= 11 && h < 13) return 'late morning';
  if (h >= 13 && h < 16) return 'early afternoon';
  if (h >= 16 && h < 18) return 'late afternoon';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}

/**
 * Compare when you're active vs when your meetings sit. Returns a finding only
 * if the two peaks are at least gapFloor hours apart.
 * @param {{activityHours:number[], meetingHours:number[]}} signals
 */
export function computeChronotype(
  { activityHours = [], meetingHours = [] } = {},
  { gapFloor = GAP_FLOOR, minActivity = MIN_ACTIVITY, minMeetings = MIN_MEETINGS } = {},
) {
  if (activityHours.length < minActivity || meetingHours.length < minMeetings) return null;
  const activityPeak = peakWindowCenter(activityHours);
  const meetingPeak = peakWindowCenter(meetingHours);
  if (activityPeak == null || meetingPeak == null) return null;
  const gap = circularHourDiff(meetingPeak, activityPeak); // +ve = meetings later than your peak
  if (Math.abs(gap) < gapFloor) return null;
  return {
    activityPeak,
    meetingPeak,
    gap,
    activityLabel: hourLabel(activityPeak),
    meetingLabel: hourLabel(meetingPeak),
  };
}

/** PURE. Candidate text (Editor voices it). Labels, not raw numbers. */
export function buildChronotypeCandidate(c) {
  if (!c) return null;
  if (c.activityLabel === c.meetingLabel) return null; // same slice -> nothing surprising
  return `You're most active in the ${c.activityLabel} — that's when you actually send and get things done — but your meetings cluster in the ${c.meetingLabel}. Your calendar and your energy seem to run on different clocks.`;
}

// ── gather (I/O, graceful) ───────────────────────────────────────────────────
async function fetchActivityHours(userId, timeZone) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_gmail');
    if (!tokenResult?.success || !tokenResult.accessToken) {
      log.warn('gmail token unavailable', { error: tokenResult?.error });
      return [];
    }
    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
    const listRes = await fetch(
      `${GMAIL_BASE}/messages?labelIds=SENT&maxResults=${MAX_SENT}&q=newer_than:${WINDOW_DAYS}d`,
      { headers },
    );
    if (!listRes.ok) {
      log.warn('gmail sent list failed', { status: listRes.status });
      return [];
    }
    const ids = (await listRes.json()).messages?.map((m) => m.id) || [];
    const hours = [];
    for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
      const chunk = ids.slice(i, i + FETCH_CHUNK);
      const results = await Promise.all(
        chunk.map((id) =>
          fetch(`${GMAIL_BASE}/messages/${id}?format=minimal`, { headers })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      );
      for (const msg of results) {
        const epoch = Number(msg?.internalDate);
        if (!epoch) continue;
        hours.push(localParts(epoch, timeZone).hour);
      }
    }
    return hours;
  } catch (err) {
    log.warn('gmail activity fetch failed', { error: err.message });
    return [];
  }
}

async function fetchMeetingHours(userId, timeZone) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult?.success || !tokenResult.accessToken) {
      log.warn('calendar token unavailable', { error: tokenResult?.error });
      return [];
    }
    const client = createCalendarClient({ accessToken: tokenResult.accessToken });
    const now = new Date();
    const start = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
    const q = `?timeMin=${start.toISOString()}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=2500`;
    const result = await client.get(`/calendars/primary/events${q}`).catch(() => ({ items: [] }));
    const items = Array.isArray(result?.items) ? result.items : [];
    const hours = [];
    for (const e of items) {
      if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
      const dt = e.start?.dateTime;
      if (!dt) continue; // skip all-day (date only)
      const self = (e.attendees || []).find((a) => a.self);
      if (self?.responseStatus === 'declined') continue;
      // Normalize to the user's calendar tz (events may arrive offset OR UTC-Z),
      // matching how email hours are bucketed and how the user sees their grid.
      const epoch = new Date(dt).getTime();
      if (Number.isNaN(epoch)) continue;
      hours.push(localParts(epoch, timeZone).hour);
    }
    return hours;
  } catch (err) {
    log.warn('calendar hours fetch failed', { error: err.message });
    return [];
  }
}

export async function gatherChronotypeSignals(userId) {
  const timeZone = await fetchTimeZone(userId);
  const [activityHours, meetingHours] = await Promise.all([
    fetchActivityHours(userId, timeZone),
    fetchMeetingHours(userId, timeZone),
  ]);
  return { activityHours, meetingHours };
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export async function generateChronotypeInsight(userId, { logOnly = false } = {}) {
  const signals = await gatherChronotypeSignals(userId);
  const chrono = computeChronotype(signals);
  const candidate = buildChronotypeCandidate(chrono);
  log.info('chronotype computed', {
    userId,
    activity: signals.activityHours.length,
    meetings: signals.meetingHours.length,
    chrono: chrono ? { activityPeak: chrono.activityPeak, meetingPeak: chrono.meetingPeak, gap: chrono.gap } : null,
  });
  if (!candidate) return null;

  log.info('chronotype candidate', { userId, candidate });
  if (logOnly) return null;

  const chosen = await editInsights(userId, [{ insight: candidate, urgency: 'low', category: 'work_rhythm' }]);
  if (!chosen) return null;

  const insertData = {
    user_id: userId,
    insight: chosen.insight,
    urgency: chosen.urgency,
    category: chosen.category || 'work_rhythm',
    surfaced_at: new Date().toISOString(),
    sources: ['google_calendar', 'google_gmail'],
  };
  if (chosen.embedding) insertData.embedding = vectorToString(chosen.embedding);
  const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
  if (error) { log.warn('failed to store chronotype insight', { userId, error: error.message }); return null; }
  log.info('chronotype insight stored', { userId });
  return chosen;
}
