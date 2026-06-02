/**
 * Weekly summary for a 7-day Whoop window. Fetches recovery / sleep /
 * workout / cycle (serialised), aggregates into one bundle:
 *   - recovery: avg/min/max score, avg HRV, avg RHR, trend direction
 *   - sleep: avg duration hours, performance %, efficiency %
 *   - workouts: count, total strain, total kJ, sport breakdown
 *   - strain: avg + max daily strain
 *
 * Failure semantics: returns partial results if 1-3 endpoints fail,
 * with the failures listed in `warnings`. Only throws if ALL FOUR
 * endpoints fail — twin context shouldn't break because one section is
 * temporarily unavailable.
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/tools/get-weekly-summary.ts. Logic preserved; types stripped.
 */

import { fetchAllPages } from '../pagination.js';
import {
  ENDPOINT_RECOVERY,
  ENDPOINT_SLEEP,
  ENDPOINT_WORKOUT,
  ENDPOINT_CYCLE,
} from '../endpoints.js';
import { resolveDateExpression } from '../dateUtils.js';
import { mean, linearRegression, trendDirection } from '../statsUtils.js';

function getMondayUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function getSundayEndUTC(monday) {
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return new Date(
    Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate(), 23, 59, 59, 999),
  );
}

function buildWeekQuery(start, end) {
  const params = new URLSearchParams();
  params.set('start', start);
  params.set('end', end);
  params.set('limit', '25');
  return `?${params.toString()}`;
}

function resolveWeekRange(weekStart) {
  if (weekStart) {
    const resolved = resolveDateExpression(weekStart);
    const monday = new Date(resolved.start);
    const sundayEnd = getSundayEndUTC(monday);
    return { start: resolved.start, end: sundayEnd.toISOString() };
  }
  const now = new Date();
  const monday = getMondayUTC(now);
  const sundayEnd = getSundayEndUTC(monday);
  return { start: monday.toISOString(), end: sundayEnd.toISOString() };
}

async function safeFetch(client, endpoint, query) {
  try {
    const result = await fetchAllPages(client, `${endpoint}${query}`, {
      maxRecords: 50,
      maxPages: 5,
      interPageDelayMs: 0,
    });
    return { records: result.records };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { error: message };
  }
}

function sleepDurationHours(sleep) {
  const startMs = new Date(sleep.start).getTime();
  const endMs = new Date(sleep.end).getTime();
  return (endMs - startMs) / (1000 * 60 * 60);
}

/**
 * Aggregate a 7-day Whoop snapshot.
 *
 * @param {object} client
 * @param {{ week_start?: string }} [params]
 * @returns {Promise<object>}
 * @throws {Error} only when ALL four endpoints fail
 */
export async function getWeeklySummary(client, params = {}) {
  const { start, end } = resolveWeekRange(params.week_start);
  const query = buildWeekQuery(start, end);

  // Serialised — rate-limit friendly. Twin chat tolerates ~1s here.
  const recoveryResult = await safeFetch(client, ENDPOINT_RECOVERY, query);
  const sleepResult = await safeFetch(client, ENDPOINT_SLEEP, query);
  const workoutResult = await safeFetch(client, ENDPOINT_WORKOUT, query);
  const cycleResult = await safeFetch(client, ENDPOINT_CYCLE, query);

  const warnings = [];
  if (recoveryResult.error) warnings.push(`recovery: ${recoveryResult.error}`);
  if (sleepResult.error) warnings.push(`sleep: ${sleepResult.error}`);
  if (workoutResult.error) warnings.push(`workout: ${workoutResult.error}`);
  if (cycleResult.error) warnings.push(`cycle: ${cycleResult.error}`);

  if (warnings.length === 4) {
    throw new Error(`All endpoints failed: ${warnings.join('; ')}`);
  }

  // --- Recovery ---
  const scoredRecoveries = (recoveryResult.records ?? []).filter(
    (r) => r.score_state === 'SCORED' && r.score,
  );
  const recoveryScores = scoredRecoveries.map((r) => r.score.recovery_score);
  const hrvValues = scoredRecoveries.map((r) => r.score.hrv_rmssd_milli);
  const rhrValues = scoredRecoveries.map((r) => r.score.resting_heart_rate);

  let recoveryTrend = 'stable';
  if (recoveryScores.length >= 2) {
    const reg = linearRegression(recoveryScores);
    recoveryTrend = trendDirection(reg.slope, reg.r2);
  }

  const recovery = {
    average_score: recoveryScores.length > 0 ? mean(recoveryScores) : 0,
    min_score: recoveryScores.length > 0 ? Math.min(...recoveryScores) : 0,
    max_score: recoveryScores.length > 0 ? Math.max(...recoveryScores) : 0,
    average_hrv: hrvValues.length > 0 ? mean(hrvValues) : 0,
    average_rhr: rhrValues.length > 0 ? mean(rhrValues) : 0,
    trend: recoveryTrend,
  };

  // --- Sleep (exclude naps) ---
  const scoredSleeps = (sleepResult.records ?? []).filter(
    (s) => s.score_state === 'SCORED' && s.score && !s.nap,
  );
  const sleepDurations = scoredSleeps.map(sleepDurationHours);
  const sleepPerformances = scoredSleeps
    .map((s) => s.score.sleep_performance_percentage)
    .filter((v) => v !== undefined && v !== null);
  const sleepEfficiencies = scoredSleeps
    .map((s) => s.score.sleep_efficiency_percentage)
    .filter((v) => v !== undefined && v !== null);

  const sleep = {
    average_duration_hours: sleepDurations.length > 0 ? mean(sleepDurations) : 0,
    average_performance_pct: sleepPerformances.length > 0 ? mean(sleepPerformances) : 0,
    average_efficiency_pct: sleepEfficiencies.length > 0 ? mean(sleepEfficiencies) : 0,
  };

  // --- Workouts ---
  const scoredWorkouts = (workoutResult.records ?? []).filter(
    (w) => w.score_state === 'SCORED' && w.score,
  );
  const sportBreakdown = {};
  let totalStrain = 0;
  let totalCaloriesKj = 0;
  for (const w of scoredWorkouts) {
    totalStrain += w.score.strain;
    totalCaloriesKj += w.score.kilojoule;
    sportBreakdown[w.sport_name] = (sportBreakdown[w.sport_name] ?? 0) + 1;
  }

  const workouts = {
    count: scoredWorkouts.length,
    total_strain: totalStrain,
    total_calories_kj: totalCaloriesKj,
    sport_breakdown: sportBreakdown,
  };

  // --- Cycle / strain ---
  const scoredCycles = (cycleResult.records ?? []).filter(
    (c) => c.score_state === 'SCORED' && c.score,
  );
  const strainValues = scoredCycles.map((c) => c.score.strain);

  const strain = {
    average_daily_strain: strainValues.length > 0 ? mean(strainValues) : 0,
    max_daily_strain: strainValues.length > 0 ? Math.max(...strainValues) : 0,
  };

  const result = {
    week_start: start,
    week_end: end,
    recovery,
    sleep,
    workouts,
    strain,
  };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}
