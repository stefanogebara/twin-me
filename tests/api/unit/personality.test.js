/**
 * Soul Signature Voting Layer — Unit Tests
 * =========================================
 * Tests for pure functions in the personality pipeline:
 * - deriveSamplingParams (OCEAN → LLM sampling parameters)
 * - buildPersonalityPrompt (profile → system prompt calibration block)
 * - computeCentroid (embedding vectors → centroid vector)
 * - cosineSimilarity (two vectors → similarity score)
 */

import { describe, it, expect } from 'vitest';
import { deriveSamplingParams } from '../../../api/services/personalityProfileService.js';
import { buildPersonalityPrompt } from '../../../api/services/personalityPromptBuilder.js';
import { computeCentroid, cosineSimilarity } from '../../../api/services/personalityDriftService.js';

// ---------------------------------------------------------------------------
// deriveSamplingParams
// ---------------------------------------------------------------------------

describe('deriveSamplingParams', () => {
  it('returns all four sampling fields', () => {
    const result = deriveSamplingParams({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    expect(result).toHaveProperty('temperature');
    expect(result).toHaveProperty('top_p');
    expect(result).toHaveProperty('frequency_penalty');
    expect(result).toHaveProperty('presence_penalty');
  });

  it('returns reasonable defaults for balanced OCEAN (all 0.5)', () => {
    const result = deriveSamplingParams({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    // temp = 0.5 + 0.5*0.25 - 0.5*0.15 + 0.5*0.05 = 0.575
    expect(result.temperature).toBeCloseTo(0.575, 2);
    // top_p = 0.85 + 0.5*0.08 - 0.5*0.05 = 0.865
    expect(result.top_p).toBeCloseTo(0.865, 2);
    // freq_penalty = 0.5*0.2 - 0.5*0.1 = 0.05
    expect(result.frequency_penalty).toBeCloseTo(0.05, 2);
    // pres_penalty = 0.5*0.2 = 0.1
    expect(result.presence_penalty).toBeCloseTo(0.1, 2);
  });

  it('increases temperature with high Openness', () => {
    const high = deriveSamplingParams({
      openness: 0.95, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const low = deriveSamplingParams({
      openness: 0.1, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    expect(high.temperature).toBeGreaterThan(low.temperature);
  });

  it('decreases temperature with high Conscientiousness', () => {
    const high = deriveSamplingParams({
      openness: 0.5, conscientiousness: 0.95, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const low = deriveSamplingParams({
      openness: 0.5, conscientiousness: 0.1, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    expect(high.temperature).toBeLessThan(low.temperature);
  });

  it('increases presence_penalty with high Extraversion', () => {
    const high = deriveSamplingParams({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.95,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    const low = deriveSamplingParams({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.1,
      agreeableness: 0.5, neuroticism: 0.5,
    });
    expect(high.presence_penalty).toBeGreaterThan(low.presence_penalty);
  });

  it('clamps all values within valid bounds', () => {
    // All traits at 1.0 — push towards upper bounds
    const maxed = deriveSamplingParams({
      openness: 1.0, conscientiousness: 1.0, extraversion: 1.0,
      agreeableness: 1.0, neuroticism: 1.0,
    });
    expect(maxed.temperature).toBeGreaterThanOrEqual(0.4);
    expect(maxed.temperature).toBeLessThanOrEqual(0.95);
    expect(maxed.top_p).toBeGreaterThanOrEqual(0.8);
    expect(maxed.top_p).toBeLessThanOrEqual(0.98);
    expect(maxed.frequency_penalty).toBeGreaterThanOrEqual(0.0);
    expect(maxed.frequency_penalty).toBeLessThanOrEqual(0.3);
    expect(maxed.presence_penalty).toBeGreaterThanOrEqual(0.0);
    expect(maxed.presence_penalty).toBeLessThanOrEqual(0.3);

    // All traits at 0.0 — push towards lower bounds
    const zeroed = deriveSamplingParams({
      openness: 0.0, conscientiousness: 0.0, extraversion: 0.0,
      agreeableness: 0.0, neuroticism: 0.0,
    });
    expect(zeroed.temperature).toBeGreaterThanOrEqual(0.4);
    expect(zeroed.temperature).toBeLessThanOrEqual(0.95);
    expect(zeroed.top_p).toBeGreaterThanOrEqual(0.8);
    expect(zeroed.top_p).toBeLessThanOrEqual(0.98);
    expect(zeroed.frequency_penalty).toBeGreaterThanOrEqual(0.0);
    expect(zeroed.frequency_penalty).toBeLessThanOrEqual(0.3);
    expect(zeroed.presence_penalty).toBeGreaterThanOrEqual(0.0);
    expect(zeroed.presence_penalty).toBeLessThanOrEqual(0.3);
  });

  it('returns 3-decimal precision (round3)', () => {
    const result = deriveSamplingParams({
      openness: 0.82, conscientiousness: 0.45, extraversion: 0.75,
      agreeableness: 0.60, neuroticism: 0.35,
    });
    // All values should have at most 3 decimal places
    for (const val of Object.values(result)) {
      const decimalPlaces = (val.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// buildPersonalityPrompt
// ---------------------------------------------------------------------------

describe('buildPersonalityPrompt', () => {
  it('returns empty string for null profile', () => {
    expect(buildPersonalityPrompt(null)).toBe('');
  });

  it('returns empty string for undefined profile', () => {
    expect(buildPersonalityPrompt(undefined)).toBe('');
  });

  it('returns empty string when confidence < 0.2', () => {
    const result = buildPersonalityPrompt({
      openness: 0.9, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.1,
    });
    expect(result).toBe('');
  });

  it('starts with [PERSONALITY CALIBRATION] header', () => {
    const result = buildPersonalityPrompt({
      openness: 0.9, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
    });
    expect(result).toMatch(/^\[PERSONALITY CALIBRATION\]/);
  });

  it('includes creative instruction for high Openness (>0.65)', () => {
    const result = buildPersonalityPrompt({
      openness: 0.8, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
    });
    expect(result).toContain('creative and exploratory');
  });

  it('includes practical instruction for low Openness (<0.35)', () => {
    const result = buildPersonalityPrompt({
      openness: 0.2, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
    });
    expect(result).toContain('practical and concrete');
  });

  it('includes measured instruction for low Extraversion', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.2,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
    });
    expect(result).toContain('measured and thoughtful');
  });

  it('includes warm instruction for high Agreeableness', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.8, neuroticism: 0.5, confidence: 0.5,
    });
    expect(result).toContain('warm and supportive');
  });

  it('includes direct instruction for low Agreeableness', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.2, neuroticism: 0.5, confidence: 0.5,
    });
    expect(result).toContain('direct and straightforward');
  });

  it('includes stylometric sentence length instruction', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
      avg_sentence_length: 8,
    });
    expect(result).toContain('short sentences');
  });

  it('includes humor instruction when humor_markers > 0.02', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
      humor_markers: 0.05,
    });
    expect(result).toContain('humor');
  });

  it('includes casual tone for low formality', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
      formality_score: 0.15,
    });
    expect(result).toContain('casual, informal');
  });

  it('returns empty string when all traits are mid-range (no instructions triggered)', () => {
    const result = buildPersonalityPrompt({
      openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
      agreeableness: 0.5, neuroticism: 0.5, confidence: 0.5,
      // No stylometric fields → no style instructions either
    });
    // Mid-range traits (0.35-0.65) generate no OCEAN instructions
    // No stylometric fields → no style instructions
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// computeCentroid
// ---------------------------------------------------------------------------

describe('computeCentroid', () => {
  it('returns the same vector for a single embedding', () => {
    const vec = [1, 2, 3, 4, 5];
    const result = computeCentroid([vec]);
    expect(result).toEqual(vec);
  });

  it('returns the midpoint of two vectors', () => {
    const result = computeCentroid([[0, 0, 0], [2, 4, 6]]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('averages three vectors correctly', () => {
    const result = computeCentroid([[3, 0, 0], [0, 3, 0], [0, 0, 3]]);
    expect(result).toEqual([1, 1, 1]);
  });

  it('handles negative values', () => {
    const result = computeCentroid([[-1, 1], [1, -1]]);
    expect(result).toEqual([0, 0]);
  });

  it('preserves precision with real-world scale vectors', () => {
    // Simulate 1536-d embeddings (use small subset)
    const v1 = Array.from({ length: 10 }, (_, i) => 0.1 * (i + 1));
    const v2 = Array.from({ length: 10 }, (_, i) => 0.2 * (i + 1));
    const result = computeCentroid([v1, v2]);
    // Each element should be average of v1[i] and v2[i]
    for (let i = 0; i < 10; i++) {
      expect(result[i]).toBeCloseTo((v1[i] + v2[i]) / 2, 10);
    }
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const vec = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 10);
  });

  it('returns 1.0 for parallel vectors (different magnitude)', () => {
    expect(cosineSimilarity([1, 0, 0], [5, 0, 0])).toBeCloseTo(1.0, 10);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 10);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0, 10);
  });

  it('returns 0 when either vector is zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('computes correct similarity for known vectors', () => {
    // cos(45°) ≈ 0.7071
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('is commutative', () => {
    const a = [0.3, -0.5, 0.8, 0.1];
    const b = [0.7, 0.2, -0.4, 0.6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('works with realistic high-dimensional vectors', () => {
    // 100-d random-ish vectors — just verify range [-1, 1]
    const a = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.7));
    const b = Array.from({ length: 100 }, (_, i) => Math.cos(i * 0.3));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1.0);
    expect(sim).toBeLessThanOrEqual(1.0);
  });
});
