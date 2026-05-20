/**
 * Tests for plaidMappers — the pure shape-conversion layer between
 * Plaid's wire format and our DB conventions.
 *
 * Bug-classes these tests prevent:
 *
 *   - Sign convention regressions. Plaid sends positive=debit; we store
 *     positive=inflow. A future "we should match Plaid's sign" PR would
 *     silently invert every outflow in our analytics. signedAmount tests
 *     pin the flip explicitly.
 *
 *   - Account-type miscategorization. Plaid's "credit card" arrives as
 *     type='credit' + subtype='credit card', sometimes type='credit'
 *     alone. A bug in 2026-04 stored credit card spend as checking,
 *     making the stress-shop detector count credit purchases as 0% of
 *     "real" outflow. mapAccountType pins every documented path.
 *
 *   - Investment category-string drift. The pattern detector in
 *     investmentCorrelationInsights.js filters by category prefix
 *     ("investment_buy_*", "investment_sell_*"). A typo in mapInvestment
 *     Type would make those filters silently miss every trade.
 *
 *   - Merchant fallback chain. Plaid sometimes sends `merchant_name`,
 *     sometimes only `name`, occasionally just `original_description`.
 *     Dropping the fallback chain would label thousands of rows as
 *     'unknown'.
 */
import { describe, it, expect } from 'vitest';
import {
  signedAmount,
  mapMerchant,
  mapAccountType,
  mapInvestmentType,
} from '../../../../api/services/transactions/plaidMappers.js';

