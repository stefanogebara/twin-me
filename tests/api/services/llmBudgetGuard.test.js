/**
 * llmBudgetGuard — Redis-independent backstops against runaway LLM spend.
 *
 * Two layers beyond the existing soft daily budget (which only downgrades):
 *   1. per-instance call ceiling — bounds a single runaway lambda even when
 *      Redis is down AND the 60s daily-cost cache is stale.
 *   2. daily HARD kill-switch — an absolute spend ceiling at which calls are
 *      refused outright (the soft cap keeps downgrading below it).
 * Pure/stateful helpers, no DB — trivially unit-testable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordLlmCall, getInstanceCalls, __resetInstanceCalls,
  instanceCeilingExceeded, perInstanceMaxCalls,
  dailyHardLimitUsd, dailyHardLimitExceeded,
} from '../../../api/services/llmBudgetGuard.js';

beforeEach(() => {
  __resetInstanceCalls();
  delete process.env.LLM_PER_INSTANCE_MAX_CALLS;
  delete process.env.LLM_DAILY_HARD_LIMIT_USD;
  delete process.env.LLM_DAILY_BUDGET_USD;
});

describe('per-instance call ceiling', () => {
  it('counts calls and exposes the running total', () => {
    expect(getInstanceCalls()).toBe(0);
    recordLlmCall();
    recordLlmCall();
    expect(getInstanceCalls()).toBe(2);
  });

  it('is not exceeded below the cap and is exceeded at/above it', () => {
    process.env.LLM_PER_INSTANCE_MAX_CALLS = '3';
    expect(perInstanceMaxCalls()).toBe(3);
    recordLlmCall();
    recordLlmCall();
    expect(instanceCeilingExceeded()).toBe(false); // 2 < 3
    recordLlmCall();
    expect(instanceCeilingExceeded()).toBe(true); // 3 >= 3
  });

  it('resets (cold-start semantics / test isolation)', () => {
    recordLlmCall();
    __resetInstanceCalls();
    expect(getInstanceCalls()).toBe(0);
  });

  it('defaults the cap to 5000 when unset', () => {
    expect(perInstanceMaxCalls()).toBe(5000);
  });
});

describe('daily hard kill-switch', () => {
  it('uses an explicit LLM_DAILY_HARD_LIMIT_USD when set', () => {
    process.env.LLM_DAILY_HARD_LIMIT_USD = '50';
    expect(dailyHardLimitUsd()).toBe(50);
  });

  it('defaults to max(3x soft budget, 30)', () => {
    expect(dailyHardLimitUsd()).toBe(30); // soft default 10 -> 3x = 30
    process.env.LLM_DAILY_BUDGET_USD = '20';
    expect(dailyHardLimitUsd()).toBe(60); // 3x = 60
    process.env.LLM_DAILY_BUDGET_USD = '5';
    expect(dailyHardLimitUsd()).toBe(30); // 3x = 15 -> floor at 30
  });

  it('ignores a non-positive or invalid explicit limit', () => {
    process.env.LLM_DAILY_HARD_LIMIT_USD = '0';
    expect(dailyHardLimitUsd()).toBe(30);
    process.env.LLM_DAILY_HARD_LIMIT_USD = 'abc';
    expect(dailyHardLimitUsd()).toBe(30);
  });

  it('flags spend at/above the hard limit only', () => {
    process.env.LLM_DAILY_HARD_LIMIT_USD = '40';
    expect(dailyHardLimitExceeded(39.99)).toBe(false);
    expect(dailyHardLimitExceeded(40)).toBe(true);
    expect(dailyHardLimitExceeded(100)).toBe(true);
  });
});
