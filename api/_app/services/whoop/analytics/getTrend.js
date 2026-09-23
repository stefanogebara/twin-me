/**
 * Trend analysis for a single Whoop metric over a rolling N-day window.
 *
 * Inputs:
 *   client — anything with .get(path) returning { records, next_token? }
 *   { metric, days? } — metric ∈ recovery|hrv|rhr|sleep_duration|
 *                        sleep_performance|strain, days default 30
 *
 * Output:
 *   { metric, period:{start,end,days}, values, statistics:{mean,median,
 *     std_dev,min,max}, trend:{direction,slope,confidence}, anomalies }
 *
 * The twin uses this to answer "is my recovery trending up?" without us
 * having to precompute trends in a cron. Trend direction is conservative:
 * R² < 0.4 → "stable" (we don't claim a trend we can't fit).
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/tools/get-trend.ts. Logic preserved; types stripped.
 */

import { fetchAllPages } from '../pagination.js';
import { ENDPOINT_RECOVERY, ENDPOINT_SLEEP, ENDPOINT_CYCLE } from '../endpoints.js';
import {
  mean,
  median,
  standardDeviation,
  linearRegression,
  trendDirection,
  detectAnomalies,
} from '../statsUtils.js';

const DEFAULT_DAYS = 30;
const SUPPORTED_METRICS = new Set([
  'recovery',
  'hrv',
  'rhr',
  'sleep_duration',
  'sleep_performance',
  'strain',
]);

function buildTrendQuery(days) {
  const now = new Date();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
  const start = startDate.toISOString();
  const end = now.toISOString();
  const params = new URLSearchParams();
  params.set('start', start);
  params.set('end', end);
  params.set('limit', '25');
  return { query: `?${params.toString()}`, start, end };
}

function r2ToConfidence(r2) {
  if (r2 > 0.7) return 'high';
  if (r2 > 0.4) return 'medium';
  return 'low';
}

function sleepDurationHours(sleep) {
  const startMs = new Date(sleep.start).getTime();
  const endMs = new Date(sleep.end).getTime();
  return (endMs - startMs) / (1000 * 60 * 60);
}

function recoveryConfig(field) {
  return {
    endpoint: ENDPOINT_RECOVERY,
    extract(records) {
      const scored = records.filter((r) => r.score_state === 'SCORED' && r.score);
      return {
        values: scored.map((r) => r.score[field]),
        dates: scored.map((r) => r.created_at),
      };
    },
  };
}

const METRIC_CONFIGS = {
  recovery: recoveryConfig('recovery_score'),
  hrv: recoveryConfig('hrv_rmssd_milli'),
  rhr: recoveryConfig('resting_heart_rate'),
  sleep_duration: {
    endpoint: ENDPOINT_SLEEP,
    extract(records) {
      const scored = records.filter((s) => s.score_state === 'SCORED' && s.score && !s.nap);
      return {
        values: scored.map(sleepDurationHours),
        dates: scored.map((s) => s.end),
      };
    },
  },
  sleep_performance: {
    endpoint: ENDPOINT_SLEEP,
    extract(records) {
      const scored = records.filter(
        (s) =>
          s.score_state === 'SCORED' &&
          s.score?.sleep_performance_percentage !== undefined &&
          !s.nap,
      );
      return {
        values: scored.map((s) => s.score.sleep_performance_percentage),
        dates: scored.map((s) => s.end),
      };
    },
  },
  strain: {
    endpoint: ENDPOINT_CYCLE,
    extract(records) {
      const scored = records.filter((c) => c.score_state === 'SCORED' && c.score);
      return {
        values: scored.map((c) => c.score.strain),
        dates: scored.map((c) => c.created_at),
      };
    },
  },
};

/**
 * Analyse a Whoop metric trend over time.
 *
 * @param {object} client  Object with `.get(path) -> Promise<{records, next_token?}>`.
 * @param {{ metric: string, days?: number }} params
 * @returns {Promise<object>}
 * @throws {Error} when the metric is unsupported or there are <2 scored points
 */
export async function getTrend(client, params) {
  if (!SUPPORTED_METRICS.has(params.metric)) {
    throw new Error(
      `Unsupported metric: "${params.metric}". Supported: ${[...SUPPORTED_METRICS].join(', ')}.`,
    );
  }

  const days = params.days ?? DEFAULT_DAYS;
  const { query, start, end } = buildTrendQuery(days);
  const config = METRIC_CONFIGS[params.metric];

  const result = await fetchAllPages(client, `${config.endpoint}${query}`, {
    maxRecords: 100,
    maxPages: 10,
    interPageDelayMs: 0,
  });

  const { values, dates } = config.extract(result.records);

  if (values.length < 2) {
    // Surfaced to the caller (twinContextBuilder), which will swallow it
    // and skip the trend section rather than blow up the whole context.
    throw new Error(
      `Insufficient data for trend analysis: need at least 2 scored data points, got ${values.length}. ` +
        `Try a longer time range or check that your Whoop has recorded data for the "${params.metric}" metric.`,
    );
  }

  const stats = {
    mean: mean(values),
    median: median(values),
    std_dev: standardDeviation(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };

  const reg = linearRegression(values);
  const direction = trendDirection(reg.slope, reg.r2);
  const confidence = r2ToConfidence(reg.r2);

  const rawAnomalies = detectAnomalies(values, 2);
  const anomalies = rawAnomalies.map((a) => ({
    date: dates[a.index] ?? 'unknown',
    value: a.value,
    deviation_from_mean: a.deviation,
  }));

  return {
    metric: params.metric,
    period: { start, end, days },
    values,
    statistics: stats,
    trend: { direction, slope: reg.slope, confidence },
    anomalies,
  };
}
