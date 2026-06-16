/**
 * Tests for the PURE core of chronotype — peak-window detection, circular hour
 * math, the misalignment gate, and candidate text. Gather is glue (live canary).
 */
import { describe, it, expect } from 'vitest';
import {
  peakWindowCenter,
  circularHourDiff,
  hourLabel,
  computeChronotype,
  buildChronotypeCandidate,
  GAP_FLOOR,
} from '../../../api/services/chronotype.js';

const repeat = (hour, n) => Array.from({ length: n }, () => hour);

describe('peakWindowCenter', () => {
  it('finds the center of the densest 3h window', () => {
    const hours = [...repeat(10, 5), ...repeat(11, 6), ...repeat(9, 4), ...repeat(15, 1)];
    expect(peakWindowCenter(hours)).toBe(10); // window 9-11 densest, center 10
  });
  it('wraps around midnight', () => {
    const hours = [...repeat(23, 5), ...repeat(0, 5), ...repeat(1, 5)];
    expect(peakWindowCenter(hours)).toBe(0); // 23,0,1 -> center 0
  });
  it('returns null for empty input', () => {
    expect(peakWindowCenter([])).toBeNull();
  });
});

describe('circularHourDiff', () => {
  it('measures forward distance', () => {
    expect(circularHourDiff(15, 10)).toBe(5); // meetings 5h after activity
  });
  it('measures backward distance across the wrap', () => {
    expect(circularHourDiff(8, 11)).toBe(-3);
    expect(circularHourDiff(1, 22)).toBe(3); // 22->1 is +3, not -21
  });
  it('is zero for the same hour', () => {
    expect(circularHourDiff(9, 9)).toBe(0);
  });
});

describe('hourLabel', () => {
  it('maps hours to time-of-day slices', () => {
    expect(hourLabel(9)).toBe('morning');
    expect(hourLabel(12)).toBe('late morning');
    expect(hourLabel(15)).toBe('early afternoon');
    expect(hourLabel(20)).toBe('evening');
    expect(hourLabel(2)).toBe('night');
  });
});

describe('computeChronotype', () => {
  it('surfaces a finding when activity and meeting peaks diverge', () => {
    const c = computeChronotype({
      activityHours: [...repeat(10, 12), ...repeat(11, 8)], // peak ~10-11 (morning)
      meetingHours: [...repeat(15, 10), ...repeat(16, 6)],  // peak ~15 (afternoon)
    });
    expect(c).not.toBeNull();
    expect(c.gap).toBeGreaterThanOrEqual(GAP_FLOOR);
    expect(c.activityLabel).toBe('morning');
    expect(c.meetingLabel).toBe('early afternoon');
  });

  it('returns null when peaks are aligned', () => {
    const c = computeChronotype({
      activityHours: [...repeat(14, 15)],
      meetingHours: [...repeat(15, 12)],
    });
    expect(c).toBeNull(); // 1h gap < floor
  });

  it('returns null on insufficient activity or meetings', () => {
    expect(computeChronotype({ activityHours: repeat(10, 5), meetingHours: repeat(15, 20) })).toBeNull();
    expect(computeChronotype({ activityHours: repeat(10, 20), meetingHours: repeat(15, 4) })).toBeNull();
    expect(computeChronotype({})).toBeNull();
  });
});

describe('buildChronotypeCandidate', () => {
  it('names both slices and frames the mismatch', () => {
    const text = buildChronotypeCandidate({ activityLabel: 'morning', meetingLabel: 'early afternoon', gap: 5 });
    expect(text).toMatch(/most active in the morning/);
    expect(text).toMatch(/meetings cluster in the early afternoon/);
    expect(text).toMatch(/different clocks/);
  });
  it('returns null when both peaks fall in the same slice', () => {
    expect(buildChronotypeCandidate({ activityLabel: 'morning', meetingLabel: 'morning', gap: 3 })).toBeNull();
  });
  it('returns null for no finding', () => {
    expect(buildChronotypeCandidate(null)).toBeNull();
  });
});
