/**
 * Day vs Night Self — who takes the keyboard after dark (2026-06-16)
 * =================================================================
 * A first-party revelation built on the browser extension: the places your
 * attention drifts to AFTER HOURS that it rarely visits during your workday.
 * By day it's build tools and business; after dark a different pull shows up.
 *
 * Reads page-visit timestamps from our own DB, buckets each visit into the
 * user's local day vs after-dark window, and finds the domains that lean late.
 * Pure tested core; same gather -> core -> candidate shape as the other
 * revelations. Privacy: the user's own browsing, named at the domain level
 * only, reflected back to them. tz comes from the calendar tz (UTC fallback) —
 * the only thing the calendar is used for here, not its data.
 */
import { supabaseAdmin } from './database.js';
import { fetchTimeZone, localParts } from './correlationSignals.js';
import { friendlyDomain } from './attentionGravity.js';
import { createLogger } from './logger.js';

const log = createLogger('DayNightSelf');

export const WINDOW_DAYS = 28;
export const DAY_START = 7;   // local hour the "workday" window opens
export const DAY_END = 19;    // and closes; outside [7,19) is "after dark"
const MIN_NIGHT_TOTAL = 25;   // need a real after-hours tail to characterize
const MIN_DOMAIN_NIGHT = 4;   // a domain needs this many late visits to count
const NIGHT_SHARE = 0.6;      // and >=60% of its visits must be after dark
const MAX_NIGHT_NAMED = 3;
const MAX_ROWS = 3000;

// ── PURE core ────────────────────────────────────────────────────────────────
/** PURE. Is a local hour outside the [DAY_START, DAY_END) workday window? */
export function isAfterDark(hour, dayStart = DAY_START, dayEnd = DAY_END) {
  return hour < dayStart || hour >= dayEnd;
}

/**
 * Find domains that lean after-dark (high late share + enough late visits),
 * contrasted with the top daytime domains.
 * @param {Array<{domain:string, afterDark:boolean}>} events
 * @returns {object|null} { nightDomains:[name], dayTop:[name], nNight } or null
 */
export function computeDayNightSelf(events, {
  minNightTotal = MIN_NIGHT_TOTAL,
  minDomainNight = MIN_DOMAIN_NIGHT,
  nightShare = NIGHT_SHARE,
} = {}) {
  if (!Array.isArray(events)) return null;
  const agg = new Map(); // domain -> { day, night }
  let nightTotal = 0;
  for (const e of events) {
    if (!e || !e.domain) continue;
    const cur = agg.get(e.domain) || { day: 0, night: 0 };
    if (e.afterDark) { cur.night += 1; nightTotal += 1; } else cur.day += 1;
    agg.set(e.domain, cur);
  }
  if (nightTotal < minNightTotal) return null;

  const domains = [...agg.entries()].map(([domain, v]) => ({
    domain, day: v.day, night: v.night, share: v.night / (v.day + v.night),
  }));

  const nightLeaning = domains
    .filter((d) => d.night >= minDomainNight && d.share >= nightShare)
    .sort((a, b) => b.night - a.night)
    .slice(0, MAX_NIGHT_NAMED);
  if (nightLeaning.length === 0) return null;

  const nightSet = new Set(nightLeaning.map((d) => d.domain));
  const dayTop = domains
    .filter((d) => !nightSet.has(d.domain))
    .sort((a, b) => b.day - a.day)
    .slice(0, 2);

  return {
    nightDomains: nightLeaning.map((d) => friendlyDomain(d.domain)).filter(Boolean),
    dayTop: dayTop.map((d) => friendlyDomain(d.domain)).filter(Boolean),
    nNight: nightTotal,
  };
}

/** PURE. Join names as "A, B and C". */
function joinNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** PURE. Candidate text (read back on the pull surface). */
export function buildDayNightCandidate(r) {
  if (!r || !r.nightDomains || r.nightDomains.length === 0) return null;
  const night = joinNames(r.nightDomains);
  if (r.dayTop && r.dayTop.length >= 1) {
    const day = joinNames(r.dayTop);
    return `By day your browsing lives in ${day}. But after dark a different pull takes over — ${night} draw you in far more once the workday closes.`;
  }
  return `After dark a different pull takes over — ${night} draw you in far more than during your workday.`;
}

// ── gather (I/O, first-party DB) ─────────────────────────────────────────────
export async function gatherVisitsByHour(userId) {
  const timeZone = await fetchTimeZone(userId);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data')
    .eq('user_id', userId)
    .eq('platform', 'web')
    .eq('data_type', 'extension_page_visit')
    .gte('extracted_at', since)
    .limit(MAX_ROWS);
  if (error) {
    log.warn('visits fetch failed', { userId, error: error.message });
    return [];
  }
  const events = [];
  for (const row of data || []) {
    const r = row.raw_data || {};
    const domain = r.domain || null;
    const ts = r.timestamp || null;
    if (!domain || !ts) continue;
    const epoch = new Date(ts).getTime();
    if (Number.isNaN(epoch)) continue;
    events.push({ domain, afterDark: isAfterDark(localParts(epoch, timeZone).hour) });
  }
  return events;
}

/** Returns a revelation object for the pull surface, or null. */
export async function computeDayNightRevelation(userId) {
  const events = await gatherVisitsByHour(userId);
  const result = computeDayNightSelf(events);
  const body = buildDayNightCandidate(result);
  if (!body) return null;
  return { kind: 'day_night_self', title: 'Your after-dark self', body, source: 'web' };
}
