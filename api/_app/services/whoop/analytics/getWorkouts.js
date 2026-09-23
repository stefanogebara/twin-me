/**
 * Workouts list + breakdown for an N-day window.
 *
 * Distinct from getTrend (which only computes scalar metrics) and
 * getWeeklySummary (which only covers a 7-day Monday→Sunday window) —
 * this one delivers the actual sport-level breakdown the user wants
 * when they ask "what workouts did I do?", "show me my last sessions",
 * "how often am I hitting tennis", etc.
 *
 * Fetches `/v2/activity/workout` for the window, filters SCORED,
 * groups by sport_name, and returns aggregates plus the most-recent
 * N as a compact list. The list is bounded so the prompt doesn't
 * explode when the user asks for a 30-day window.
 *
 * Defaults: days=7, list_limit=10.
 */

import { fetchAllPages } from '../pagination.js';
import { ENDPOINT_WORKOUT } from '../endpoints.js';

const DEFAULT_DAYS = 7;
const DEFAULT_LIST_LIMIT = 10;
const MAX_DAYS = 90;

function buildWorkoutsQuery(days) {
  const now = new Date();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
  const params = new URLSearchParams();
  params.set('start', startDate.toISOString());
  params.set('end', now.toISOString());
  params.set('limit', '25');
  return {
    query: `?${params.toString()}`,
    start: startDate.toISOString(),
    end: now.toISOString(),
  };
}

function durationMinutes(workout) {
  const startMs = new Date(workout.start).getTime();
  const endMs = new Date(workout.end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, (endMs - startMs) / (1000 * 60));
}

/**
 * @param {object} client  Object with `.get(path) -> Promise<{records, next_token?}>`.
 * @param {{ days?: number, list_limit?: number }} [params]
 * @returns {Promise<object>}
 */
export async function getWorkouts(client, params = {}) {
  const days = Math.min(params.days ?? DEFAULT_DAYS, MAX_DAYS);
  const listLimit = params.list_limit ?? DEFAULT_LIST_LIMIT;
  const { query, start, end } = buildWorkoutsQuery(days);

  const result = await fetchAllPages(client, `${ENDPOINT_WORKOUT}${query}`, {
    maxRecords: 100,
    maxPages: 10,
    interPageDelayMs: 0,
  });

  const scored = result.records.filter((w) => w.score_state === 'SCORED' && w.score);

  // Per-sport aggregates.
  const bySport = new Map();
  let totalStrain = 0;
  let totalKj = 0;
  let totalMinutes = 0;
  for (const w of scored) {
    const sport = w.sport_name || 'unknown';
    const strain = w.score.strain ?? 0;
    const kj = w.score.kilojoule ?? 0;
    const mins = durationMinutes(w);
    totalStrain += strain;
    totalKj += kj;
    totalMinutes += mins;
    const entry = bySport.get(sport) || {
      sport,
      count: 0,
      total_strain: 0,
      total_kj: 0,
      total_minutes: 0,
      avg_hr_sum: 0,
      avg_hr_n: 0,
    };
    entry.count += 1;
    entry.total_strain += strain;
    entry.total_kj += kj;
    entry.total_minutes += mins;
    if (typeof w.score.average_heart_rate === 'number') {
      entry.avg_hr_sum += w.score.average_heart_rate;
      entry.avg_hr_n += 1;
    }
    bySport.set(sport, entry);
  }

  const sports = [...bySport.values()]
    .map((s) => ({
      sport: s.sport,
      count: s.count,
      total_strain: s.total_strain,
      total_kj: s.total_kj,
      total_minutes: Math.round(s.total_minutes),
      avg_hr: s.avg_hr_n > 0 ? Math.round(s.avg_hr_sum / s.avg_hr_n) : null,
    }))
    .sort((a, b) => b.count - a.count);

  // Most-recent list, bounded by listLimit. Whoop returns newest-first
  // by default on this endpoint, but we sort to be safe.
  const list = [...scored]
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, listLimit)
    .map((w) => ({
      id: w.id,
      sport: w.sport_name || 'unknown',
      start: w.start,
      duration_minutes: Math.round(durationMinutes(w)),
      strain: w.score.strain ?? null,
      avg_hr: w.score.average_heart_rate ?? null,
      kj: w.score.kilojoule ?? null,
    }));

  return {
    period: { start, end, days },
    totals: {
      count: scored.length,
      total_strain: totalStrain,
      total_kj: totalKj,
      total_minutes: Math.round(totalMinutes),
    },
    sports,
    list,
  };
}
