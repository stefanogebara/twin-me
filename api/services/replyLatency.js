/**
 * Reply Latency — does a packed calendar slow your email replies? (2026-06-15)
 * ===========================================================================
 * The fourth Whoop-FREE self-revelation, and the most resonant Gmail one: when
 * your day fills with meetings, do the people waiting on you wait longer?
 *
 * Signal A: reply latency — for each thread, the gap between an inbound message
 *   and your reply to it (a "reply turn" = a message you sent directly after
 *   one you received). Bucketed by the day the inbound message ARRIVED.
 * Signal B: per-day meeting load.
 * Correlation: median reply latency on your busiest vs lightest meeting days.
 *
 * Cost note: this is the heaviest insight — it reads thread structure. We derive
 * unique thread ids from one SENT list (threadId comes back inline), then fetch
 * each thread once with format=minimal (labelIds + internalDate only, no content),
 * capped at MAX_THREADS. Privacy: timestamps + the SENT label, never content.
 */
import { getValidAccessToken } from './tokenRefreshService.js';
import { localParts, tercileHigh, tercileLow, fetchTimeZone, fetchCalendarLoadDays } from './correlationSignals.js';
import { editInsights } from './insightEditor.js';
import { supabaseAdmin } from './database.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('ReplyLatency');

export const WINDOW_DAYS = 28;
export const LATENCY_FLOOR_HRS = 1.5; // min absolute gap worth saying
export const MAX_LATENCY_MS = 14 * 86400_000; // drop stale replies (not "responsiveness")
const RATIO_LO = 0.67, RATIO_HI = 1.5; // also require a meaningful relative shift
const MIN_DAYS = 10;
const MIN_GROUP_DAYS = 4;
const MIN_REPLIES = 8; // per load group
const MAX_SENT = 150;
const MAX_THREADS = 60; // cost cap on threads.get
const FETCH_CHUNK = 10;
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ── tiny pure helpers ────────────────────────────────────────────────────────
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

/** PURE. Median of a numeric list (null if empty). */
export function median(nums) {
  const v = [...(nums || [])].filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * PURE. Extract reply turns from a thread's messages. A reply turn is a message
 * you sent directly after one you received — that captures genuine back-and-forth
 * and avoids double-counting when you send twice in a row.
 * @param {Array<{internalDate, fromMe}>} messages
 * @returns {Array<{inboundEpoch:number, latencyMs:number}>}
 */
export function extractReplyTurns(messages, { maxLatencyMs = MAX_LATENCY_MS } = {}) {
  const msgs = (messages || [])
    .map((m) => ({ epoch: Number(m.internalDate), fromMe: !!m.fromMe }))
    .filter((m) => m.epoch > 0)
    .sort((a, b) => a.epoch - b.epoch);
  const turns = [];
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].fromMe && !msgs[i - 1].fromMe) {
      const latencyMs = msgs[i].epoch - msgs[i - 1].epoch;
      if (latencyMs > 0 && latencyMs <= maxLatencyMs) {
        turns.push({ inboundEpoch: msgs[i - 1].epoch, latencyMs });
      }
    }
  }
  return turns;
}

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Compare median reply latency on high-meeting-load vs low-load days. Pools all
 * reply samples per group (median is robust to the odd days-long outlier).
 * @param {Array<{date,latencies:number[],load:number}>} days latencies in HOURS
 */
export function computeReplyLatency(days, { latencyFloorHrs = LATENCY_FLOOR_HRS } = {}) {
  if (!Array.isArray(days) || days.length < MIN_DAYS) return null;
  const withBoth = days.filter(
    (d) => Array.isArray(d.latencies) && d.latencies.length > 0 && typeof d.load === 'number',
  );
  if (withBoth.length < MIN_DAYS) return null;

  const loads = withBoth.map((d) => d.load);
  const hi = tercileHigh(loads), lo = tercileLow(loads);
  if (hi <= lo) return null;

  const highDays = withBoth.filter((d) => d.load >= hi);
  const lowDays = withBoth.filter((d) => d.load <= lo);
  if (highDays.length < MIN_GROUP_DAYS || lowDays.length < MIN_GROUP_DAYS) return null;

  const flat = (g) => g.flatMap((d) => d.latencies);
  const highLat = flat(highDays), lowLat = flat(lowDays);
  if (highLat.length < MIN_REPLIES || lowLat.length < MIN_REPLIES) return null;

  const hMed = median(highLat), lMed = median(lowLat);
  if (hMed == null || lMed == null || lMed <= 0) return null;
  const effect = hMed - lMed; // hours; +ve = slower on busy days
  const ratio = hMed / lMed;
  if (Math.abs(effect) < latencyFloorHrs) return null;
  if (ratio > RATIO_LO && ratio < RATIO_HI) return null; // shift too small to be real

  return {
    effect,
    highMedianHrs: round1(hMed),
    lowMedianHrs: round1(lMed),
    ratio: round2(ratio),
    nHigh: highDays.length,
    nLow: lowDays.length,
    repliesHigh: highLat.length,
    repliesLow: lowLat.length,
  };
}

