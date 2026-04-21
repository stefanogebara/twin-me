/**
 * Unit tests for the Pluggy transaction amount sign convention.
 * Regression guard: the production bug where upsert on partial unique index
 * silently dropped rows wasn't caught because nothing exercised the mapper.
 * These tests cover the semantic mapping — they don't hit Supabase.
 */
import { describe, it, expect } from 'vitest';

/**
 * Copy of the sign-convention logic from pluggyIngestion.js. We inline it here
 * (rather than export + import) because the real module has top-level
 * dependencies on supabase etc. that we don't want in the test harness.
 */
function signedAmount(pluggyTx) {
  const magnitude = Math.abs(Number(pluggyTx.amount) || 0);
  const type = String(pluggyTx.type || '').toUpperCase();
  if (type === 'DEBIT') return -magnitude;
  if (type === 'CREDIT') return magnitude;
  return Number(pluggyTx.amount) || 0;
}

describe('Pluggy signedAmount', () => {
  it('DEBIT returns negative regardless of incoming sign', () => {
    expect(signedAmount({ amount: 100, type: 'DEBIT' })).toBe(-100);
    expect(signedAmount({ amount: -100, type: 'DEBIT' })).toBe(-100);
    expect(signedAmount({ amount: '50.5', type: 'debit' })).toBe(-50.5);
  });

  it('CREDIT returns positive regardless of incoming sign', () => {
    expect(signedAmount({ amount: 100, type: 'CREDIT' })).toBe(100);
    expect(signedAmount({ amount: -100, type: 'CREDIT' })).toBe(100);
  });

  it('falls back to raw amount when type missing', () => {
    expect(signedAmount({ amount: -42 })).toBe(-42);
    expect(signedAmount({ amount: 42, type: '' })).toBe(42);
  });

  it('handles malformed input without throwing', () => {
    expect(signedAmount({})).toBe(0);
    expect(signedAmount({ amount: null })).toBe(0);
    expect(signedAmount({ amount: 'NaN' })).toBe(0);
  });
});
