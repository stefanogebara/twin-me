/**
 * Correlation Signals — shared I/O + math for the Whoop-free calendar
 * correlations (2026-06-15)
 * ===================================================================
 * The maker-time / email-tempo / chronotype / reply-latency generators all run
 * the same shape: gather per-day signals, correlate against meeting load, voice
 * a finding. They were each carrying private copies of the calendar-load fetch,
 * the timezone lookup, the local-time bucketing, and the tiny tercile/mean/
 * stddev helpers. This module is the single home for those — behavior is
 * identical to the per-file copies it replaces.
 *
 * Privacy note: fetchCalendarLoadDays reads only event start times + a few
 * status flags; localParts touches only an epoch. No subjects, bodies, or
 * attendee identities leave these functions.
 */
import { getValidAccessToken } from './tokenRefreshService.js';
import { createCalendarClient } from './calendar/client.js';
import { createLogger } from './logger.js';

const log = createLogger('CorrelationSignals');

const WINDOW_DAYS = 28;

// ── tiny pure math helpers ────────────────────────────────────────────────────
export function mean(arr) {
  const v = arr.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function stddev(arr) {
  const v = arr.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (v.length < 2) return 0;
  const mu = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length);
}

export function tercileHigh(values) {
  const v = [...values].filter((n) => typeof n === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length * (2 / 3))] : Infinity;
}

export function tercileLow(values) {
  const v = [...values].filter((n) => typeof n === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length * (1 / 3))] : -Infinity;
}

// ── local-time bucketing ──────────────────────────────────────────────────────
/**
 * PURE. Local calendar date + hour for an epoch, in the given IANA timezone.
 * Uses Intl (no deps). Bucketing emails by the user's *local* day/hour is what
 * makes "after 7pm" mean their evening, not the server's UTC.
 * @returns {{date: string, hour: number}} date 'YYYY-MM-DD', hour 0-23
 */
export function localParts(epochMs, timeZone = 'UTC') {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0; // some impls render midnight as 24
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

// ── I/O (graceful) ────────────────────────────────────────────────────────────
/** I/O. The user's primary-calendar IANA timezone, 'UTC' on any failure. */
export async function fetchTimeZone(userId) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult?.success || !tokenResult.accessToken) return 'UTC';
    const client = createCalendarClient({ accessToken: tokenResult.accessToken });
    const cal = await client.get('/calendars/primary').catch(() => null);
    return cal?.timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * I/O. Per-day meeting count over the last WINDOW_DAYS — non-all-day events on
 * the primary calendar, skipping cancelled/transparent (free) ones and events
 * the user declined. Returns an empty Map on any failure (graceful degrade).
 *
 * Days are keyed in the user's calendar timezone (not the event string's own
 * offset), so load lines up with activity signals bucketed the same way — a
 * UTC-Z event near local midnight must land on the same local day as an email
 * sent at that instant. maxResults is the API ceiling: singleEvents expands
 * recurrences, and a heavy-meeting user (the exact target) can exceed a few
 * hundred events in 28 days — truncating would bias their "high" tercile down.
 * @param {string} timeZone IANA tz to bucket days into (default UTC)
 * @returns {Promise<Map<string, number>>} 'YYYY-MM-DD' -> meeting count
 */
export async function fetchCalendarLoadDays(userId, timeZone = 'UTC') {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult?.success || !tokenResult.accessToken) {
      log.warn('calendar token unavailable', { error: tokenResult?.error });
      return new Map();
    }
    const client = createCalendarClient({ accessToken: tokenResult.accessToken });
    const now = new Date();
    const start = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
    const q = `?timeMin=${start.toISOString()}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=2500`;
    const result = await client.get(`/calendars/primary/events${q}`).catch(() => ({ items: [] }));
    const items = Array.isArray(result?.items) ? result.items : [];
    const map = new Map(); // date -> meeting count
    for (const e of items) {
      if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
      const dt = e.start?.dateTime;
      if (!dt) continue; // skip all-day (date only)
      const self = (e.attendees || []).find((a) => a.self);
      if (self?.responseStatus === 'declined') continue;
      const epoch = new Date(dt).getTime();
      if (Number.isNaN(epoch)) continue;
      const date = localParts(epoch, timeZone).date;
      map.set(date, (map.get(date) || 0) + 1);
    }
    return map;
  } catch (err) {
    log.warn('calendar load fetch failed', { error: err.message });
    return new Map();
  }
}
