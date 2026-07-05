/**
 * Characterization tests for patternHypothesisEngine.calculateConfidence — the
 * pure statistical scorer that gates which discovered correlations become
 * natural-language hypotheses. Pins the exact tiered contributions of p-value,
 * sample size, |r|, and validation count. The generate/persist paths call the
 * LLM + DB and are intentionally out of scope. Module-load deps are mocked so
 * the import is side-effect-free.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/anthropicService.js', () => ({
  generateChatResponse: vi.fn(),
}));
vi.mock('../../../api/services/correlationDiscoveryEngine.js', () => ({
  default: { getActiveCorrelations: vi.fn() },
}));

// calculateConfidence is a named export; HYPOTHESIS_CATEGORIES is only exposed
// on the default export object.
import patternHypothesisEngine, {
  calculateConfidence,
} from '../../../api/services/patternHypothesisEngine.js';

const { HYPOTHESIS_CATEGORIES } = patternHypothesisEngine;

/** Base correlation with the "worst tier" in every dimension. */
const base = {
  p_value: 0.5,               // >= 0.05 -> +0.1
  sample_size: 5,             // < 15    -> +0.1
  correlation_coefficient: 0.05, // < 0.1 -> +0.1
  validation_count: 1,        // bonus min(0.2, 0.05) = 0.05
};

describe('calculateConfidence', () => {
  it('sums the lowest tier of every factor', () => {
    // 0.1 + 0.1 + 0.1 + 0.05 = 0.35
    expect(calculateConfidence(base)).toBeCloseTo(0.35, 10);
  });

  it('rewards a highly significant p-value (< 0.001 -> +0.3)', () => {
    expect(calculateConfidence({ ...base, p_value: 0.0005 })).toBeCloseTo(0.55, 10);
  });

  it('applies the p-value ladder (0.01 and 0.05 thresholds)', () => {
    expect(calculateConfidence({ ...base, p_value: 0.005 })).toBeCloseTo(0.50, 10); // +0.25
    expect(calculateConfidence({ ...base, p_value: 0.03 })).toBeCloseTo(0.45, 10);  // +0.20
  });

  it('applies the sample-size ladder (15 / 30 / 90)', () => {
    expect(calculateConfidence({ ...base, sample_size: 15 })).toBeCloseTo(0.40, 10); // +0.15
    expect(calculateConfidence({ ...base, sample_size: 30 })).toBeCloseTo(0.45, 10); // +0.20
    expect(calculateConfidence({ ...base, sample_size: 90 })).toBeCloseTo(0.50, 10); // +0.25
  });

  it('applies the |r| ladder (0.3 / 0.4 / 0.6) and uses absolute value', () => {
    expect(calculateConfidence({ ...base, correlation_coefficient: 0.3 })).toBeCloseTo(0.40, 10);  // +0.15
    expect(calculateConfidence({ ...base, correlation_coefficient: -0.45 })).toBeCloseTo(0.45, 10); // +0.20, sign-insensitive
    expect(calculateConfidence({ ...base, correlation_coefficient: -0.7 })).toBeCloseTo(0.50, 10);  // +0.25 (|r|>=0.6)
  });

  it('caps the validation-count bonus at 0.2 (4+ validations)', () => {
    expect(calculateConfidence({ ...base, validation_count: 4 })).toBeCloseTo(0.50, 10); // 0.3->0.2 bonus swap: 0.1+0.1+0.1+0.2
    expect(calculateConfidence({ ...base, validation_count: 100 })).toBeCloseTo(0.50, 10); // still capped
  });

  it('defaults validation_count to 1 when missing', () => {
    const { validation_count, ...noValidation } = base;
    expect(calculateConfidence(noValidation)).toBeCloseTo(0.35, 10);
  });

  it('clamps the final score at 1.0 for a maximally-strong correlation', () => {
    const strong = {
      p_value: 0.0001,               // +0.3
      sample_size: 500,              // +0.25
      correlation_coefficient: 0.9,  // +0.25
      validation_count: 10,          // +0.2 (capped)
    };
    // raw 1.0 exactly -> min(1, 1.0)
    expect(calculateConfidence(strong)).toBe(1);
  });
});

describe('HYPOTHESIS_CATEGORIES', () => {
  it('exposes the metric taxonomy including a catch-all "general"', () => {
    expect(Object.keys(HYPOTHESIS_CATEGORIES)).toEqual(
      expect.arrayContaining(['health_music', 'health_productivity', 'music_productivity', 'social_health', 'general']),
    );
    expect(HYPOTHESIS_CATEGORIES.general.metrics).toEqual([]);
    expect(HYPOTHESIS_CATEGORIES.health_music.metrics).toContain('recovery');
    expect(HYPOTHESIS_CATEGORIES.health_music.metrics).toContain('music_valence');
  });
});
