/**
 * Stress Leaderboard — biometric x social correlation (replan-2026-06-13)
 * =======================================================================
 * "Which person on my calendar does my body brace for?" Inspired by the viral
 * Whoop-x-calendar leaderboard. We correlate daily biometric stress signals
 * (recovery, HRV, resting HR) with WHO is on your calendar that day, rank the
 * people by effect, and feed the top one into the salience+voice Editor so it
 * lands as one human line — not a leaderboard of numbers.
 *
 * HONEST GRANULARITY: the Whoop developer API is DAILY (recovery/HRV/resting
 * HR), not per-minute HR (the viral author used Whoop's private API). So we
 * correlate person-on-your-day with that day's biometrics, not a per-meeting
 * spike. Real and novel, just coarser. Phase 2 (mobile Health Connect intraday
 * HR) upgrades to true per-meeting resolution.
 *
 * The correlation math is a PURE, tested core. The gather layer reuses existing
 * accessors and degrades gracefully (no data -> no insight, never throws).
 */
import { getValidAccessToken } from './tokenRefreshService.js';
import { whoop as nangoWhoop } from './nangoService.js';
import { createCalendarClient } from './calendar/client.js';
import { editInsights } from './insightEditor.js';
import { supabaseAdmin } from './database.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('StressLeaderboard');

export const WINDOW_DAYS = 28;
export const MIN_MEETING_DAYS = 4;   // person must appear on >= this many days
export const MIN_WITHOUT_DAYS = 3;   // and we need a baseline of days without them
export const EFFECT_FLOOR = 0.5;     // |combined z-effect| must clear this to surface
const RECOVERY_LIMIT = 25;           // Whoop API page size

// ── pure math helpers ────────────────────────────────────────────────────────
function mean(arr) {
  const v = arr.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function stddev(arr, m) {
  const v = arr.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (v.length < 2) return 0;
  const mu = m ?? mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length);
}
function tercileHigh(values) {
  const v = [...values].filter((n) => typeof n === 'number').sort((a, b) => a - b);
  if (!v.length) return Infinity;
  return v[Math.floor(v.length * (2 / 3))];
}
function tercileLow(values) {
  const v = [...values].filter((n) => typeof n === 'number').sort((a, b) => a - b);
  if (!v.length) return -Infinity;
  return v[Math.floor(v.length * (1 / 3))];
}

const METRICS = [
  { key: 'recovery', stressDir: -1 },   // lower recovery => more stress
  { key: 'hrv', stressDir: -1 },        // lower HRV => more stress
  { key: 'restingHr', stressDir: +1 },  // higher resting HR => more stress
];

/**
 * PURE. Rank people by how much your body's stress signal shifts on days you
 * have them on the calendar.
 * @param {Array<{date,recovery,hrv,restingHr,people:Array<{id,name}>,load:number}>} days
 * @returns {{ top: object|null, calming: object|null, board: object[] }}
 */
