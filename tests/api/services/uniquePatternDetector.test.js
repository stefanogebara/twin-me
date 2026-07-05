/**
 * Characterization tests for the PURE methods of UniquePatternDetector — the
 * population-percentile math (erf-based z-score conversion), extreme-feature
 * flagging, cross-platform consistency, rare-combination rules, and defining-
 * pattern marking. detectUniquePatterns() itself is DB-bound and out of scope;
 * database.js is mocked only for a clean import. The singleton is exercised
 * directly (its pure methods take features as arguments).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import detector from '../../../api/services/uniquePatternDetector.js';

describe('erf (error function approximation)', () => {
  it('is 0 at 0 and saturates toward +/-1', () => {
    expect(detector.erf(0)).toBeCloseTo(0, 6);
    expect(detector.erf(2)).toBeCloseTo(0.995322, 4);
    expect(detector.erf(-2)).toBeCloseTo(-0.995322, 4);
  });

  it('is an odd function (erf(-x) = -erf(x))', () => {
    expect(detector.erf(-1)).toBeCloseTo(-detector.erf(1), 10);
  });
});

describe('calculatePercentile', () => {
  it('returns ~50 for a value at the mean', () => {
    expect(detector.calculatePercentile(50, 50, 10)).toBeCloseTo(50, 2);
  });

  it('returns ~97.7 at +2 sigma and ~2.3 at -2 sigma', () => {
    expect(detector.calculatePercentile(70, 50, 10)).toBeCloseTo(97.72, 1);
    expect(detector.calculatePercentile(30, 50, 10)).toBeCloseTo(2.28, 1);
  });

  it('rounds to two decimals', () => {
    const p = detector.calculatePercentile(63, 50, 12);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBe(Math.round(p * 100) / 100);
  });
});

describe('formatFeatureName', () => {
  it('title-cases snake_case feature keys', () => {
    expect(detector.formatFeatureName('discovery_rate')).toBe('Discovery Rate');
    expect(detector.formatFeatureName('social_density')).toBe('Social Density');
    expect(detector.formatFeatureName('energy')).toBe('Energy');
  });
});

describe('detectExtremeFeatures', () => {
  it('flags a top-5% feature with the right label and z-score', () => {
    // spotify.discovery_rate baseline mean 35, stdDev 15. Value 80 -> z=3 -> ~99.9 pctile
    const features = [
      { id: 'f1', platform: 'spotify', feature_type: 'discovery_rate', feature_value: 80 },
    ];
    const patterns = detector.detectExtremeFeatures('u1', features);
    expect(patterns).toHaveLength(1);
    const p = patterns[0];
    expect(p.pattern_type).toBe('extreme_feature');
    expect(p.population_percentile).toBeGreaterThanOrEqual(95);
    expect(p.description).toMatch(/exceptionally high/);
    expect(p.evidence.z_score).toBeCloseTo(3, 6);
    expect(p.uniqueness_score).toBeGreaterThan(70);
  });

  it('flags a bottom-5% feature', () => {
    // value 5 -> z=(5-35)/15=-2 -> ~2.3 pctile
    const features = [
      { id: 'f2', platform: 'spotify', feature_type: 'discovery_rate', feature_value: 5 },
    ];
    const [p] = detector.detectExtremeFeatures('u1', features);
    expect(p.description).toMatch(/exceptionally low/);
    expect(p.population_percentile).toBeLessThanOrEqual(5);
  });

  it('ignores middle-of-the-pack values and unknown feature types', () => {
    const features = [
      { id: 'f3', platform: 'spotify', feature_type: 'discovery_rate', feature_value: 36 }, // ~near mean
      { id: 'f4', platform: 'spotify', feature_type: 'not_a_real_feature', feature_value: 999 },
      { id: 'f5', platform: 'unknown_platform', feature_type: 'discovery_rate', feature_value: 100 },
    ];
    expect(detector.detectExtremeFeatures('u1', features)).toEqual([]);
  });
});

describe('detectCrossPlatformPatterns', () => {
  it('surfaces a consistent dimension spanning >=2 platforms', () => {
    // Two platforms both contributing to "openness" with near-identical values
    // -> low variance -> consistency ~100 >= 80.
    const features = [
      { id: 'a', platform: 'spotify', contributes_to: 'openness', feature_value: 72 },
      { id: 'b', platform: 'calendar', contributes_to: 'openness', feature_value: 74 },
    ];
    const [p] = detector.detectCrossPlatformPatterns('u1', features);
    expect(p.pattern_type).toBe('cross_platform_consistency');
    expect(p.platforms.sort()).toEqual(['calendar', 'spotify']);
    expect(p.uniqueness_score).toBeGreaterThanOrEqual(80);
  });

  it('does not surface single-platform dimensions or high-variance ones', () => {
    const singlePlatform = [
      { id: 'a', platform: 'spotify', contributes_to: 'openness', feature_value: 72 },
      { id: 'b', platform: 'spotify', contributes_to: 'openness', feature_value: 74 },
    ];
    expect(detector.detectCrossPlatformPatterns('u1', singlePlatform)).toEqual([]);

    const highVariance = [
      { id: 'a', platform: 'spotify', contributes_to: 'openness', feature_value: 10 },
      { id: 'b', platform: 'calendar', contributes_to: 'openness', feature_value: 90 },
    ];
    // variance huge -> consistency well below 80
    expect(detector.detectCrossPlatformPatterns('u1', highVariance)).toEqual([]);
  });
});

describe('detectRareCombinations', () => {
  it('detects a dual-high combination (both features > 65)', () => {
    const features = [
      { id: 'a', platform: 'spotify', feature_type: 'discovery_rate', feature_value: 80 },
      { id: 'b', platform: 'spotify', feature_type: 'repeat_listening', feature_value: 70 },
    ];
    const patterns = detector.detectRareCombinations('u1', features);
    const explorer = patterns.find(p => p.pattern_name === 'explorer_loyalist');
    expect(explorer).toBeDefined();
    expect(explorer.pattern_type).toBe('rare_combination');
    expect(explorer.user_value).toBe(75); // (80+70)/2
  });

  it('honors a custom condition (energetic_melancholic: energy>70 AND valence<40)', () => {
    const features = [
      { id: 'a', platform: 'spotify', feature_type: 'energy_preference', feature_value: 85 },
      { id: 'b', platform: 'spotify', feature_type: 'emotional_valence', feature_value: 30 },
    ];
    const patterns = detector.detectRareCombinations('u1', features);
    expect(patterns.some(p => p.pattern_name === 'energetic_melancholic')).toBe(true);
  });

  it('returns nothing when thresholds are not met', () => {
    const features = [
      { id: 'a', platform: 'spotify', feature_type: 'discovery_rate', feature_value: 50 },
      { id: 'b', platform: 'spotify', feature_type: 'repeat_listening', feature_value: 50 },
    ];
    expect(detector.detectRareCombinations('u1', features)).toEqual([]);
  });
});

describe('markDefiningPatterns', () => {
  it('marks up to the top 5 patterns with score >= 70 as defining', () => {
    const patterns = Array.from({ length: 7 }, (_, i) => ({
      uniqueness_score: 90 - i * 5, // 90,85,80,75,70,65,60
      is_defining: false,
    }));
    detector.markDefiningPatterns(patterns);
    // sorted desc; first 5 considered, only those >=70 marked.
    const defining = patterns.filter(p => p.is_defining);
    expect(defining).toHaveLength(5); // 90,85,80,75,70 all >=70
    expect(patterns.find(p => p.uniqueness_score === 65).is_defining).toBe(false);
  });

  it('marks fewer when some of the top 5 fall below 70', () => {
    const patterns = [
      { uniqueness_score: 95, is_defining: false },
      { uniqueness_score: 60, is_defining: false },
      { uniqueness_score: 50, is_defining: false },
    ];
    detector.markDefiningPatterns(patterns);
    expect(patterns.filter(p => p.is_defining)).toHaveLength(1);
  });
});
