/**
 * Characterization tests for the memory-quality pure functions in
 * memoryStreamService.js — the math that decides WHAT the twin remembers and
 * HOW PROMINENTLY it surfaces. "Memory Is Everything" for this product, and
 * each of these was tuned in response to a real quality incident, yet none had
 * direct coverage:
 *
 *   - computeAlpha            -> memory prominence (full / truncated / omitted)
 *   - applyImportanceFloor    -> per-type retention floors (+ the noise-clamp exception)
 *   - clampNoiseObservation   -> GitHub high-volume-low-signal suppression
 *
 * Mocks mirror memoryStream.test.js so importing the service is side-effect free.
 */
import { describe, it, expect, vi } from 'vitest';

// --- Module mocks (hoisted before imports) so the import graph is inert ---
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  vectorToString: vi.fn().mockReturnValue('[0,0,0]'),
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '5' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));
process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { computeAlpha, applyImportanceFloor, clampNoiseObservation } =
  await import('../../../api/services/memoryStreamService.js');

describe('computeAlpha — memory prominence weight', () => {
  // Formula: confidence * (importance_score/10) * min(1, 0.85 + 0.05*retrieval_count)
  it('matches the documented P5 example (imp 7, conf 0.7, count 0 -> ~0.416)', () => {
    expect(computeAlpha({ confidence: 0.7, importance_score: 7, retrieval_count: 0 }))
      .toBeCloseTo(0.4165, 4);
  });

  it('applies documented defaults for a bare memory (conf 0.7, imp 5, count 0)', () => {
    // 0.7 * 0.5 * 0.85 = 0.2975
    expect(computeAlpha({})).toBeCloseTo(0.2975, 4);
  });

  it('null-coalesces each field independently and never throws', () => {
    expect(() => computeAlpha({ confidence: null, importance_score: undefined })).not.toThrow();
    expect(computeAlpha({ confidence: undefined, importance_score: undefined, retrieval_count: undefined }))
      .toBeCloseTo(0.2975, 4); // same as {} — all defaults
  });

  describe('citation boost saturates at 1.0', () => {
    it('reaches the cap exactly at retrieval_count = 3 (0.85 + 0.05*3)', () => {
      expect(computeAlpha({ confidence: 1, importance_score: 10, retrieval_count: 3 })).toBeCloseTo(1.0, 6);
    });
    it('is below the cap at count = 2 (boost 0.95)', () => {
      expect(computeAlpha({ confidence: 1, importance_score: 10, retrieval_count: 2 })).toBeCloseTo(0.95, 6);
    });
    it('does NOT exceed 1.0 for a heavily-cited memory (boost clamped)', () => {
      const alpha = computeAlpha({ confidence: 1, importance_score: 10, retrieval_count: 100 });
      expect(alpha).toBeCloseTo(1.0, 6);
      expect(alpha).toBeLessThanOrEqual(1.0);
    });
  });

  describe('lands memories in the documented prominence bands', () => {
    // Docstring contract: alpha >= 0.4 full, 0.2 <= alpha < 0.4 truncated, < 0.2 omitted.
    it('a strong first-retrieval memory is in the FULL band (>= 0.4)', () => {
      expect(computeAlpha({ confidence: 0.7, importance_score: 7, retrieval_count: 0 }))
        .toBeGreaterThanOrEqual(0.4);
    });
    it('a mid memory is in the TRUNCATED band (0.2–0.4)', () => {
      const alpha = computeAlpha({ confidence: 0.5, importance_score: 5, retrieval_count: 0 }); // 0.2125
      expect(alpha).toBeGreaterThanOrEqual(0.2);
      expect(alpha).toBeLessThan(0.4);
    });
    it('a weak memory is in the OMITTED band (< 0.2)', () => {
      expect(computeAlpha({ confidence: 0.7, importance_score: 2, retrieval_count: 0 })) // 0.119
        .toBeLessThan(0.2);
    });
  });

  it('is monotonic increasing in importance (all else equal)', () => {
    const base = { confidence: 0.8, retrieval_count: 1 };
    const low = computeAlpha({ ...base, importance_score: 3 });
    const mid = computeAlpha({ ...base, importance_score: 6 });
    const high = computeAlpha({ ...base, importance_score: 9 });
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe('applyImportanceFloor — per-type retention floors', () => {
  it('floors platform_data below 6 up to 6', () => {
    expect(applyImportanceFloor('platform_data', 3)).toBe(6);
    expect(applyImportanceFloor('platform_data', 5)).toBe(6);
  });

  it('does NOT re-floor a noise-clamped platform_data row (the suppression guard)', () => {
    // This is the load-bearing exception: a git-noise row demoted to 3-4 must
    // KEEP that score, or the noise-suppression feature is silently undone.
    expect(applyImportanceFloor('platform_data', 3, { noiseClamped: true })).toBe(3);
    expect(applyImportanceFloor('platform_data', 4, { noiseClamped: true })).toBe(4);
  });

  it('leaves platform_data at or above the floor unchanged', () => {
    expect(applyImportanceFloor('platform_data', 6)).toBe(6);
    expect(applyImportanceFloor('platform_data', 9)).toBe(9);
  });

  it('floors conversation below 7 up to 7', () => {
    expect(applyImportanceFloor('conversation', 5)).toBe(7);
    expect(applyImportanceFloor('conversation', 6)).toBe(7);
  });

  it('leaves conversation at or above the floor unchanged', () => {
    expect(applyImportanceFloor('conversation', 7)).toBe(7);
    expect(applyImportanceFloor('conversation', 10)).toBe(10);
  });

  it('does not floor reflections or facts (they set their own importance)', () => {
    expect(applyImportanceFloor('reflection', 2)).toBe(2);
    expect(applyImportanceFloor('fact', 1)).toBe(1);
    expect(applyImportanceFloor('observation', 4)).toBe(4);
  });

  it('the noiseClamped flag only matters for platform_data', () => {
    // conversation is unaffected by noiseClamped — still floors.
    expect(applyImportanceFloor('conversation', 5, { noiseClamped: true })).toBe(7);
  });
});

describe('clampNoiseObservation — GitHub noise suppression', () => {
  it('clamps "Created branch" git noise to 3', () => {
    expect(clampNoiseObservation('Created branch "twin-voice-fixes" in twin-me')).toBe(3);
  });

  it('clamps periodic GitHub snapshots to 3–4', () => {
    expect(clampNoiseObservation('Your GitHub language distribution: TypeScript 60%')).toBe(3);
    expect(clampNoiseObservation('Your GitHub 2026 activity: 1200 contributions')).toBe(4);
  });

  it('clamps rolling GitHub stats to 4', () => {
    expect(clampNoiseObservation('Committed code on 5 days in the last 7 days')).toBe(4);
    expect(clampNoiseObservation('Current GitHub contribution streak: 12 consecutive days')).toBe(4);
  });

  it('matches case-insensitively', () => {
    expect(clampNoiseObservation('created branch "x" in y')).toBe(3);
  });

  it('returns null for genuine signal so it still reaches the LLM rater', () => {
    // The regression this whole feature exists to prevent: real advice must NOT
    // be clamped down into the noise floor.
    expect(clampNoiseObservation('Renan said: design for the mainstream user')).toBeNull();
    expect(clampNoiseObservation('Opened PR #42: Add dark-mode toggle to settings')).toBeNull();
    expect(clampNoiseObservation('')).toBeNull();
  });

  it('anchors patterns at the start (a noise phrase mid-sentence is still real signal)', () => {
    // The regexes are ^-anchored, so an embedded mention is not treated as noise.
    expect(clampNoiseObservation('I was thinking about how I created branch "x" in twin-me yesterday')).toBeNull();
  });
});