export function computeStressLeaderboard(days, { effectFloor = EFFECT_FLOOR } = {}) {
  if (!Array.isArray(days) || days.length < 8) return { top: null, calming: null, board: [] };

  const metricStats = {};
  for (const { key } of METRICS) {
    const vals = days.map((d) => d[key]);
    const m = mean(vals);
    metricStats[key] = { m, s: stddev(vals, m) };
  }
  const loadHighThreshold = tercileHigh(days.map((d) => d.load ?? 0));
  const loadLowThreshold = tercileLow(days.map((d) => d.load ?? 0));

  // Unique people (keep a representative display name per id).
  const peopleNames = new Map();
  for (const d of days) for (const p of d.people || []) if (!peopleNames.has(p.id)) peopleNames.set(p.id, p.name);

  const board = [];
  for (const [id, name] of peopleNames) {
    const withDays = days.filter((d) => (d.people || []).some((p) => p.id === id));
    const withoutDays = days.filter((d) => !(d.people || []).some((p) => p.id === id));
    if (withDays.length < MIN_MEETING_DAYS || withoutDays.length < MIN_WITHOUT_DAYS) continue;

    const contributions = [];
    let recoveryDeltaPts = null;
    let restingHrDeltaBpm = null;
    for (const { key, stressDir } of METRICS) {
      const wv = withDays.map((d) => d[key]).filter((n) => typeof n === 'number');
      const ov = withoutDays.map((d) => d[key]).filter((n) => typeof n === 'number');
      const s = metricStats[key].s;
      if (wv.length < 2 || ov.length < 2 || !s) continue;
      const delta = mean(wv) - mean(ov);
      contributions.push((delta / s) * stressDir);
      if (key === 'recovery') recoveryDeltaPts = Math.round(mean(ov) - mean(wv)); // +ve = lower with them
      if (key === 'restingHr') restingHrDeltaBpm = Math.round(mean(wv) - mean(ov)); // +ve = higher with them
    }
    if (!contributions.length) continue;

    const stressEffect = mean(contributions);
    const avgLoadWith = mean(withDays.map((d) => d.load ?? 0)) ?? 0;
    board.push({
      id, name,
      n: withDays.length,
      stressEffect,
      recoveryDeltaPts,
      restingHrDeltaBpm,
      // Confound flag: their days also tend to be your busy days, so the Editor
      // should hedge ("could be the load, not them").
      confoundLikely: avgLoadWith >= loadHighThreshold,
      // Inverse confound for the calming/energy direction: a "lifter" whose
      // days are your LIGHT days may just be benefiting from low load.
      lowLoadConfound: avgLoadWith <= loadLowThreshold,
    });
  }

  board.sort((a, b) => b.stressEffect - a.stressEffect);
  const top = board.find((p) => p.stressEffect >= effectFloor) || null;
  const calming = [...board].reverse().find((p) => p.stressEffect <= -effectFloor) || null;
  return { top, calming, board };
}

// ── privacy + candidate text ────────────────────────────────────────────────
/** First name only, never the raw email. */
export function firstName(name, id) {
  const src = (name && /[a-z]/i.test(name)) ? name : (id || '').split('@')[0];
  const token = String(src).replace(/[._-]+/g, ' ').trim().split(/\s+/)[0] || '';
  if (!token) return 'someone you meet often';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** PURE. Raw factual candidate for the Editor (which voices + hedges it). */
export function buildCandidate(top) {
  if (!top) return null;
  const who = firstName(top.name, top.id);
  const bits = [];
  if (top.recoveryDeltaPts && top.recoveryDeltaPts > 0) bits.push(`recovery averages ${top.recoveryDeltaPts} points lower`);
  if (top.restingHrDeltaBpm && top.restingHrDeltaBpm > 0) bits.push(`resting heart rate runs ${top.restingHrDeltaBpm} bpm higher`);
  const body = bits.length ? bits.join(' and ') : 'your stress signals run higher';
  const confound = top.confoundLikely ? ' Those also tend to be your busier days, so it may be the load rather than the person.' : '';
  return `Across the last weeks, your ${body} on the ${top.n} days you have meetings involving ${who}, versus your other days.${confound}`;
}

/**
 * PURE. The positive counterpart — the person your body settles around (the
 * "energy leaderboard"). For a calming person recoveryDeltaPts is negative
 * (recovery HIGHER with them) and restingHrDeltaBpm is negative (HR LOWER), so
 * we flip the sign and the wording. The Editor voices + hedges it.
 */
export function buildCalmingCandidate(calming) {
  if (!calming) return null;
  const who = firstName(calming.name, calming.id);
  const bits = [];
  if (calming.recoveryDeltaPts && calming.recoveryDeltaPts < 0) bits.push(`recovery averages ${Math.abs(calming.recoveryDeltaPts)} points higher`);
  if (calming.restingHrDeltaBpm && calming.restingHrDeltaBpm < 0) bits.push(`resting heart rate runs ${Math.abs(calming.restingHrDeltaBpm)} bpm lower`);
  const body = bits.length ? bits.join(' and ') : 'your body settles';
  const confound = calming.lowLoadConfound ? ' Those also tend to be your lighter days, so it may be the calm of the day rather than the person.' : '';
  return `Across the last weeks, your ${body} on the ${calming.n} days you have meetings involving ${who}, versus your other days.${confound}`;
}

// ── Social battery: meeting load -> next-day recovery ────────────────────────
const BATTERY_EFFECT_FLOOR = 0.4;

/**
 * PURE. Does a packed calendar cost you the next morning? Pairs each day's
 * meeting LOAD with the FOLLOWING day's recovery (Whoop recovery is computed
 * overnight, so today's load shows up in tomorrow's number), then compares
 * next-day recovery after your busiest vs lightest days.
 * @returns {object|null} { effect, recoveryDeltaPts, nHigh, nLow } or null.
 */
export function computeSocialBattery(days, { effectFloor = BATTERY_EFFECT_FLOOR } = {}) {
  if (!Array.isArray(days) || days.length < 10) return null;
  const sorted = [...days].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));

  // Pair load[d] with recovery[d+1] only for genuinely consecutive calendar days.
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (typeof b.recovery !== 'number') continue;
    const gapDays = Math.round((new Date(b.date) - new Date(a.date)) / 86400_000);
    if (gapDays !== 1) continue;
    pairs.push({ load: a.load ?? 0, nextRecovery: b.recovery });
  }
  if (pairs.length < 8) return null;

  const loads = pairs.map((p) => p.load);
  const hi = tercileHigh(loads), lo = tercileLow(loads);
  if (hi <= lo) return null; // no spread in calendar load — nothing to compare

  const highDays = pairs.filter((p) => p.load >= hi);
  const lowDays = pairs.filter((p) => p.load <= lo);
  if (highDays.length < 4 || lowDays.length < 4) return null;

  const s = stddev(pairs.map((p) => p.nextRecovery));
  if (!s) return null;
  const mHigh = mean(highDays.map((p) => p.nextRecovery));
  const mLow = mean(lowDays.map((p) => p.nextRecovery));
  const recoveryDeltaPts = Math.round(mLow - mHigh); // +ve = busy days cost next-day recovery
  const effect = (mLow - mHigh) / s;
  if (Math.abs(effect) < effectFloor) return null;

  return { effect, recoveryDeltaPts, nHigh: highDays.length, nLow: lowDays.length };
}

