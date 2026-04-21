/**
 * Unit tests for the Phase 3.4 nudge filter logic.
 *
 * The real `maybeNudgeForTransactions` in transactionNudgeService.js talks to
 * Supabase + sendPushToUser. We test just the pure `shouldNudge()` decision
 * function here — inline copy to avoid module-load side effects.
 */
import { describe, it, expect } from 'vitest';

const STRESS_THRESHOLD = 0.6;
const MIN_AMOUNT_BRL = 100;
const MAX_TX_AGE_MS = 15 * 60 * 1000;
const DISCRETIONARY = new Set([
  'food_delivery', 'shopping', 'entertainment', 'ride_sharing', 'clothing',
]);

function shouldNudge(tx, now = Date.now()) {
  if (!tx) return false;
  if (tx.is_recurring) return false;
  if (!tx.category || !DISCRETIONARY.has(tx.category)) return false;
  const absAmount = Math.abs(Number(tx.amount) || 0);
  if (absAmount < MIN_AMOUNT_BRL) return false;
  const stress = tx.emotional_context?.computed_stress_score;
  if (stress === null || stress === undefined || stress < STRESS_THRESHOLD) return false;
  if (tx.transaction_date) {
    const age = now - new Date(tx.transaction_date).getTime();
    if (age > MAX_TX_AGE_MS) return false;
  }
  return true;
}

function makeTx(overrides = {}) {
  return {
    amount: -250,
    category: 'shopping',
    is_recurring: false,
    transaction_date: new Date().toISOString(),
    emotional_context: { computed_stress_score: 0.8 },
    ...overrides,
  };
}

describe('nudge filter — positive cases', () => {
  it('fires on high-stress shopping', () => {
    expect(shouldNudge(makeTx())).toBe(true);
  });
  it('fires on high-stress food delivery', () => {
    expect(shouldNudge(makeTx({ category: 'food_delivery' }))).toBe(true);
  });
  it('fires at exactly the stress threshold', () => {
    expect(shouldNudge(makeTx({ emotional_context: { computed_stress_score: 0.6 } }))).toBe(true);
  });
});

describe('nudge filter — negative cases', () => {
  it('skips recurring charges even on stress day', () => {
    expect(shouldNudge(makeTx({ is_recurring: true }))).toBe(false);
  });

  it('skips non-discretionary categories', () => {
    expect(shouldNudge(makeTx({ category: 'groceries' }))).toBe(false);
    expect(shouldNudge(makeTx({ category: 'transit' }))).toBe(false);
    expect(shouldNudge(makeTx({ category: null }))).toBe(false);
  });

  it('skips small amounts (< R$100)', () => {
    expect(shouldNudge(makeTx({ amount: -99 }))).toBe(false);
    expect(shouldNudge(makeTx({ amount: -10 }))).toBe(false);
  });

  it('skips low stress', () => {
    expect(shouldNudge(makeTx({ emotional_context: { computed_stress_score: 0.4 } }))).toBe(false);
    expect(shouldNudge(makeTx({ emotional_context: { computed_stress_score: 0 } }))).toBe(false);
  });

  it('skips when stress signal is missing', () => {
    expect(shouldNudge(makeTx({ emotional_context: null }))).toBe(false);
    expect(shouldNudge(makeTx({ emotional_context: {} }))).toBe(false);
  });

  it('skips stale transactions (> 15min old)', () => {
    const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(shouldNudge(makeTx({ transaction_date: stale }))).toBe(false);
  });

  it('skips null/undefined tx', () => {
    expect(shouldNudge(null)).toBe(false);
    expect(shouldNudge(undefined)).toBe(false);
  });

  it('handles income rows (positive amount, CREDIT-side) — still needs discretionary spend shape', () => {
    // Positive amount = income; we don't nudge on income arrivals.
    // The filter uses Math.abs so a +250 would pass the amount check — but
    // production callers only pass this function tx with amount < 0 via the
    // upstream SELECT. We document that expectation by testing the function
    // does NOT gate on sign itself.
    expect(shouldNudge(makeTx({ amount: 250 }))).toBe(true);
  });
});
