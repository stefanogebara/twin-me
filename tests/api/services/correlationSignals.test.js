/**
 * Characterization tests for the PURE math helpers in correlationSignals.js.
 * The I/O (fetchTimeZone, fetchCalendarLoadDays) is graceful glue verified live;
 * the tercile/mean/stddev math and local-time bucketing are where correctness
 * lives, so they're pinned here. No mocking — these functions touch no I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  mean,
  stddev,
  tercileHigh,
  tercileLow,
  localParts,
} from '../../../api/services/correlationSignals.js';

describe('mean', () => {
  it('averages the numeric values', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([10])).toBe(10);
  });

  it('ignores non-numbers and NaN', () => {
    expect(mean([1, 'x', 3, null, undefined, NaN, 5])).toBe(3); // (1+3+5)/3
  });

  it('returns null for an empty (or all-invalid) array', () => {
    expect(mean([])).toBeNull();
    expect(mean(['a', null, NaN])).toBeNull();
  });
});

describe('stddev', () => {
  it('computes the population standard deviation', () => {
    // values 2,4,6 -> mean 4, variance ((4+0+4)/3)=2.666..., sqrt~1.632993
    expect(stddev([2, 4, 6])).toBeCloseTo(1.632993, 5);
  });

  it('returns 0 when fewer than two valid values', () => {
    expect(stddev([])).toBe(0);
    expect(stddev([42])).toBe(0);
    expect(stddev(['x', 5])).toBe(0); // only one valid number
  });

  it('is zero for constant data', () => {
    expect(stddev([7, 7, 7, 7])).toBe(0);
  });
});

describe('tercileHigh / tercileLow', () => {
  it('returns the value at the 2/3 and 1/3 sorted positions', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // len 9
    // floor(9 * 2/3) = index 6 -> 7 ; floor(9 * 1/3) = index 3 -> 4
    expect(tercileHigh(vals)).toBe(7);
    expect(tercileLow(vals)).toBe(4);
  });

  it('sorts numerically (not lexicographically) before indexing', () => {
    const vals = [9, 1, 5, 3, 7]; // sorted: 1,3,5,7,9 (len 5)
    // high: floor(5*2/3)=3 -> 7 ; low: floor(5*1/3)=1 -> 3
    expect(tercileHigh(vals)).toBe(7);
    expect(tercileLow(vals)).toBe(3);
  });

  it('drops non-numeric entries before computing', () => {
    const vals = [1, 'x', 2, null, 3];
    // filtered+sorted: [1,2,3] len 3 -> high floor(2)=idx2 ->3 ; low floor(1)=idx1 ->2
    expect(tercileHigh(vals)).toBe(3);
    expect(tercileLow(vals)).toBe(2);
  });

  it('returns +/-Infinity sentinels for an empty set', () => {
    expect(tercileHigh([])).toBe(Infinity);
    expect(tercileLow([])).toBe(-Infinity);
  });

  it('does not mutate the input array', () => {
    const vals = [3, 1, 2];
    tercileHigh(vals);
    tercileLow(vals);
    expect(vals).toEqual([3, 1, 2]);
  });
});

describe('localParts', () => {
  it('returns YYYY-MM-DD date and 0-23 hour in UTC by default', () => {
    const epoch = Date.UTC(2026, 0, 15, 14, 30, 0); // 2026-01-15 14:30 UTC
    expect(localParts(epoch)).toEqual({ date: '2026-01-15', hour: 14 });
  });

  it('shifts the local day/hour for a negative-offset timezone', () => {
    // 2026-01-15 02:00 UTC is still 2026-01-14 in New York (UTC-5 in Jan)
    const epoch = Date.UTC(2026, 0, 15, 2, 0, 0);
    const { date, hour } = localParts(epoch, 'America/New_York');
    expect(date).toBe('2026-01-14');
    expect(hour).toBe(21);
  });

  it('normalizes a rendered midnight (24) to hour 0', () => {
    const epoch = Date.UTC(2026, 5, 1, 0, 0, 0); // exact midnight UTC
    const { hour } = localParts(epoch, 'UTC');
    expect(hour).toBe(0);
  });
});
