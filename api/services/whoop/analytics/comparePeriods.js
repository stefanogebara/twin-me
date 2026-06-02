/**
 * Compare two non-overlapping date ranges across recovery, sleep, and
 * strain. Returns per-period averages, percentage change, and a
 * direction tag (improved/declined/unchanged for health metrics;
 * increased/decreased/unchanged for strain, which is value-neutral).
 *
 * Periods can be up to 90 days each; overlap is rejected. Both periods
 * are fetched serially (recovery → sleep → cycle for A, then for B) to
 * stay friendly with Whoop's rate limits.
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/tools/compare-periods.ts. Logic preserved; types stripped.
 */

import { fetchAllPages } from '../pagination.js';
import { ENDPOINT_RECOVERY, ENDPOINT_SLEEP, ENDPOINT_CYCLE } from '../endpoints.js';
import { validateDateRange, InvalidDateExpression } from '../dateUtils.js';
import { mean } from '../statsUtils.js';

const MAX_PERIOD_DAYS = 90;
const UNCHANGED_THRESHOLD = 5; // percent — anything within ±5% rounds to "unchanged"

function daysBetween(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return (endMs - startMs) / (1000 * 60 * 60 * 24);
}

function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  const aStartMs = new Date(aStart).getTime();
  const aEndMs = new Date(aEnd).getTime();
  const bStartMs = new Date(bStart).getTime();
  const bEndMs = new Date(bEnd).getTime();
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

function buildQuery(start, end) {
  const params = new URLSearchParams();
  params.set('start', start);
  params.set('end', end);
  params.set('limit', '25');
  return `?${params.toString()}`;
}

async function fetchRecords(client, endpoint, query) {
  const result = await fetchAllPages(client, `${endpoint}${query}`, {
    maxRecords: 100,
    maxPages: 10,
    interPageDelayMs: 0,
  });
  return result.records;
}

function sleepDurationHours(sleep) {
  const startMs = new Date(sleep.start).getTime();
  const endMs = new Date(sleep.end).getTime();
  return (endMs - startMs) / (1000 * 60 * 60);
}

function percentChange(oldVal, newVal) {
  if (oldVal === 0) {
    return newVal === 0 ? 0 : 100;
  }
  return ((newVal - oldVal) / Math.abs(oldVal)) * 100;
}

function healthDirection(changePct) {
  if (Math.abs(changePct) <= UNCHANGED_THRESHOLD) return 'unchanged';
  return changePct > 0 ? 'improved' : 'declined';
}

function strainDirection(changePct) {
  if (Math.abs(changePct) <= UNCHANGED_THRESHOLD) return 'unchanged';
  return changePct > 0 ? 'increased' : 'decreased';
}

/**
 * Compare health metrics between two non-overlapping time periods.
 *
 * @param {object} client
 * @param {{ period_a_start: string, period_a_end: string,
 *           period_b_start: string, period_b_end: string }} params
 * @returns {Promise<object>}
 * @throws {InvalidDateExpression} when periods exceed 90 days or overlap
 */
export async function comparePeriods(client, params) {
  const { period_a_start, period_a_end, period_b_start, period_b_end } = params;

  validateDateRange(period_a_start, period_a_end, MAX_PERIOD_DAYS);
  validateDateRange(period_b_start, period_b_end, MAX_PERIOD_DAYS);

  if (periodsOverlap(period_a_start, period_a_end, period_b_start, period_b_end)) {
    throw new InvalidDateExpression(
      'Periods overlap. Provide two non-overlapping time ranges for comparison.',
    );
  }

  const queryA = buildQuery(period_a_start, period_a_end);
  const queryB = buildQuery(period_b_start, period_b_end);

  // Period A — serialized.
  const recoveryA = await fetchRecords(client, ENDPOINT_RECOVERY, queryA);
  const sleepA = await fetchRecords(client, ENDPOINT_SLEEP, queryA);
  const cycleA = await fetchRecords(client, ENDPOINT_CYCLE, queryA);

  // Period B — serialized.
  const recoveryB = await fetchRecords(client, ENDPOINT_RECOVERY, queryB);
  const sleepB = await fetchRecords(client, ENDPOINT_SLEEP, queryB);
  const cycleB = await fetchRecords(client, ENDPOINT_CYCLE, queryB);

  // --- Recovery ---
  const scoredRecoveryA = recoveryA.filter((r) => r.score_state === 'SCORED' && r.score);
  const scoredRecoveryB = recoveryB.filter((r) => r.score_state === 'SCORED' && r.score);
  const recoveryAvgA =
    scoredRecoveryA.length > 0 ? mean(scoredRecoveryA.map((r) => r.score.recovery_score)) : 0;
  const recoveryAvgB =
    scoredRecoveryB.length > 0 ? mean(scoredRecoveryB.map((r) => r.score.recovery_score)) : 0;
  const recoveryChange = percentChange(recoveryAvgA, recoveryAvgB);

  // --- Sleep (exclude naps; average duration in hours) ---
  const scoredSleepA = sleepA.filter((s) => s.score_state === 'SCORED' && s.score && !s.nap);
  const scoredSleepB = sleepB.filter((s) => s.score_state === 'SCORED' && s.score && !s.nap);
  const sleepAvgA = scoredSleepA.length > 0 ? mean(scoredSleepA.map(sleepDurationHours)) : 0;
  const sleepAvgB = scoredSleepB.length > 0 ? mean(scoredSleepB.map(sleepDurationHours)) : 0;
  const sleepChange = percentChange(sleepAvgA, sleepAvgB);

  // --- Strain ---
  const scoredCycleA = cycleA.filter((c) => c.score_state === 'SCORED' && c.score);
  const scoredCycleB = cycleB.filter((c) => c.score_state === 'SCORED' && c.score);
  const strainAvgA = scoredCycleA.length > 0 ? mean(scoredCycleA.map((c) => c.score.strain)) : 0;
  const strainAvgB = scoredCycleB.length > 0 ? mean(scoredCycleB.map((c) => c.score.strain)) : 0;
  const strainChange = percentChange(strainAvgA, strainAvgB);

  return {
    period_a: {
      start: period_a_start,
      end: period_a_end,
      days: daysBetween(period_a_start, period_a_end),
    },
    period_b: {
      start: period_b_start,
      end: period_b_end,
      days: daysBetween(period_b_start, period_b_end),
    },
    recovery: {
      period_a_avg: recoveryAvgA,
      period_b_avg: recoveryAvgB,
      change_pct: recoveryChange,
      direction: healthDirection(recoveryChange),
    },
    sleep: {
      period_a_avg_hours: sleepAvgA,
      period_b_avg_hours: sleepAvgB,
      change_pct: sleepChange,
      direction: healthDirection(sleepChange),
    },
    strain: {
      period_a_avg: strainAvgA,
      period_b_avg: strainAvgB,
      change_pct: strainChange,
      direction: strainDirection(strainChange),
    },
  };
}
