import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transformToRadarData,
  transformToClusterData,
  calculateCompleteness,
  getCategoryColor,
  formatTimelineDate,
} from '../../src/utils/dataTransformers';

/**
 * Characterization tests for the soul-signature → visualization transforms.
 *
 * These are pure data-shaping helpers (no network, no DOM). Tests PIN current
 * behavior (audit-2026-07-04): default fills, rounding, clamping, category
 * colors, and relative-date bucketing. formatTimelineDate reads Date.now(), so
 * those tests use fake timers to stay deterministic.
 */

describe('transformToRadarData', () => {
  it('maps all five OCEAN traits scaled to 0-100 with fullMark 100', () => {
    const result = transformToRadarData({
      personality: {
        openness: 0.8,
        conscientiousness: 0.6,
        extraversion: 0.4,
        agreeableness: 0.9,
        neuroticism: 0.2,
      },
    });
    expect(result).toEqual([
      { trait: 'Openness', value: 80, fullMark: 100 },
      { trait: 'Conscientiousness', value: 60, fullMark: 100 },
      { trait: 'Extraversion', value: 40, fullMark: 100 },
      { trait: 'Agreeableness', value: 90, fullMark: 100 },
      { trait: 'Neuroticism', value: 20, fullMark: 100 },
    ]);
  });

  it('CHARACTERIZATION: missing personality defaults every trait to 0.5 → 50', () => {
    const result = transformToRadarData({});
    expect(result.map((r) => r.value)).toEqual([50, 50, 50, 50, 50]);
  });

  it('CHARACTERIZATION: null / undefined soulSignature also defaults to 50s', () => {
    expect(transformToRadarData(null).map((r) => r.value)).toEqual([50, 50, 50, 50, 50]);
    expect(transformToRadarData(undefined).map((r) => r.value)).toEqual([50, 50, 50, 50, 50]);
  });

  it('CHARACTERIZATION: a trait value of 0 is falsy → falls back to 0.5 → 50', () => {
    // `personality.openness || 0.5` treats an explicit 0 as "missing".
    const result = transformToRadarData({ personality: { openness: 0 } });
    expect(result[0]).toEqual({ trait: 'Openness', value: 50, fullMark: 100 });
  });

  it('rounds fractional percentages (0.756 → 76)', () => {
    const result = transformToRadarData({ personality: { openness: 0.756 } });
    expect(result[0].value).toBe(76);
  });
});

describe('transformToClusterData', () => {
  it('returns empty array when no clusters present', () => {
    expect(transformToClusterData({})).toEqual([]);
    expect(transformToClusterData(null)).toEqual([]);
  });

  it('maps personal clusters with id, category, and derived size/strength', () => {
    const result = transformToClusterData({
      personalClusters: [
        {
          name: 'Music',
          intensityLevel: 80,
          dataPoints: [{ title: 'Song A' }, { name: 'Song B' }],
        },
      ],
    });
    expect(result).toEqual([
      {
        id: 'personal-0',
        name: 'Music',
        category: 'personal',
        size: 2,
        strength: 80,
        items: ['Song A', 'Song B'],
      },
    ]);
  });

  it('CHARACTERIZATION: defaults name, size (10), strength (50) when fields missing', () => {
    const result = transformToClusterData({ personalClusters: [{}] });
    expect(result[0]).toEqual({
      id: 'personal-0',
      name: 'Personal 1',
      category: 'personal',
      size: 10,
      strength: 50,
      items: [],
    });
  });

  it('preserves category ordering personal → professional → creative', () => {
    const result = transformToClusterData({
      personalClusters: [{ name: 'P' }],
      professionalClusters: [{ name: 'Work' }],
      creativeClusters: [{ name: 'Art' }],
    });
    expect(result.map((c) => c.category)).toEqual(['personal', 'professional', 'creative']);
    expect(result.map((c) => c.id)).toEqual(['personal-0', 'professional-0', 'creative-0']);
  });

  it('CHARACTERIZATION: item labels prefer dp.title then fall back to dp.name', () => {
    const result = transformToClusterData({
      creativeClusters: [{ dataPoints: [{ title: 'T' }, { name: 'N' }, {}] }],
    });
    // Third data point has neither title nor name → undefined in the array.
    expect(result[0].items).toEqual(['T', 'N', undefined]);
  });

  it('numbers default names per-category starting at 1', () => {
    const result = transformToClusterData({
      professionalClusters: [{}, {}],
    });
    expect(result.map((c) => c.name)).toEqual(['Professional 1', 'Professional 2']);
  });
});

