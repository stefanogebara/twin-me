/**
 * Unit tests for canStartNextUser — the adaptive time-budget guard of the
 * observation-ingestion user loop (audit-2026-07-02 M3).
 *
 * The old guard (`elapsed > GLOBAL_TIMEOUT_MS`) was reactive: it only fired
 * AFTER the 40s budget was spent, so a user could START at 39s and run
 * ~15-20s past the budget toward Vercel's 60s kill. The new guard is
 * predictive: before starting a user it reserves the worst per-user cost
 * observed this run (or a 20s estimate before any user has completed) and
 * refuses to start a user that would not fit inside the budget.
 *
 * The guard is a pure function in observationUtils.js precisely so it can be
 * tested without importing the full ingestion module graph (18 fetchers,
 * reflection engine, goal tracking, ...) — same reasoning as
 * observationIngestionParallel.test.js.
 */
import { describe, it, expect } from 'vitest';
import { canStartNextUser, ESTIMATED_USER_COST_MS } from '../../../api/services/observationUtils.js';

const BUDGET_MS = 40_000; // mirrors GLOBAL_TIMEOUT_MS in observationIngestion.js

describe('canStartNextUser (adaptive ingestion time-budget guard)', () => {
  it('always allows the first user at the start of a run', () => {
    expect(canStartNextUser({ elapsedMs: 0, budgetMs: BUDGET_MS })).toBe(true);
  });

  it('reserves the default estimate before any user has completed', () => {
    // 20s elapsed + 20s estimate = 40s = budget → still fits (<=).
    expect(canStartNextUser({ elapsedMs: BUDGET_MS - ESTIMATED_USER_COST_MS, budgetMs: BUDGET_MS })).toBe(true);
    // 21s elapsed + 20s estimate = 41s > 40s → refuse. The OLD reactive guard
    // would have started this user (elapsed < budget) and overrun.
    expect(canStartNextUser({ elapsedMs: BUDGET_MS - ESTIMATED_USER_COST_MS + 1_000, budgetMs: BUDGET_MS })).toBe(false);
  });

  it('uses the observed worst-case user cost when it exceeds the estimate', () => {
    // Worst observed user this run: 25s (> 20s estimate) → reserve is 25s.
    // elapsed 12s + 25s = 37s <= 40s → fits.
    expect(canStartNextUser({ elapsedMs: 12_000, budgetMs: BUDGET_MS, worstUserMs: 25_000 })).toBe(true);
    // elapsed 16s + 25s = 41s > 40s → refuse.
    expect(canStartNextUser({ elapsedMs: 16_000, budgetMs: BUDGET_MS, worstUserMs: 25_000 })).toBe(false);
  });

  it('keeps the default estimate as a floor when observed users were faster', () => {
    // Users completing in 3s must not shrink the reserve below the estimate:
    // a future user can still hit the 15s platform timeout + processing.
    expect(canStartNextUser({ elapsedMs: 25_000, budgetMs: BUDGET_MS, worstUserMs: 3_000 })).toBe(false);
    expect(canStartNextUser({ elapsedMs: 19_000, budgetMs: BUDGET_MS, worstUserMs: 3_000 })).toBe(true);
  });

  it('stops a slow run after the first user (regression: overrun pattern)', () => {
    // Cron data (audit-2026-05-09 B-M1) showed a single slow user blowing the
    // budget by 6.5s because the next user started at ~39s. Simulate: first
    // user took 25s → guard must refuse user 2 at elapsed 25s.
    expect(canStartNextUser({ elapsedMs: 25_000, budgetMs: BUDGET_MS, worstUserMs: 25_000 })).toBe(false);
  });

  it('lets a fast run walk through the full user ceiling', () => {
    // Three fast users (5s each): every start decision fits well inside 40s.
    let elapsed = 0;
    let worst = 0;
    const started = [];
    for (let user = 0; user < 3; user++) {
      if (!canStartNextUser({ elapsedMs: elapsed, budgetMs: BUDGET_MS, worstUserMs: worst })) break;
      started.push(user);
      elapsed += 5_000;
      worst = Math.max(worst, 5_000);
    }
    expect(started).toEqual([0, 1, 2]);
  });
});