describe('signedAmount — Plaid debit-positive → our inflow-positive', () => {
  it('flips a positive Plaid amount (purchase) into a negative outflow', () => {
    expect(signedAmount({ amount: 42.31 })).toBe(-42.31);
  });

  it('flips a negative Plaid amount (refund) into a positive inflow', () => {
    expect(signedAmount({ amount: -100 })).toBe(100);
  });

  it('preserves zero', () => {
    expect(signedAmount({ amount: 0 })).toBe(0);
  });

  it('coerces a numeric string to a number then flips', () => {
    // Plaid SDKs occasionally send amounts as strings on certain JSON paths.
    expect(signedAmount({ amount: '15.50' })).toBe(-15.5);
  });

  it.each([
    [undefined, 'undefined plaidTx'],
    [null, 'null plaidTx'],
    [{}, 'missing amount'],
    [{ amount: null }, 'null amount'],
    [{ amount: 'NaN' }, 'string NaN'],
    [{ amount: 'free' }, 'unparseable string'],
    [{ amount: Number.POSITIVE_INFINITY }, 'infinity'],
    [{ amount: Number.NEGATIVE_INFINITY }, 'negative infinity'],
  ])('returns 0 for %s (%s) — never NaN/Infinity into the DB', (input) => {
    const r = signedAmount(input);
    expect(r).toBe(0);
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('mapMerchant — fallback chain + normalization', () => {
  it('prefers merchant_name when present', () => {
    const r = mapMerchant({
      merchant_name: 'Starbucks',
      name: 'STARBUCKS #1234 NEW YORK NY',
      original_description: 'POS PURCHASE STARBUCKS',
    });
    expect(r.merchantRaw).toBe('Starbucks');
  });

  it('falls back to `name` when merchant_name is missing', () => {
    const r = mapMerchant({ name: 'AMAZON.COM SEATTLE WA' });
    expect(r.merchantRaw).toBe('AMAZON.COM SEATTLE WA');
  });

  it('falls back to `original_description` when both merchant_name and name are missing', () => {
    const r = mapMerchant({ original_description: 'POS XYZ 42 NEW YORK' });
    expect(r.merchantRaw).toBe('POS XYZ 42 NEW YORK');
  });

  it('uses "unknown" as the last-resort fallback (never undefined into the DB)', () => {
    const r = mapMerchant({});
    expect(r.merchantRaw).toBe('unknown');
  });

  it('handles null/undefined plaidTx without throwing', () => {
    expect(() => mapMerchant(null)).not.toThrow();
    expect(() => mapMerchant(undefined)).not.toThrow();
    expect(mapMerchant(null).merchantRaw).toBe('unknown');
  });

  it('rejects empty-string merchant_name (treat as missing, fall through)', () => {
    // '' is falsy in JS, so the || chain skips it. This is intentional —
    // Plaid sometimes returns empty strings instead of null.
    const r = mapMerchant({ merchant_name: '', name: 'real name', original_description: '' });
    expect(r.merchantRaw).toBe('real name');
  });

  it('returns brand and category from normalizeMerchant (round-trip smoke)', () => {
    const r = mapMerchant({ merchant_name: 'unknown' });
    // We don't assert the specific brand/category values — that's
    // normalizeMerchant's contract. We just confirm the keys are present
    // so a future refactor that drops them gets caught.
    expect(r).toHaveProperty('brand');
    expect(r).toHaveProperty('category');
  });
});

describe('mapAccountType — Plaid (type, subtype) → our enum', () => {
  it('credit type → credit_card (the standard Plaid credit card shape)', () => {
    expect(mapAccountType({ type: 'credit', subtype: 'credit card' })).toBe('credit_card');
    expect(mapAccountType({ type: 'credit' })).toBe('credit_card');
  });

  it('subtype "credit card" alone → credit_card (catches the rare type-missing case)', () => {
    expect(mapAccountType({ type: 'other', subtype: 'credit card' })).toBe('credit_card');
  });

  it('subtype savings → savings', () => {
    expect(mapAccountType({ type: 'depository', subtype: 'savings' })).toBe('savings');
  });

  it('subtype checking → checking', () => {
    expect(mapAccountType({ type: 'depository', subtype: 'checking' })).toBe('checking');
  });

  it('investment type → investment', () => {
    expect(mapAccountType({ type: 'investment', subtype: 'brokerage' })).toBe('investment');
  });

  it('brokerage type → investment (alias path)', () => {
    expect(mapAccountType({ type: 'brokerage' })).toBe('investment');
  });

  it('unknown shapes default to checking (no row-drop on schema drift)', () => {
    expect(mapAccountType({ type: 'mystery' })).toBe('checking');
    expect(mapAccountType({})).toBe('checking');
    expect(mapAccountType(null)).toBe('checking');
  });

  it('is case-insensitive on type and subtype (Plaid has shipped mixed casing before)', () => {
    expect(mapAccountType({ type: 'CREDIT', subtype: 'Credit Card' })).toBe('credit_card');
    expect(mapAccountType({ type: 'Investment' })).toBe('investment');
    expect(mapAccountType({ type: 'depository', subtype: 'SAVINGS' })).toBe('savings');
  });

  it('credit precedence is higher than subtype mismatch', () => {
    // Edge case: type='credit' with a subtype that doesn't say "credit card"
    // (Plaid has sent 'credit' + 'rewards' before). We treat the type as
    // authoritative and still map to credit_card.
    expect(mapAccountType({ type: 'credit', subtype: 'rewards' })).toBe('credit_card');
  });
});

describe('mapInvestmentType — Plaid trade type → our category string', () => {
  it('combines type + subtype with the investment_ prefix', () => {
    expect(mapInvestmentType('buy', 'purchased')).toBe('investment_buy_purchased');
    expect(mapInvestmentType('sell', 'sold')).toBe('investment_sell_sold');
  });

  it('omits the subtype suffix when subtype is missing', () => {
    expect(mapInvestmentType('buy')).toBe('investment_buy');
    expect(mapInvestmentType('buy', null)).toBe('investment_buy');
    expect(mapInvestmentType('buy', '')).toBe('investment_buy');
    expect(mapInvestmentType('buy', undefined)).toBe('investment_buy');
  });

  it('defaults the type segment to "unknown" when type is missing', () => {
    expect(mapInvestmentType(undefined, 'purchased')).toBe('investment_unknown_purchased');
    expect(mapInvestmentType(null)).toBe('investment_unknown');
    expect(mapInvestmentType('')).toBe('investment_unknown');
  });

  it('lower-cases both segments (filter regex assumes lowercase)', () => {
    expect(mapInvestmentType('BUY', 'PURCHASED')).toBe('investment_buy_purchased');
    expect(mapInvestmentType('Sell', 'Sold')).toBe('investment_sell_sold');
  });

  it('always begins with the "investment_" prefix (filter relies on it)', () => {
    // The investment-correlation pattern detector filters by
    // `category LIKE 'investment_%'`. Any future refactor that drops
    // the prefix silently breaks the detector.
    expect(mapInvestmentType('buy')).toMatch(/^investment_/);
    expect(mapInvestmentType()).toMatch(/^investment_/);
    expect(mapInvestmentType(123, 456)).toMatch(/^investment_/);
  });
});
