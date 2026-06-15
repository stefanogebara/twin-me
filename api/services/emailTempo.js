/**
 * Email Tempo — does a packed calendar push your email into the night? (2026-06-15)
 * ================================================================================
 * The second Whoop-FREE self-revelation, and the most universal yet: it runs on
 * Gmail + Calendar, which nearly every user has. The question it answers: when
 * your day fills up with meetings, does your real correspondence get shoved into
 * the evening?
 *
 * Signal A: per-day SENT email, bucketed to your LOCAL day/hour (via your
 *   calendar's timezone) — total sent + how many went out after EVENING_HOUR.
 * Signal B: per-day meeting load (non-all-day calendar events).
 * Correlation: the share of your email sent late, on your busiest vs lightest
 *   meeting days. Meetings displacing email into the night is the tell.
 *
 * Same shape as the other correlations (gather -> pure tested core -> candidate
 * -> salience Editor). Privacy: reads only message timestamps (internalDate),
 * never subjects, senders, or bodies. The calendar-load fetch, timezone lookup,
 * local-time bucketing, and tercile helpers are shared from correlationSignals.js
 * (localParts is re-exported here for back-compat with its callers).
 */
import { getValidAccessToken } from './tokenRefreshService.js';
import { editInsights } from './insightEditor.js';
import { supabaseAdmin } from './database.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';
import {
  localParts,
  tercileHigh,
  tercileLow,
  fetchTimeZone,
  fetchCalendarLoadDays,
} from './correlationSignals.js';

export { localParts };

const log = createLogger('EmailTempo');

export const WINDOW_DAYS = 28;
export const EVENING_HOUR = 19; // 7pm — "after hours" boundary
export const LATE_SHARE_FLOOR = 0.12; // 12 percentage-point gap to be worth saying
const MIN_DAYS = 10;
const MIN_GROUP_DAYS = 4;
const MIN_GROUP_EMAILS = 8;
const MAX_SENT = 120; // bound the per-message internalDate fetches (Vercel cost)
const FETCH_CHUNK = 12;

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Compare the share of email sent after EVENING_HOUR on high-meeting-load vs
 * low-load days. Pools emails per group (per-day ratios are too noisy when a
 * day has 1-2 sends), gates on volume + an absolute share gap.
 * @param {Array<{date,sentCount:number,lateCount:number,load:number}>} days
 * @returns {object|null}
 */
export function computeEmailTempo(days, { lateShareFloor = LATE_SHARE_FLOOR } = {}) {
  if (!Array.isArray(days) || days.length < MIN_DAYS) return null;
  const withBoth = days.filter(
    (d) => typeof d.sentCount === 'number' && typeof d.load === 'number' && d.sentCount > 0,
  );
  if (withBoth.length < MIN_DAYS) return null;

  const loads = withBoth.map((d) => d.load);
  const hi = tercileHigh(loads), lo = tercileLow(loads);
  if (hi <= lo) return null; // no spread in meeting load

  const highDays = withBoth.filter((d) => d.load >= hi);
  const lowDays = withBoth.filter((d) => d.load <= lo);
  if (highDays.length < MIN_GROUP_DAYS || lowDays.length < MIN_GROUP_DAYS) return null;

  const sumSent = (g) => g.reduce((s, d) => s + d.sentCount, 0);
  const sumLate = (g) => g.reduce((s, d) => s + (d.lateCount || 0), 0);
  const sentHigh = sumSent(highDays), sentLow = sumSent(lowDays);
  if (sentHigh < MIN_GROUP_EMAILS || sentLow < MIN_GROUP_EMAILS) return null;

  const shareHigh = sumLate(highDays) / sentHigh;
  const shareLow = sumLate(lowDays) / sentLow;
  const effect = shareHigh - shareLow; // +ve = busy days push email later
  if (Math.abs(effect) < lateShareFloor) return null;

  return {
    effect,
    lateShareHighPct: Math.round(shareHigh * 100),
    lateShareLowPct: Math.round(shareLow * 100),
    deltaPts: Math.round(Math.abs(effect) * 100),
    nHigh: highDays.length,
    nLow: lowDays.length,
    eveningHour: EVENING_HOUR,
  };
}

/** PURE. Candidate text (Editor voices it). One number, house style. */
export function buildEmailTempoCandidate(t) {
  if (!t) return null;
  const h = t.eveningHour ?? EVENING_HOUR;
  const after = `${h > 12 ? h - 12 : h}pm`;
  if (t.effect > 0) {
    return `On your most packed meeting days, a noticeably larger share of your emails go out after ${after} — about ${t.deltaPts} points more than on your lighter days. Meetings seem to push your real correspondence into the evening.`;
  }
  return `On your most packed meeting days you send a smaller share of late-evening emails than on lighter days — about ${t.deltaPts} points fewer after ${after}. A full calendar seems to compress your email into the workday.`;
}

// ── gather (I/O, graceful) ───────────────────────────────────────────────────
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function fetchSentDays(userId, timeZone) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_gmail');
    if (!tokenResult?.success || !tokenResult.accessToken) {
      log.warn('gmail token unavailable', { error: tokenResult?.error });
      return new Map();
    }
    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
    const listRes = await fetch(
      `${GMAIL_BASE}/messages?labelIds=SENT&maxResults=${MAX_SENT}&q=newer_than:${WINDOW_DAYS}d`,
      { headers },
    );
    if (!listRes.ok) {
      log.warn('gmail sent list failed', { status: listRes.status });
      return new Map();
    }
    const ids = (await listRes.json()).messages?.map((m) => m.id) || [];
    const map = new Map(); // date -> { sentCount, lateCount }
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
        const { date, hour } = localParts(epoch, timeZone);
        const bucket = map.get(date) || { sentCount: 0, lateCount: 0 };
        bucket.sentCount += 1;
        if (hour >= EVENING_HOUR) bucket.lateCount += 1;
        map.set(date, bucket);
      }
    }
    return map;
  } catch (err) {
    log.warn('gmail sent fetch failed', { error: err.message });
    return new Map();
  }
}

export async function gatherEmailDays(userId) {
  const timeZone = await fetchTimeZone(userId);
  const [sentMap, loadMap] = await Promise.all([
    fetchSentDays(userId, timeZone),
    fetchCalendarLoadDays(userId, timeZone),
  ]);
  if (sentMap.size === 0 && loadMap.size === 0) return [];
  const dates = new Set([...sentMap.keys(), ...loadMap.keys()]);
  const days = [];
  for (const date of dates) {
    const s = sentMap.get(date) || { sentCount: 0, lateCount: 0 };
    days.push({ date, sentCount: s.sentCount, lateCount: s.lateCount, load: loadMap.get(date) ?? 0 });
  }
  return days;
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export async function generateEmailTempoInsight(userId, { logOnly = false } = {}) {
  const days = await gatherEmailDays(userId);
  if (days.length < MIN_DAYS) {
    log.info('insufficient days for email tempo', { userId, days: days.length });
    return null;
  }
  const tempo = computeEmailTempo(days);
  const candidate = buildEmailTempoCandidate(tempo);
  log.info('email tempo computed', {
    userId, days: days.length,
    tempo: tempo ? { effect: tempo.effect.toFixed(2), deltaPts: tempo.deltaPts, nHigh: tempo.nHigh } : null,
  });
  if (!candidate) return null;

  log.info('email tempo candidate', { userId, candidate });
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
  if (error) { log.warn('failed to store email tempo insight', { userId, error: error.message }); return null; }
  log.info('email tempo insight stored', { userId });
  return chosen;
}
