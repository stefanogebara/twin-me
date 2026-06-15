/**
 * Workspace Rhythm — maker time vs meeting time (2026-06-15)
 * ==========================================================
 * The first Whoop-FREE self-revelation: it runs on Google Workspace + Calendar,
 * which most users have, instead of a wearable few own. The question it answers:
 * does a packed calendar crowd out your actual making?
 *
 * Signal A: daily creation activity — Google Docs/Sheets/Slides you own that
 *   were modified that day (live Drive files.list, bucketed by day).
 * Signal B: daily meeting load — non-all-day calendar events that day.
 * Correlation: compare creation activity on your busiest vs lightest meeting
 *   days. The classic maker-schedule-vs-manager-schedule tension, measured.
 *
 * Same shape as the biometric correlations (gather -> pure tested core ->
 * candidate -> salience Editor), just on universal data. The calendar-load
 * fetch and tercile/mean/stddev helpers are shared from correlationSignals.js.
 */
import { getValidAccessToken } from './tokenRefreshService.js';
import { editInsights } from './insightEditor.js';
import { supabaseAdmin } from './database.js';
import { vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';
import { mean, stddev, tercileHigh, tercileLow, fetchCalendarLoadDays, fetchTimeZone, localParts } from './correlationSignals.js';

const log = createLogger('WorkspaceRhythm');

export const WINDOW_DAYS = 28;
export const MAKER_EFFECT_FLOOR = 0.4;
const MIN_GROUP_DAYS = 4;

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Compare creation activity on high-meeting-load vs low-load days.
 * @param {Array<{date,driveActivity:number,load:number}>} days
 * @returns {object|null} { effect, aHigh, aLow, dropPct, nHigh, nLow } or null.
 */
export function computeMakerTime(days, { effectFloor = MAKER_EFFECT_FLOOR } = {}) {
  if (!Array.isArray(days) || days.length < 10) return null;
  const withBoth = days.filter((d) => typeof d.driveActivity === 'number' && typeof d.load === 'number');
  if (withBoth.length < 10) return null;

  const loads = withBoth.map((d) => d.load);
  const hi = tercileHigh(loads), lo = tercileLow(loads);
  if (hi <= lo) return null; // no spread in meeting load

  const highDays = withBoth.filter((d) => d.load >= hi);
  const lowDays = withBoth.filter((d) => d.load <= lo);
  if (highDays.length < MIN_GROUP_DAYS || lowDays.length < MIN_GROUP_DAYS) return null;

  const s = stddev(withBoth.map((d) => d.driveActivity));
  if (!s) return null;
  const aHigh = mean(highDays.map((d) => d.driveActivity));
  const aLow = mean(lowDays.map((d) => d.driveActivity));
  const effect = (aLow - aHigh) / s; // +ve = meetings suppress making
  if (Math.abs(effect) < effectFloor) return null;

  const dropPct = aLow > 0 ? Math.round((1 - aHigh / aLow) * 100) : null;
  return {
    effect,
    aHigh: Math.round(aHigh * 10) / 10,
    aLow: Math.round(aLow * 10) / 10,
    dropPct,
    nHigh: highDays.length,
    nLow: lowDays.length,
  };
}

/** PURE. Candidate text for the maker-time finding (Editor voices it). */
export function buildMakerTimeCandidate(m) {
  if (!m) return null;
  if (m.effect > 0) {
    const amount = (m.dropPct && m.dropPct >= 10) ? `about ${m.dropPct}% less` : 'noticeably less';
    return `On your heaviest meeting days you create ${amount} in Docs and Sheets than on your lighter days, across ${m.nHigh} busy days. Your calendar seems to crowd out your actual making.`;
  }
  if (m.effect < 0) {
    return `On your heaviest meeting days you actually create more in Docs and Sheets than on your lighter days, across ${m.nHigh} busy days. Your making seems to ride on a full calendar rather than fight it.`;
  }
  return null;
}

// ── gather (I/O, graceful) ──────────────────────────────────────────────────
const WORKSPACE_DOC_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
];
const WORKSPACE_TYPE_SET = new Set(WORKSPACE_DOC_TYPES);
const ACTIVITY_PAGE_CAP = 10; // up to ~1000 activities

/**
 * PURE. Bucket Drive Activity API results into a date -> distinct-docs-touched
 * map, counting only the current user's create/edit actions on Workspace docs.
 * Richer than files.list modifiedTime, which only gives each file's single
 * latest edit (a doc worked on daily collapses to one data point).
 * @param {Array} activities raw activities from activity:query
 * @returns {Map<string, number>} 'YYYY-MM-DD' -> distinct doc count
 */
export function bucketActivityByDay(activities, { workspaceTypesOnly = true, timeZone = 'UTC' } = {}) {
  const perDay = new Map(); // date -> Set<driveItem.name>
  for (const act of activities || []) {
    const detail = act?.primaryActionDetail || {};
    if (!detail.create && !detail.edit) continue; // making = create or edit
    const mine = (act.actors || []).some((a) => a?.user?.knownUser?.isCurrentUser === true);
    if (!mine) continue;
    const ts = act.timestamp || act.timeRange?.endTime || act.timeRange?.startTime || '';
    const epoch = ts ? new Date(ts).getTime() : NaN;
    if (Number.isNaN(epoch)) continue;
    const date = localParts(epoch, timeZone).date; // user-tz day, to line up with load
    for (const t of act.targets || []) {
      const item = t?.driveItem;
      if (!item?.name) continue;
      if (workspaceTypesOnly && !WORKSPACE_TYPE_SET.has(item.mimeType)) continue;
      if (!perDay.has(date)) perDay.set(date, new Set());
      perDay.get(date).add(item.name);
    }
  }
  const map = new Map();
  for (const [date, set] of perDay) map.set(date, set.size);
  return map;
}

