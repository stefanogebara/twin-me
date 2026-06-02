/**
 * Pure statistical utilities for Whoop trend/compare analytics.
 *
 * All exports are deterministic, allocation-bounded, and have no
 * dependencies. Empty arrays throw — analytics callers should guard upstream
 * (e.g. "no data in this period") rather than letting NaN propagate into
 * twin context strings.
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/tools/stats-utils.ts. Logic preserved; types stripped.
 */

function assertNonEmpty(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${name}: cannot operate on an empty array`);
  }
}

/** @throws {Error} if values is empty */
export function mean(values) {
  assertNonEmpty(values, 'mean');
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Median — middle value (average of two middle for even length).
 * Does not mutate the input array.
 * @throws {Error} if values is empty
 */
export function median(values) {
  assertNonEmpty(values, 'median');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Population standard deviation. Returns 0 for single values or constant
 * arrays — matches the original; downstream code uses 0 as "no variance".
 * @throws {Error} if values is empty
 */
export function standardDeviation(values) {
  assertNonEmpty(values, 'standardDeviation');
  if (values.length === 1) return 0;
  const avg = mean(values);
  let sumSq = 0;
  for (const v of values) {
    const diff = v - avg;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

/**
 * Simple linear regression on values indexed 0..n-1.
 * Returns slope per index unit and R² (0..1).
 *
 * Single-value or constant arrays return { slope: 0, r2: 0 } — no trend.
 * @throws {Error} if values is empty
 */
export function linearRegression(values) {
  assertNonEmpty(values, 'linearRegression');
  const n = values.length;
  if (n === 1) return { slope: 0, r2: 0 };

  const sumX = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  let sumY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumY += values[i];
    sumXY += i * values[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  let ssTot = 0;
  let ssRes = 0;
  const yMean = sumY / n;
  for (let i = 0; i < n; i++) {
    const diff = values[i] - yMean;
    ssTot += diff * diff;
    const predicted = intercept + slope * i;
    const residual = values[i] - predicted;
    ssRes += residual * residual;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, r2 };
}

/**
 * Detect values more than `threshold` standard deviations from the mean.
 * Returns an empty array for constant inputs (stddev = 0) since "anomaly"
 * is undefined without variance.
 *
 * @throws {Error} if values is empty
 */
export function detectAnomalies(values, threshold = 2) {
  assertNonEmpty(values, 'detectAnomalies');
  const avg = mean(values);
  const stdDev = standardDeviation(values);
  if (stdDev === 0) return [];
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const deviation = Math.abs(values[i] - avg) / stdDev;
    if (deviation > threshold) {
      out.push({ index: i, value: values[i], deviation });
    }
  }
  return out;
}

/**
 * Classify a trend from regression output. R² ≤ 0.4 → "stable" (we don't
 * trust low-confidence slopes). Near-zero slope → "stable" regardless of R²
 * (a tight fit to a flat line is still flat).
 *
 * @returns {'improving'|'declining'|'stable'}
 */
export function trendDirection(slope, r2) {
  if (r2 <= 0.4) return 'stable';
  if (Math.abs(slope) < 0.001) return 'stable';
  return slope > 0 ? 'improving' : 'declining';
}