describe('calculateCompleteness', () => {
  it('returns all zeros for no platforms and no clusters', () => {
    const result = calculateCompleteness([], {});
    expect(result).toEqual({
      overall: 0,
      breakdown: { personal: 0, professional: 0, creative: 0 },
    });
  });

  it('CHARACTERIZATION: only connected platforms count toward completeness', () => {
    const platforms = [
      { connected: true },
      { connected: false },
      { connected: true },
    ];
    const result = calculateCompleteness(platforms, {});
    // connectedCount = 2, total = 30 → 2/30*100 = 6.66; overall = (6.66+0+0+0)/4
    // = 1.66 → round → 2.
    expect(result.overall).toBe(2);
  });

  it('caps each breakdown dimension at 100', () => {
    const result = calculateCompleteness([], {
      personalClusters: new Array(10).fill({}), // 10/5 → 200% → capped 100
      professionalClusters: new Array(8).fill({}), // 8/5 → 160% → capped 100
      creativeClusters: new Array(5).fill({}), // 5/3 → 166% → capped 100
    });
    expect(result.breakdown).toEqual({ personal: 100, professional: 100, creative: 100 });
  });

  it('CHARACTERIZATION: partial cluster counts scale linearly (targets 5/5/3)', () => {
    const result = calculateCompleteness([], {
      personalClusters: new Array(1).fill({}), // 1/5 → 20
      professionalClusters: new Array(2).fill({}), // 2/5 → 40
      creativeClusters: new Array(1).fill({}), // 1/3 → 33.33 → round 33
    });
    expect(result.breakdown).toEqual({ personal: 20, professional: 40, creative: 33 });
  });

  it('computes overall as the 4-way average of platform% + three breakdowns, capped 100', () => {
    const platforms = new Array(30).fill({ connected: true }); // 30/30 → 100%
    const result = calculateCompleteness(platforms, {
      personalClusters: new Array(5).fill({}), // 100
      professionalClusters: new Array(5).fill({}), // 100
      creativeClusters: new Array(3).fill({}), // 100
    });
    // (100+100+100+100)/4 = 100.
    expect(result.overall).toBe(100);
  });

  it('CHARACTERIZATION: null soulSignature yields zero breakdowns (optional chaining)', () => {
    const result = calculateCompleteness([{ connected: true }], null);
    expect(result.breakdown).toEqual({ personal: 0, professional: 0, creative: 0 });
  });
});

describe('getCategoryColor', () => {
  it('returns the emerald palette for personal', () => {
    expect(getCategoryColor('personal')).toEqual({
      light: '#10B981',
      medium: '#059669',
      dark: '#047857',
    });
  });

  it('returns the blue palette for professional', () => {
    expect(getCategoryColor('professional')).toEqual({
      light: '#3B82F6',
      medium: '#2563EB',
      dark: '#1D4ED8',
    });
  });

  it('returns the sand palette for creative', () => {
    expect(getCategoryColor('creative')).toEqual({
      light: '#C9B99A',
      medium: '#C9B99A',
      dark: '#A89A7E',
    });
  });
});

describe('formatTimelineDate', () => {
  // formatTimelineDate compares against Date.now(); freeze it for determinism.
  const NOW = new Date('2026-07-04T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it('returns "Today" for the current instant', () => {
    expect(formatTimelineDate(NOW.toISOString())).toBe('Today');
  });

  it('CHARACTERIZATION: uses Math.ceil, so ~1 day ago rounds up to "Yesterday"', () => {
    // Exactly 24h ago → diffDays ceil(1) = 1 → "Yesterday".
    expect(formatTimelineDate(daysAgo(1))).toBe('Yesterday');
  });

  it('returns "N days ago" for 2-6 days', () => {
    expect(formatTimelineDate(daysAgo(3))).toBe('3 days ago');
    expect(formatTimelineDate(daysAgo(6))).toBe('6 days ago');
  });

  it('returns weeks for 7-29 days', () => {
    expect(formatTimelineDate(daysAgo(7))).toBe('1 weeks ago');
    expect(formatTimelineDate(daysAgo(20))).toBe('2 weeks ago');
  });

  it('returns months for 30-364 days', () => {
    expect(formatTimelineDate(daysAgo(30))).toBe('1 months ago');
    expect(formatTimelineDate(daysAgo(90))).toBe('3 months ago');
  });

  it('returns years for 365+ days', () => {
    expect(formatTimelineDate(daysAgo(365))).toBe('1 years ago');
    expect(formatTimelineDate(daysAgo(800))).toBe('2 years ago');
  });

  it('CHARACTERIZATION: uses Math.abs, so a FUTURE date is bucketed by absolute distance', () => {
    // A date 3 days in the future has |diff| = 3 → "3 days ago" (the function
    // does not distinguish past vs future). Pinning this quirk.
    const future = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTimelineDate(future)).toBe('3 days ago');
  });
});
