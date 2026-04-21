/**
 * Unit tests for the TrueLayer transaction amount sign convention. TrueLayer
 * already returns negative for DEBIT / positive for CREDIT in the `amount`
 * field — our signedAmount() is defensive in case a provider (e.g. Revolut's
 * connector) ships absolute values with only `transaction_type` as the sign.
 */
import { describe, it, expect } from 'vitest';

function signedAmount(tx) {
  const abs = Math.abs(Number(tx.amount) || 0);
  const type = String(tx.transaction_type || '').toUpperCase();
  if (type === 'DEBIT') return -abs;
  if (type === 'CREDIT') return abs;
  return Number(tx.amount) || 0;
}

describe('TrueLayer signedAmount', () => {
  it('enforces negative for DEBIT even if provider ships positive', () => {
    expect(signedAmount({ amount: 25.5, transaction_type: 'DEBIT' })).toBe(-25.5);
    expect(signedAmount({ amount: -25.5, transaction_type: 'DEBIT' })).toBe(-25.5);
  });

  it('enforces positive for CREDIT', () => {
    expect(signedAmount({ amount: 500, transaction_type: 'CREDIT' })).toBe(500);
    expect(signedAmount({ amount: -500, transaction_type: 'CREDIT' })).toBe(500);
  });

  it('preserves signed amount when transaction_type missing', () => {
    expect(signedAmount({ amount: -17.2 })).toBe(-17.2);
  });

  it('handles malformed input safely', () => {
    expect(signedAmount({ amount: null, transaction_type: 'DEBIT' })).toBe(-0);
    expect(signedAmount({})).toBe(0);
  });
});
