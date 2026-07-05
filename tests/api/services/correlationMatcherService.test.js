/**
 * Characterization tests for CorrelationMatcherService — matches behavioral
 * features against research-backed personality correlations loaded from the
 * bundled validated-correlations.json (a deterministic local file, not a
 * network/DB source, so no mocking). Pins the pure confidence math, evidence
 * templating, direction inference, and Big-Five weighted aggregation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getCorrelationMatcherService,
  BIG_FIVE_TRAITS,
} from '../../../api/services/correlationMatcherService.js';

let svc;
beforeAll(() => {
  svc = getCorrelationMatcherService();
});

describe('getCorrelationMatcherService', () => {
  it('is a singleton', () => {
    expect(getCorrelationMatcherService()).toBe(svc);
  });
  it('exposes the Big Five trait list', () => {
    expect(BIG_FIVE_TRAITS).toEqual(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']);
  });
});

describe('calculateConfidence', () => {
  it('maps |r| to base bands and adds a sample-size bonus', () => {
    // |r| >= 0.5 -> 0.85 base; sampleBonus = min(0.15, log10(n)/20)
    // n=100 -> log10=2 -> bonus 0.1 -> 0.95 (also the overall cap)
    expect(svc.calculateConfidence(0.6, 100)).toBeCloseTo(0.95, 10);
    // |r| 0.3-0.5 -> 0.7 base; n=10 -> bonus min(0.15, 0.05)=0.05 -> 0.75
    expect(svc.calculateConfidence(0.35, 10)).toBeCloseTo(0.75, 10);
    // |r| 0.1-0.3 -> 0.5 base; n=1 -> log10(1)=0 -> 0.5
    expect(svc.calculateConfidence(0.2, 1)).toBeCloseTo(0.5, 10);
    // |r| < 0.1 -> 0.3 base
    expect(svc.calculateConfidence(0.05, 1)).toBeCloseTo(0.3, 10);
  });

  it('is sign-insensitive and clamps at 0.95', () => {
    expect(svc.calculateConfidence(-0.6, 100)).toBeCloseTo(0.95, 10);
    expect(svc.calculateConfidence(0.9, 1_000_000)).toBe(0.95); // huge sample still capped
  });
});

describe('calculateTraitConfidence', () => {
  it('combines an evidence-count bonus and a weight bonus over a 0.4 base', () => {
    // base 0.4 + min(0.3, count*0.05) + min(0.2, weight/50)
    expect(svc.calculateTraitConfidence(0, 0)).toBeCloseTo(0.4, 10);
    expect(svc.calculateTraitConfidence(2, 10)).toBeCloseTo(0.4 + 0.1 + 0.2, 10); // 0.7
    // caps: 10 evidence -> 0.3 cap; weight 1000 -> 0.2 cap. 0.4+0.3+0.2 lands at
    // 0.8999999999999999 in IEEE-754 (just under the 0.9 Math.min cap) — pinned.
    expect(svc.calculateTraitConfidence(10, 1000)).toBeCloseTo(0.9, 10);
  });
});

describe('generateEvidence', () => {
  it('picks the high/low template by isHigh and interpolates {value}', () => {
    const featureData = {
      evidenceTemplates: { high: 'HIGH {value}', low: 'LOW {value}' },
      description: 'fallback',
    };
    expect(svc.generateEvidence(featureData, true, { value: 0.876 })).toBe('HIGH 0.88');
    expect(svc.generateEvidence(featureData, false, { value: 0.1 })).toBe('LOW 0.10');
  });

  it('interpolates rawValue.* placeholders and uses N/A for missing keys', () => {
    const featureData = { evidenceTemplates: { high: 'plays {rawValue.count} tracks at {value}' } };
    expect(svc.generateEvidence(featureData, true, { count: 42 })).toBe('plays 42 tracks at N/A');
  });

  it('falls back to description when no template exists', () => {
    expect(svc.generateEvidence({ description: 'just this' }, true, {})).toBe('just this');
    expect(svc.generateEvidence({}, true, {})).toBe('');
  });
});

describe('findCorrelations (against the real bundled data)', () => {
  it('returns no matches for an unknown platform or feature', () => {
    expect(svc.findCorrelations('myspace', 'whatever', 0.9)).toEqual([]);
    expect(svc.findCorrelations('spotify', 'not_a_feature', 0.9)).toEqual([]);
  });

  it('infers a positive-r/high-value match as a trait indicator (+1)', () => {
    // spotify.energy_preference: extraversion r=+0.35, threshold 0.5.
    // value 0.9 (>= threshold) with +r -> direction +1.
    const matches = svc.findCorrelations('spotify', 'energy_preference', 0.9);
    const extra = matches.find((m) => m.trait === 'extraversion');
    expect(extra).toBeDefined();
    expect(extra.r_value).toBe(0.35);
    expect(extra.is_high).toBe(true);
    expect(extra.direction).toBe(1);
    expect(extra.confidence).toBeGreaterThan(0);
    // sorted by |r| desc
    for (let i = 1; i < matches.length; i++) {
      expect(Math.abs(matches[i - 1].r_value)).toBeGreaterThanOrEqual(Math.abs(matches[i].r_value));
    }
  });

  it('flips direction for a low value with positive r (-1)', () => {
    // value 0.1 (< threshold 0.5) with +r -> direction -1.
    const matches = svc.findCorrelations('spotify', 'energy_preference', 0.1);
    const extra = matches.find((m) => m.trait === 'extraversion');
    expect(extra.is_high).toBe(false);
    expect(extra.direction).toBe(-1);
  });
});

describe('inferPersonality', () => {
  it('returns a neutral 50 with zero confidence for every trait when given no matches', () => {
    const result = svc.inferPersonality([]);
    for (const trait of BIG_FIVE_TRAITS) {
      expect(result[trait]).toEqual({ score: 50, confidence: 0, evidence: [] });
    }
  });

  it('pushes a trait above 50 for a positive-direction match and below for negative', () => {
    const highExtra = svc.inferPersonality([
      { trait: 'extraversion', r_value: 0.5, direction: 1, sample_size: 1000, feature: 'f', platform: 'spotify', evidence: 'e' },
    ]);
    expect(highExtra.extraversion.score).toBeGreaterThan(50);

    const lowExtra = svc.inferPersonality([
      { trait: 'extraversion', r_value: 0.5, direction: -1, sample_size: 1000, feature: 'f', platform: 'spotify', evidence: 'e' },
    ]);
    expect(lowExtra.extraversion.score).toBeLessThan(50);
  });

  it('caps evidence at five pieces per trait', () => {
    const matches = Array.from({ length: 8 }, (_, i) => ({
      trait: 'openness', r_value: 0.3, direction: 1, sample_size: 100, feature: `f${i}`, platform: 'spotify', evidence: `e${i}`,
    }));
    const result = svc.inferPersonality(matches);
    expect(result.openness.evidence).toHaveLength(5);
  });
});

describe('getPlatformFeatures / getFeatureInfo', () => {
  it('lists features for a known platform and empty for unknown', () => {
    const features = svc.getPlatformFeatures('spotify');
    expect(features).toContain('energy_preference');
    expect(svc.getPlatformFeatures('myspace')).toEqual([]);
  });

  it('returns the feature block or null', () => {
    expect(svc.getFeatureInfo('spotify', 'energy_preference')).toHaveProperty('correlations');
    expect(svc.getFeatureInfo('spotify', 'nope')).toBeNull();
  });
});
