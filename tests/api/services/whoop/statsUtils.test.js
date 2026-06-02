/**
 * Tests for whoop/statsUtils.js — ported from
 * shashankswe2020-ux/whoop-mcp tests/tools/stats-utils.test.ts (MIT).
 * Assertions unchanged; imports swapped to our path.
 */

import { describe, it, expect } from 'vitest';
import {
  mean,
  median,
  standardDeviation,
  linearRegression,
  detectAnomalies,
  trendDirection,
} from '../../../../api/services/whoop/statsUtils.js';

describe('mean', () => {
  it('computes the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it('handles a single value', () => {
    expect(mean([42])).toBe(42);
  });
  it('handles negative values', () => {
    expect(mean([-10, 10])).toBe(0);
  });
  it('handles decimal values', () => {
    expect(mean([1.5, 2.5, 3.0])).toBeCloseTo(2.333, 2);
  });
  it('throws for empty array', () => {
    expect(() => mean([])).toThrow(/empty/i);
  });
});

describe('median', () => {
  it('returns middle value for odd-length arrays', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('returns average of two middle values for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('handles a single value', () => {
    expect(median([7])).toBe(7);
  });
  it('handles unsorted input', () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });
  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
  it('throws for empty array', () => {
    expect(() => median([])).toThrow(/empty/i);
  });
});

describe('standardDeviation', () => {
  it('computes population standard deviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
  it('returns 0 for constant values', () => {
    expect(standardDeviation([5, 5, 5, 5])).toBe(0);
  });
  it('returns 0 for a single value', () => {
    expect(standardDeviation([42])).toBe(0);
  });
  it('handles two values', () => {
    expect(standardDeviation([0, 10])).toBe(5);
  });
  it('throws for empty array', () => {
    expect(() => standardDeviation([])).toThrow(/empty/i);
  });
});

describe('linearRegression', () => {
  it('returns positive slope for monotonically increasing values', () => {
    const r = linearRegression([1, 2, 3, 4, 5]);
    expect(r.slope).toBe(1);
    expect(r.r2).toBeCloseTo(1.0, 5);
  });
  it('returns negative slope for monotonically decreasing values', () => {
    const r = linearRegression([5, 4, 3, 2, 1]);
    expect(r.slope).toBe(-1);
    expect(r.r2).toBeCloseTo(1.0, 5);
  });
  it('returns zero slope for constant values', () => {
    const r = linearRegression([3, 3, 3, 3]);
    expect(r.slope).toBe(0);
    expect(r.r2).toBe(0);
  });
  it('returns slope and R² for noisy data', () => {
    const r = linearRegression([1, 3, 2, 4, 3, 5]);
    expect(r.slope).toBeGreaterThan(0);
    expect(r.r2).toBeGreaterThan(0);
    expect(r.r2).toBeLessThanOrEqual(1);
  });
  it('handles two values', () => {
    const r = linearRegression([10, 20]);
    expect(r.slope).toBe(10);
    expect(r.r2).toBeCloseTo(1.0, 5);
  });
  it('returns zero slope and zero R² for single value', () => {
    const r = linearRegression([42]);
    expect(r.slope).toBe(0);
    expect(r.r2).toBe(0);
  });
  it('throws for empty array', () => {
    expect(() => linearRegression([])).toThrow(/empty/i);
  });
  it('returns NaN-safe results (no NaN in output)', () => {
    const r = linearRegression([5, 5, 5]);
    expect(Number.isNaN(r.slope)).toBe(false);
    expect(Number.isNaN(r.r2)).toBe(false);
  });
});

describe('detectAnomalies', () => {
  it('detects values more than 2σ from the mean by default', () => {
    const anomalies = detectAnomalies([5, 5, 5, 5, 5, 10]);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies.some((a) => a.value === 10)).toBe(true);
  });
  it('returns empty array when no anomalies exist', () => {
    expect(detectAnomalies([5, 5, 5, 5])).toEqual([]);
  });
  it('uses custom threshold', () => {
    const values = [1, 2, 3, 4, 100];
    expect(detectAnomalies(values, 1).length).toBeGreaterThanOrEqual(
      detectAnomalies(values, 2).length,
    );
  });
  it('returns correct index, value, and deviation', () => {
    const anomalies = detectAnomalies([0, 0, 0, 0, 0, 100]);
    const a = anomalies.find((x) => x.value === 100);
    expect(a).toBeDefined();
    expect(a.index).toBe(5);
    expect(a.deviation).toBeGreaterThan(0);
  });
  it('returns empty array for single value', () => {
    expect(detectAnomalies([42])).toEqual([]);
  });
  it('returns empty array for constant values', () => {
    expect(detectAnomalies([5, 5, 5, 5, 5])).toEqual([]);
  });
  it('throws for empty array', () => {
    expect(() => detectAnomalies([])).toThrow(/empty/i);
  });
});

describe('trendDirection', () => {
  it('returns "improving" for positive slope with high R²', () => {
    expect(trendDirection(0.5, 0.8)).toBe('improving');
  });
  it('returns "declining" for negative slope with high R²', () => {
    expect(trendDirection(-0.5, 0.8)).toBe('declining');
  });
  it('returns "stable" for zero slope', () => {
    expect(trendDirection(0, 0.9)).toBe('stable');
  });
  it('returns "stable" for low R² regardless of slope', () => {
    expect(trendDirection(5.0, 0.3)).toBe('stable');
    expect(trendDirection(-5.0, 0.1)).toBe('stable');
  });
  it('returns "stable" for medium R² with near-zero slope', () => {
    expect(trendDirection(0.0005, 0.5)).toBe('stable');
  });
  it('uses R² threshold boundaries correctly', () => {
    expect(trendDirection(10, 0.4)).toBe('stable');
    expect(trendDirection(10, 0.41)).toBe('improving');
    expect(trendDirection(10, 0.7)).toBe('improving');
  });
});
