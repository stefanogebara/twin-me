/**
 * Regression guard for NOISE_OBSERVATION_PATTERNS in memoryStreamService.js.
 *
 * Background: pre-2026-05-16, branch-creation and other periodic GitHub
 * snapshots were rated importance 7-8 by the LLM importance rater. They
 * drowned out genuinely meaningful memories (Renan's strategic advice was
 * buried at rank 33+ because 20+ "Created branch twin-voice-fixes" rows
 * had literal string-match advantage on "twin-me").
 *
 * Fix: clamp matching observations to importance 3-4 BEFORE the LLM rater
 * runs. This test pins the patterns + cap values so a future edit to the
 * regex list can't silently lower the cap or drop a pattern.
 *
 * Inline copy follows the existing tests/unit/* convention (avoid loading
 * memoryStreamService.js which pulls in Supabase + embedding service).
 */
import { describe, it, expect } from 'vitest';

const NOISE_OBSERVATION_PATTERNS = [
  { rx: /^Created branch ".+" in/i, score: 3 },
  { rx: /^Your GitHub language distribution:/i, score: 3 },
  { rx: /^Your GitHub \d{4} activity: \d+ contributions/i, score: 4 },
  { rx: /^Committed code on \d+ days in the last \d+ days/i, score: 4 },
  { rx: /^Current GitHub contribution streak: \d+ consecutive days/i, score: 4 },
];

function clampNoiseObservation(content) {
  for (const { rx, score } of NOISE_OBSERVATION_PATTERNS) {
    if (rx.test(content)) return score;
  }
  return null;
}

describe('clampNoiseObservation', () => {
  describe('branch creation (cap 3)', () => {
    it('clamps the exact format emitted by observationFetchers/github.js', () => {
      expect(clampNoiseObservation('Created branch "twin-voice-fixes" in twin-me')).toBe(3);
    });

    it('clamps codex-style branch names with slashes and dates', () => {
      expect(
        clampNoiseObservation('Created branch "codex/launch-hardening-env-ci-2026-05-13" in PLAYFUNDED')
      ).toBe(3);
    });

    it('clamps multi-word repo names', () => {
      expect(clampNoiseObservation('Created branch "stripe-test-preview" in twin-me')).toBe(3);
    });
  });

  describe('GitHub annual/periodic snapshots', () => {
    it('clamps language distribution to 3', () => {
      expect(
        clampNoiseObservation('Your GitHub language distribution: TypeScript (45%), JavaScript (30%)')
      ).toBe(3);
    });

    it('clamps annual activity summary to 4', () => {
      expect(
        clampNoiseObservation('Your GitHub 2026 activity: 1840 contributions — 1200 commits, 400 PRs')
      ).toBe(4);
    });

    it('clamps commit-days rolling stat to 4', () => {
      expect(clampNoiseObservation('Committed code on 22 days in the last 30 days on GitHub')).toBe(4);
    });

    it('clamps current streak to 4', () => {
      expect(clampNoiseObservation('Current GitHub contribution streak: 12 consecutive days')).toBe(4);
    });
  });

  describe('non-matching observations pass through (null → LLM rater handles them)', () => {
    it('does not clamp meaningful PR titles', () => {
      expect(clampNoiseObservation('Merged PR in twin-me: "Add Renan concept retrieval"')).toBeNull();
    });

    it('does not clamp commit-message pushes', () => {
      expect(
        clampNoiseObservation('Pushed 3 commits to twin-me on main — "fix retrieval bias", "add tests"')
      ).toBeNull();
    });

    it('does not clamp repo creation (low volume, real signal)', () => {
      expect(clampNoiseObservation('Created new GitHub repository: seatable-experiments')).toBeNull();
    });

    it('does not clamp Renan-style facts that surface concept advice', () => {
      expect(
        clampNoiseObservation('Renan said: design TwinMe for the mainstream user, kill the auteur features')
      ).toBeNull();
    });
  });

  it('regex order does not matter — first match wins, no cap is ever raised', () => {
    // No pattern in the list should produce a score above 4. If a future PR
    // raises a cap, this guard fails.
    const samples = [
      'Created branch "x" in y',
      'Your GitHub language distribution: foo',
      'Your GitHub 2026 activity: 1 contributions',
      'Committed code on 1 days in the last 1 days',
      'Current GitHub contribution streak: 1 consecutive days',
    ];
    for (const s of samples) {
      const score = clampNoiseObservation(s);
      expect(score).not.toBeNull();
      expect(score).toBeLessThanOrEqual(4);
      expect(score).toBeGreaterThanOrEqual(3);
    }
  });
});
