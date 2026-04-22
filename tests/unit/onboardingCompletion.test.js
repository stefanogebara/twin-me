/**
 * Unit tests for the onboarding interview completion boundary.
 *
 * Regression guard for two bugs shipped on 2026-04-21:
 *
 *   Bug #1 (9838747c): using `currentQ >= MAX_QUESTIONS` with MAX=3 made
 *     the backend complete BEFORE generating Q3. Users saw only Q1+Q2 then
 *     a completion screen. Bonus: the original 12-Q flow had the same bug,
 *     delivering 11 questions not 12. Nobody noticed because 11 vs 12 is
 *     invisible; 2 vs 3 was obvious immediately.
 *
 *   Bug #2 (5a3aa5ba): after #1 was fixed with `currentQ > MAX_QUESTIONS`,
 *     Q4 never triggered completion because `currentQ = Math.min(n, MAX)`
 *     clamps to MAX. `3 > 3` is false forever. Fix uses raw questionNumber.
 *
 * These tests mirror the production logic (inlined here so we don't import
 * the full route module with its LLM/Supabase deps) and exhaustively cover
 * the completion boundary across the expected question range.
 */
import { describe, it, expect } from 'vitest';

// Constants mirrored from api/routes/onboarding-calibration.js — update both if either changes.
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 3;

/**
 * Reproduction of the completion check from api/routes/onboarding-calibration.js.
 * If the production code diverges from this, either the fix regressed or
 * the constants changed intentionally. In the latter case, update both.
 */
function shouldCompleteInterview(questionNumber, domainProgress) {
  const domainsWithCoverage = Object.values(domainProgress || {}).filter(
    (d) => d.asked >= 1,
  ).length;
  return (
    questionNumber > MAX_QUESTIONS ||
    (questionNumber > MIN_QUESTIONS && domainsWithCoverage >= 2)
  );
}

describe('onboarding completion boundary', () => {
  it('does NOT complete when client requests Q1 (fresh start)', () => {
    expect(shouldCompleteInterview(1, {})).toBe(false);
  });

  it('does NOT complete when client requests Q2 (after Q1 answered)', () => {
    expect(shouldCompleteInterview(2, { motivation: { asked: 1 } })).toBe(false);
  });

  it('does NOT complete when client requests Q3 — REGRESSION for bug #1', () => {
    // Before 9838747c: `currentQ >= MAX_QUESTIONS` made this true, so Q3
    // was never generated. Users saw only 2 questions. This assertion
    // locks that fix.
    const domainProgress = {
      motivation: { asked: 1 },
      personality: { asked: 1 },
    };
    expect(shouldCompleteInterview(3, domainProgress)).toBe(false);
  });

  it('DOES complete when client requests Q4 — REGRESSION for bug #2', () => {
    // After Q3 answered, client sends questionNumber=4 to get the next
    // question. Backend must return done:true at this point, not keep
    // generating phantom Q4+ questions. Before 5a3aa5ba, Math.min clamped
    // to 3 and this was stuck false.
    const domainProgress = {
      motivation: { asked: 1 },
      personality: { asked: 1 },
      social: { asked: 1 },
    };
    expect(shouldCompleteInterview(4, domainProgress)).toBe(true);
  });

  it('completes at Q4 even with empty domainProgress (MAX-boundary rule)', () => {
    // The `questionNumber > MAX_QUESTIONS` branch should fire on its own,
    // independent of domain coverage. Defensive — catches the case where
    // a client sends inconsistent state.
    expect(shouldCompleteInterview(4, {})).toBe(true);
  });

  it('handles clamped + huge question numbers gracefully', () => {
    // Paranoid clients sending 999 should still complete, not loop.
    expect(shouldCompleteInterview(999, {})).toBe(true);
  });

  it('ignores domains with 0 asks in the coverage count', () => {
    // A domain present but never asked should not count toward the
    // domainsWithCoverage >= 2 early-complete branch.
    expect(
      shouldCompleteInterview(4, {
        motivation: { asked: 0 },
        personality: { asked: 0 },
        social: { asked: 0 },
      }),
    ).toBe(true); // MAX boundary still applies
    expect(
      shouldCompleteInterview(3, {
        motivation: { asked: 0 },
        personality: { asked: 0 },
      }),
    ).toBe(false); // under MAX + not enough coverage
  });
});

/**
 * Static assertions against the production source: catch the case where
 * someone reverts the fix or changes constants without updating these tests.
 * The inlined function above tests the LOGIC shape; these anchors bind the
 * test to the actual route file so regressions in production code break CI.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('production source anchors', () => {
  const ROUTE_SRC = readFileSync(
    resolve(process.cwd(), 'api/routes/onboarding-calibration.js'),
    'utf8',
  );

  it('MIN_QUESTIONS and MAX_QUESTIONS match the route file', () => {
    const minMatch = ROUTE_SRC.match(/const\s+MIN_QUESTIONS\s*=\s*(\d+)/);
    const maxMatch = ROUTE_SRC.match(/const\s+MAX_QUESTIONS\s*=\s*(\d+)/);
    expect(minMatch, 'MIN_QUESTIONS not found in route').toBeTruthy();
    expect(maxMatch, 'MAX_QUESTIONS not found in route').toBeTruthy();
    expect(Number(minMatch[1])).toBe(MIN_QUESTIONS);
    expect(Number(maxMatch[1])).toBe(MAX_QUESTIONS);
  });

  it('completion check uses `questionNumber > MAX_QUESTIONS` (regression guard for bugs #1 + #2)', () => {
    // Bug #1 (9838747c): `currentQ >= MAX_QUESTIONS` cut off Q3
    // Bug #2 (5a3aa5ba): `currentQ > MAX_QUESTIONS` stayed false because currentQ was clamped
    // Correct form uses raw `questionNumber` with strict `>`
    expect(ROUTE_SRC).toMatch(/questionNumber\s*>\s*MAX_QUESTIONS/);
    expect(ROUTE_SRC).not.toMatch(/questionNumber\s*>=\s*MAX_QUESTIONS/);
    expect(ROUTE_SRC).not.toMatch(/currentQ\s*>=?\s*MAX_QUESTIONS/);
  });

  it('early-complete branch also uses questionNumber (not currentQ)', () => {
    expect(ROUTE_SRC).toMatch(/questionNumber\s*>\s*MIN_QUESTIONS\s*&&\s*domainsWithCoverage/);
  });
});
