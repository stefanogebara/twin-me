/**
 * Tests for isNonSubscriptionRow — the read-time defensive filter that
 * keeps the recurring-subscriptions endpoint from surfacing garbage
 * even when the DB still has stale is_recurring=true flags from before
 * the merchant blocklist was added.
 *
 * Audit context (2026-05-21): prod /recurring-subscriptions returned
 *   "$1,690/month across 8 subscriptions, 3 signed up on stressed days"
 * but 6 of 8 entries were not subscriptions:
 *   - Plaid sandbox merchants: KFC $500/mo, Tectra Inc $500/mo,
 *     Madison Bicycle Shop $500/mo, Fun $89.4/mo
 *   - Non-subs: McDonald's $12/mo, Starbucks $4.33/mo, Uber $5.86/mo
 * The detector's merchant blocklist already covered all of these as of
 * the parallel session before this audit. Problem was: the detector
 * runs at INGEST time. Old rows kept their flags. The endpoint reads
 * is_recurring=true, sees stale flags, surfaces garbage.
 *
 * Fix: a defensive read-time re-filter. Tests pin the contract:
 *   1. Every Plaid sandbox merchant returns true (filter)
 *   2. Every fast-food / ride-share chain returns true (filter)
 *   3. Real subscriptions (Netflix, Spotify, Equinox) return false
 *   4. Category-based filter catches investment_*, transfer, payroll
 */
import { describe, it, expect } from 'vitest';
import { isNonSubscriptionRow } from '../../../../api/services/transactions/recurrenceDetector.js';

describe('isNonSubscriptionRow — defensive read-time filter', () => {
  describe('Plaid sandbox merchants (audit-listed culprits)', () => {
    it.each([
      ['KFC',                                'KFC' ],
      ['Kfc',                                'Kfc' ],
      ['Tectra Inc',                         'Tectra' ],
      ['Madison Bicycle Shop',               'Madison Bicycle Shop' ],
      ['Fun',                                'Fun' ],
    ])('rejects %s (merchant: %s)', (_label, merchant) => {
      expect(isNonSubscriptionRow({ merchant_normalized: merchant })).toBe(true);
    });
  });

  describe('Non-subscription chains (audit-listed culprits)', () => {
    it.each([
      ['McDonald\'s', "Mcdonald's"],
      ['Starbucks',   'Starbucks'],
      ['Uber',        'Uber'],
      ['Lyft',        'Lyft'],
      ['Chipotle',    'Chipotle'],
      ['Subway',      'Subway'],
      ['DoorDash',    'DoorDash'],
      ['Domino\'s',   "Domino's Pizza"],
    ])('rejects %s (merchant: %s)', (_label, merchant) => {
      expect(isNonSubscriptionRow({ merchant_normalized: merchant })).toBe(true);
    });
  });

  describe('Money movement (catches Plaid sandbox transfer/payroll rows)', () => {
    it.each([
      ['ACH transfer',           'ACH Electronic Creditgusto Pay'],
      ['Treasury bill purchase', 'United States Treas Bills 0.000% Tbil'],
      ['CD Deposit',             'CD Deposit Initial'],
      ['Wire payment',           'Wire Transfer Outgoing'],
      ['Credit Card autopay',    'Automatic Payment - Thank You'],
      ['Credit Card NNNN form',  'Credit Card 3333 Payment'],
      ['Direct deposit',         'Direct Deposit ACME Payroll'],
      ['Payroll',                'ACME Payroll'],
      ['Interest paid',          'Interest Paid Account 1234'],
    ])('rejects %s (raw: %s)', (_label, raw) => {
      expect(isNonSubscriptionRow({ merchant_normalized: raw })).toBe(true);
    });
  });

  describe('Real subscriptions pass through', () => {
    it.each([
      'Netflix',
      'Spotify',
      'Hulu',
      'Equinox',
      'Touchstone Climbing',
      'GitHub Copilot',
      'OpenAI',
      'Apple Music',
      'Patreon',
    ])('accepts %s', (merchant) => {
      expect(isNonSubscriptionRow({ merchant_normalized: merchant })).toBe(false);
    });
  });

  describe('Category-prefix blocklist', () => {
    it('rejects investment_buy / investment_sell categories regardless of merchant', () => {
      expect(isNonSubscriptionRow({ merchant_normalized: 'Vanguard', category: 'investment_buy_purchased' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: 'Fidelity', category: 'investment_sell' })).toBe(true);
    });

    it('rejects transfer / payroll / interest / dividend categories', () => {
      expect(isNonSubscriptionRow({ merchant_normalized: 'X', category: 'transfer' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: 'X', category: 'payroll' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: 'X', category: 'interest' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: 'X', category: 'dividend' })).toBe(true);
    });

    it('rejects loan_payment + credit_card_payment categories', () => {
      expect(isNonSubscriptionRow({ merchant_normalized: 'Chase', category: 'loan_payment' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: 'Amex', category: 'credit_card_payment' })).toBe(true);
    });

    it('is case-insensitive on category', () => {
      expect(isNonSubscriptionRow({ merchant_normalized: 'X', category: 'INVESTMENT_BUY' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: 'X', category: 'Transfer' })).toBe(true);
    });
  });

  describe('Defensive edge cases', () => {
    it('treats null/undefined merchant as excluded (no data, no surface)', () => {
      expect(isNonSubscriptionRow({ merchant_normalized: null })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_normalized: undefined })).toBe(true);
      expect(isNonSubscriptionRow({})).toBe(true);
    });

    it('falls back to merchant_raw when merchant_normalized is missing', () => {
      expect(isNonSubscriptionRow({ merchant_raw: 'KFC' })).toBe(true);
      expect(isNonSubscriptionRow({ merchant_raw: 'Netflix' })).toBe(false);
    });

    it('does not crash on a null row', () => {
      expect(() => isNonSubscriptionRow(null)).not.toThrow();
      expect(isNonSubscriptionRow(null)).toBe(true);
    });
  });

  describe('Audit input → output', () => {
    it('the exact prod row set (8 entries) collapses to the 2 real subs', () => {
      // Mirror of the actual rows returned by /recurring-subscriptions on
      // 2026-05-21 — paste the input shape and assert what survives.
      const prodRows = [
        { merchant_normalized: 'Tectra Inc',           category: null },
        { merchant_normalized: 'Kfc',                  category: 'food' },
        { merchant_normalized: 'Madison Bicycle Shop', category: null },
        { merchant_normalized: 'Fun',                  category: null },
        { merchant_normalized: 'Touchstone Climbing',  category: 'fitness' },
        { merchant_normalized: "Mcdonald's",           category: 'food' },
        { merchant_normalized: 'Uber',                 category: 'transport' },
        { merchant_normalized: 'Starbucks',            category: 'food' },
      ];
      const survivors = prodRows.filter((r) => !isNonSubscriptionRow(r));
      // Only Touchstone Climbing is a real recurring subscription here.
      // The other 7 are sandbox merchants or one-off / ride-hail chains.
      expect(survivors.map((r) => r.merchant_normalized)).toEqual(['Touchstone Climbing']);
    });
  });
});
