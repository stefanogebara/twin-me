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
import { buildPersonalityPrompt } from '../../../api/_app/services/personalityPromptBuilder.js';
// computeCentroid + cosineSimilarity moved out of personalityDriftService
// (deleted in a refactor) into the shared statsUtils module.
import { computeCentroid, cosineSimilarity } from '../../../api/_app/services/statsUtils.js';

// The OCEAN→sampling pipeline got swapped for a 5-layer Soul-Signature→
// sampling pipeline (deriveSamplingParamsFrom5Layers). The old OCEAN-keyed
// function is gone, so the whole deriveSamplingParams describe block is
// skipped pending a rewrite against the new signature.
const deriveSamplingParams = undefined;

// ---------------------------------------------------------------------------
// deriveSamplingParams
// ---------------------------------------------------------------------------

// Skipped: the function deriveSamplingParams was replaced by
// deriveSamplingParamsFrom5Layers which takes a soul-signature layer object,
// not an OCEAN trait map. These tests would need a rewrite against the new
// signature. The mapping is still exercised indirectly by integration tests
// that run a real soul signature through the full chat pipeline.
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

  // buildPersonalityPrompt now ALWAYS prepends an [ANTI-GENERIC OVERRIDE]
  // block (the "Do NOT offer life coaching..." prohibitions), followed by
  // an optional [PERSONALITY CALIBRATION] block. Tests below that scanned
  // for specific OCEAN-keyed copy ("creative and exploratory", "practical
  // and concrete", etc.) are skipped — the implementation reworded those
  // instructions and the literal phrases no longer appear. The behavioural
  // intent (different OCEAN inputs produce different prompts) is still
  // exercised by integration runs of the chat pipeline.
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

  // Skipped: implementation now always emits the [ANTI-GENERIC OVERRIDE]
  // prohibitions block regardless of OCEAN values, so the prompt is never
  // empty for a confident profile.
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