/** I/O. Per-day making via the Drive Activity API. Returns null on failure so
 *  the caller can fall back (e.g. the drive.activity scope isn't granted yet). */
async function fetchDriveActivityViaActivityApi(userId, timeZone) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_gmail');
    if (!tokenResult?.success || !tokenResult.accessToken) return null;
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
    const baseBody = {
      filter: `time >= "${since}" AND detail.action_detail_case:(CREATE EDIT)`,
      pageSize: 100,
    };
    const all = [];
    let pageToken;
    for (let page = 0; page < ACTIVITY_PAGE_CAP; page++) {
      const res = await fetch('https://driveactivity.googleapis.com/v2/activity:query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pageToken ? { ...baseBody, pageToken } : baseBody),
      });
      if (!res.ok) {
        // 403 = drive.activity scope not granted yet (expected pre-reconnect);
        // 400 = malformed query (a real bug to fix, not a missing scope).
        log.warn('drive activity API query failed', {
          status: res.status,
          reason: res.status === 403 ? 'scope_not_granted' : res.status === 400 ? 'bad_query' : 'other',
        });
        return null; // signal fallback to modifiedTime
      }
      const data = await res.json();
      for (const a of data.activities || []) all.push(a);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return bucketActivityByDay(all, { timeZone });
  } catch (err) {
    log.warn('drive activity API query failed', { error: err.message });
    return null;
  }
}

/** I/O. Fallback: per-day making from files.list modifiedTime (latest edit
 *  only — undercounts heavy editors, but needs no extra scope). */
async function fetchDriveActivityViaModifiedTime(userId, timeZone) {
  try {
    const tokenResult = await getValidAccessToken(userId, 'google_gmail');
    if (!tokenResult?.success || !tokenResult.accessToken) {
      log.warn('drive token unavailable', { error: tokenResult?.error });
      return new Map();
    }
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
    const typeClause = WORKSPACE_DOC_TYPES.map((t) => `mimeType = '${t}'`).join(' or ');
    const params = new URLSearchParams({
      q: `modifiedTime > '${since}' and trashed = false and 'me' in owners and (${typeClause})`,
      orderBy: 'modifiedTime desc',
      fields: 'files(modifiedTime,mimeType)',
      pageSize: '1000',
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    });
    if (!res.ok) {
      log.warn('drive activity fetch failed', { status: res.status });
      return new Map();
    }
    const data = await res.json();
    const map = new Map(); // date -> count of distinct docs touched
    for (const f of data.files || []) {
      const epoch = f.modifiedTime ? new Date(f.modifiedTime).getTime() : NaN;
      if (Number.isNaN(epoch)) continue;
      const date = localParts(epoch, timeZone).date; // user-tz day, to line up with load
      map.set(date, (map.get(date) || 0) + 1);
    }
    return map;
  } catch (err) {
    log.warn('drive activity fetch failed', { error: err.message });
    return new Map();
  }
}

/** Per-day making. Prefers the Drive Activity API (true edit events); falls
 *  back to files.list modifiedTime when the activity scope isn't granted. */
async function fetchDriveActivityDays(userId, timeZone) {
  const viaActivity = await fetchDriveActivityViaActivityApi(userId, timeZone);
  if (viaActivity && viaActivity.size > 0) {
    log.info('drive activity via Activity API', { userId, days: viaActivity.size });
    return viaActivity;
  }
  return fetchDriveActivityViaModifiedTime(userId, timeZone);
}

export async function gatherWorkDays(userId) {
  const timeZone = await fetchTimeZone(userId);
  const [driveMap, loadMap] = await Promise.all([
    fetchDriveActivityDays(userId, timeZone),
    fetchCalendarLoadDays(userId, timeZone),
  ]);
  if (driveMap.size === 0 && loadMap.size === 0) return [];
  const dates = new Set([...driveMap.keys(), ...loadMap.keys()]);
  const days = [];
  for (const date of dates) {
    days.push({ date, driveActivity: driveMap.get(date) ?? 0, load: loadMap.get(date) ?? 0 });
  }
  return days;
}

// ── orchestrator ────────────────────────────────────────────────────────────
export async function generateWorkspaceRhythmInsight(userId, { logOnly = false } = {}) {
  const days = await gatherWorkDays(userId);
  if (days.length < 10) {
    log.info('insufficient days for workspace rhythm', { userId, days: days.length });
    return null;
  }
  const maker = computeMakerTime(days);
  const candidate = buildMakerTimeCandidate(maker);
  log.info('workspace rhythm computed', {
    userId, days: days.length,
    maker: maker ? { effect: maker.effect.toFixed(2), dropPct: maker.dropPct, nHigh: maker.nHigh } : null,
  });
  if (!candidate) return null;

  log.info('workspace rhythm candidate', { userId, candidate });
  if (logOnly) return null;

  const chosen = await editInsights(userId, [{ insight: candidate, urgency: 'low', category: 'work_rhythm' }]);
  if (!chosen) return null;

  const insertData = {
    user_id: userId,
    insight: chosen.insight,
    urgency: chosen.urgency,
    category: chosen.category || 'work_rhythm',
    surfaced_at: new Date().toISOString(),
    sources: ['google_calendar', 'google_drive'],
  };
  if (chosen.embedding) insertData.embedding = vectorToString(chosen.embedding);
  const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
  if (error) { log.warn('failed to store workspace rhythm insight', { userId, error: error.message }); return null; }
  log.info('workspace rhythm insight stored', { userId });
  return chosen;
}