/** PURE. Humanize an hours delta to a phrase. */
export function humanizeHours(h) {
  const a = Math.abs(h);
  if (a < 1) return 'under an hour';
  if (a < 2) return 'about an hour';
  if (a < 24) return `about ${Math.round(a)} hours`;
  const d = a / 24;
  return d < 1.5 ? 'about a day' : `about ${Math.round(d)} days`;
}

/** PURE. Candidate text (Editor voices it). One humanized number. */
export function buildReplyLatencyCandidate(r) {
  if (!r) return null;
  const amount = humanizeHours(r.effect);
  if (r.effect > 0) {
    return `On your most packed meeting days, the emails you answer wait ${amount} longer for a reply than on your lighter days. A full calendar quietly pushes your responses back.`;
  }
  return `On your most packed meeting days you actually reply ${amount} faster than on your lighter days — a full calendar seems to sharpen your turnaround.`;
}

// ── gather (I/O, graceful) ───────────────────────────────────────────────────
async function fetchReplyLatencyDays(userId, timeZone) {
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
    const sent = (await listRes.json()).messages || [];
    const threadIds = [...new Set(sent.map((m) => m.threadId).filter(Boolean))].slice(0, MAX_THREADS);
    const windowStart = Date.now() - WINDOW_DAYS * 86400_000;
    const map = new Map(); // date -> latencies[] (hours)

    for (let i = 0; i < threadIds.length; i += FETCH_CHUNK) {
      const chunk = threadIds.slice(i, i + FETCH_CHUNK);
      const threads = await Promise.all(
        chunk.map((id) =>
          fetch(`${GMAIL_BASE}/threads/${id}?format=minimal`, { headers })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      );
      for (const thread of threads) {
        const messages = (thread?.messages || []).map((m) => ({
          internalDate: m.internalDate,
          fromMe: Array.isArray(m.labelIds) && m.labelIds.includes('SENT'),
        }));
        for (const turn of extractReplyTurns(messages)) {
          if (turn.inboundEpoch < windowStart) continue; // keep correlation inside the window
          const date = localParts(turn.inboundEpoch, timeZone).date;
          const hrs = turn.latencyMs / 3600_000;
          if (!map.has(date)) map.set(date, []);
          map.get(date).push(hrs);
        }
      }
    }
    return map;
  } catch (err) {
    log.warn('reply latency fetch failed', { error: err.message });
    return new Map();
  }
}

export async function gatherReplyDays(userId) {
  const timeZone = await fetchTimeZone(userId);
  const [latMap, loadMap] = await Promise.all([
    fetchReplyLatencyDays(userId, timeZone),
    fetchCalendarLoadDays(userId, timeZone),
  ]);
  if (latMap.size === 0 && loadMap.size === 0) return [];
  const dates = new Set([...latMap.keys(), ...loadMap.keys()]);
  const days = [];
  for (const date of dates) {
    days.push({ date, latencies: latMap.get(date) ?? [], load: loadMap.get(date) ?? 0 });
  }
  return days;
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export async function generateReplyLatencyInsight(userId, { logOnly = false } = {}) {
  const days = await gatherReplyDays(userId);
  if (days.length < MIN_DAYS) {
    log.info('insufficient days for reply latency', { userId, days: days.length });
    return null;
  }
  const result = computeReplyLatency(days);
  const candidate = buildReplyLatencyCandidate(result);
  log.info('reply latency computed', {
    userId, days: days.length,
    result: result ? { effect: result.effect.toFixed(2), ratio: result.ratio, nHigh: result.nHigh } : null,
  });
  if (!candidate) return null;

  log.info('reply latency candidate', { userId, candidate });
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
  if (error) { log.warn('failed to store reply latency insight', { userId, error: error.message }); return null; }
  log.info('reply latency insight stored', { userId });
  return chosen;
}