/** PURE. Candidate text for the social-battery finding (Editor voices it). */
export function buildSocialBatteryCandidate(battery) {
  if (!battery) return null;
  if (battery.recoveryDeltaPts > 0) {
    return `On the mornings after your busiest days, your recovery averages ${battery.recoveryDeltaPts} points lower than after your lighter days, across ${battery.nHigh} busy days. Your body seems to pay for a packed calendar the next day.`;
  }
  if (battery.recoveryDeltaPts < 0) {
    return `On the mornings after your busiest days, your recovery actually runs ${Math.abs(battery.recoveryDeltaPts)} points higher than after your lighter days, across ${battery.nHigh} busy days. A full calendar seems to energize you rather than drain you.`;
  }
  return null;
}

// ── gather (I/O, graceful) ──────────────────────────────────────────────────
async function fetchRecoveryDays(userId) {
  try {
    // Whoop is connected through the Nango proxy (handles token refresh) — the
    // same accessor the observation fetcher uses. Direct bearer tokens 401.
    const result = await nangoWhoop.getRecovery(userId, RECOVERY_LIMIT);
    if (!result?.success) {
      log.warn('whoop recovery fetch failed', { status: result?.status ?? result?.statusCode, error: result?.error });
      return new Map();
    }
    const map = new Map();
    for (const r of result.data?.records || []) {
      const date = (r.created_at || r.updated_at || '').slice(0, 10);
      if (!date || !r.score) continue;
      map.set(date, {
        recovery: typeof r.score.recovery_score === 'number' ? r.score.recovery_score : null,
        hrv: typeof r.score.hrv_rmssd_milli === 'number' ? r.score.hrv_rmssd_milli : null,
        restingHr: typeof r.score.resting_heart_rate === 'number' ? r.score.resting_heart_rate : null,
      });
    }
    return map;
  } catch (err) {
    log.warn('whoop recovery fetch failed', { error: err.message });
    return new Map();
  }
}

async function fetchCalendarDays(userId) {
  try {
    // getValidAccessToken returns { success, accessToken } — NOT a raw string.
    const tokenResult = await getValidAccessToken(userId, 'google_calendar');
    if (!tokenResult?.success || !tokenResult.accessToken) {
      log.warn('calendar token unavailable', { error: tokenResult?.error });
      return new Map();
    }
    const client = createCalendarClient({ accessToken: tokenResult.accessToken });
    const now = new Date();
    const start = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
    const q = `?timeMin=${start.toISOString()}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=250`;
    const result = await client.get(`/calendars/primary/events${q}`).catch(() => ({ items: [] }));
    const items = Array.isArray(result?.items) ? result.items : [];
    const map = new Map(); // date -> { people: Map<id,name>, load }
    for (const e of items) {
      if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
      const self = (e.attendees || []).find((a) => a.self);
      if (self?.responseStatus === 'declined') continue;
      const date = (e.start?.dateTime ?? e.start?.date ?? '').slice(0, 10);
      if (!date) continue;
      const isAllDay = !!e.start?.date && !e.start?.dateTime;
      const day = map.get(date) || { people: new Map(), load: 0 };
      if (!isAllDay) day.load += 1;
      for (const a of e.attendees || []) {
        if (a.self || a.resource) continue;
        if (a.responseStatus === 'declined') continue;
        const id = (a.email || '').toLowerCase();
        if (id) day.people.set(id, a.displayName || null);
      }
      const org = e.organizer;
      if (org?.email && !org.self) day.people.set(org.email.toLowerCase(), org.displayName || null);
      map.set(date, day);
    }
    return map;
  } catch (err) {
    log.warn('calendar fetch failed', { error: err.message });
    return new Map();
  }
}

/** Build the joined per-day signal array. Returns [] if biometrics missing. */
export async function gatherDailySignals(userId) {
  const [recoveryMap, calMap] = await Promise.all([fetchRecoveryDays(userId), fetchCalendarDays(userId)]);
  if (recoveryMap.size === 0) return [];
  const days = [];
  for (const [date, bio] of recoveryMap) {
    const cal = calMap.get(date);
    days.push({
      date,
      recovery: bio.recovery,
      hrv: bio.hrv,
      restingHr: bio.restingHr,
      people: cal ? [...cal.people.entries()].map(([id, name]) => ({ id, name })) : [],
      load: cal?.load ?? 0,
    });
  }
  return days;
}

// ── orchestrator ────────────────────────────────────────────────────────────
/**
 * Compute the leaderboard for a user and, unless logOnly, feed the top finding
 * through the Editor and store it as a proactive insight. Always logs what it
 * found (the canary's eyes).
 * @returns {Promise<object|null>} the stored/edited insight, or null.
 */
export async function generateStressLeaderboardInsight(userId, { logOnly = false } = {}) {
  const days = await gatherDailySignals(userId);
  if (days.length < 10) {
    log.info('insufficient days for stress leaderboard', { userId, days: days.length });
    return null;
  }
  const { top, calming, board } = computeStressLeaderboard(days);
  log.info('stress leaderboard computed', {
    userId, days: days.length, peopleScored: board.length,
    top: top ? { name: firstName(top.name, top.id), effect: top.stressEffect.toFixed(2), n: top.n, confound: top.confoundLikely } : null,
    calming: calming ? { name: firstName(calming.name, calming.id), effect: calming.stressEffect.toFixed(2) } : null,
  });
  // Social battery: does a packed calendar cost you the next morning? Same
  // gathered days, a different correlation (daily LOAD -> next-day recovery).
  const battery = computeSocialBattery(days);
  const batteryCandidate = buildSocialBatteryCandidate(battery);

  if (!top && !calming && !batteryCandidate) return null;

  // Build every direction we found — the stressor your body braces for, the
  // person it settles around (energy leaderboard), and the social-battery cost
  // of a full calendar. The salience Editor picks the single most worth-saying
  // one, or none. Same gather + engine, different correlations.
  const candidates = [];
  if (top) candidates.push({ insight: buildCandidate(top), urgency: 'medium', category: 'stress_correlation' });
  if (calming) candidates.push({ insight: buildCalmingCandidate(calming), urgency: 'low', category: 'energy_correlation' });
  if (batteryCandidate) candidates.push({ insight: batteryCandidate, urgency: 'low', category: 'social_battery' });
  log.info('biometric-social candidates', { userId, candidates: candidates.map((c) => c.insight) });
  if (logOnly) return null;

  const chosen = await editInsights(userId, candidates);
  if (!chosen) return null;

  const insertData = {
    user_id: userId,
    insight: chosen.insight,
    urgency: chosen.urgency,
    category: chosen.category || 'trend',
    surfaced_at: new Date().toISOString(),
    sources: ['whoop', 'google_calendar'],
  };
  if (chosen.embedding) insertData.embedding = vectorToString(chosen.embedding);
  const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
  if (error) { log.warn('failed to store stress-leaderboard insight', { userId, error: error.message }); return null; }
  log.info('stress leaderboard insight stored', { userId });
  return chosen;
}
