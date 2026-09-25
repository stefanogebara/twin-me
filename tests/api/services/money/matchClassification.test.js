import { describe, expect, it } from 'vitest';
import { classifyMatch, findMatch, reconcile } from '../../../../api/_app/services/money/ledger.js';

const alert = {
  id: 'email-1', source: 'email', amount: 10, direction: 'out', currency: 'EUR',
  merchant_key: 'unknown', occurred_at: '2026-09-23T12:00:00Z',
};
const coffee = {
  id: 'a', account_id: 'account-a', amount: -10, currency: 'EUR', merchant_key: 'coffee',
  occurred_at: '2026-09-21T12:00:00Z',
};
const taxi = {
  ...coffee, id: 'b', account_id: 'account-b', merchant_key: 'taxi',
  occurred_at: '2026-09-22T12:00:00Z',
};

describe('explicit payment match classification', () => {
  it('distinguishes no candidate from a unique weak candidate', () => {
    expect(classifyMatch(alert, [])).toEqual({ kind: 'none', match: null, candidateIds: [] });
    expect(classifyMatch(alert, [coffee])).toEqual({ kind: 'unique_weak', match: coffee, candidateIds: ['a'] });
  });

  it('reports cross-account ambiguity without recommending the nearest payment', () => {
    const expected = { kind: 'ambiguous_weak', match: null, candidateIds: ['a', 'b'] };
    expect(classifyMatch(alert, [coffee, taxi])).toEqual(expected);
    expect(classifyMatch(alert, [taxi, coffee])).toEqual(expected);
  });

  it('also reports ambiguity between payments on the same account', () => {
    expect(classifyMatch({ ...alert, account_id: 'account-a' }, [coffee, { ...taxi, account_id: 'account-a' }]))
      .toEqual({ kind: 'ambiguous_weak', match: null, candidateIds: ['a', 'b'] });
  });

  it('recognizes the symmetric ambiguity when the named sighting meets two unnamed lines', () => {
    const rows = [coffee, taxi].map((t) => ({ ...t, merchant_key: 'unknown' }));
    expect(classifyMatch({ ...alert, merchant_key: 'coffee' }, rows))
      .toEqual({ kind: 'ambiguous_weak', match: null, candidateIds: ['a', 'b'] });
  });

  it('does not treat two unnamed merchants as evidence of a match', () => {
    expect(classifyMatch(alert, [{ ...coffee, merchant_key: 'unknown' }]).kind).toBe('none');
    expect(classifyMatch({ ...alert, merchant_key: null }, [{ ...coffee, merchant_key: '' }]).kind).toBe('none');
  });

  it.each([
    ['currency', {}, { currency: 'USD' }],
    ['direction', {}, { amount: 10 }],
    ['amount', {}, { amount: -11 }],
    ['four-day window', {}, { occurred_at: '2026-09-18T12:00:00Z' }],
    ['account conflict', { account_id: 'account-a' }, {}],
    ['card conflict', { card_last4: '1234' }, { card_last4: '9999' }],
  ])('applies the existing %s filter before classifying ambiguity', (_label, sighting, candidate) => {
    expect(classifyMatch({ ...alert, ...sighting }, [coffee, { ...taxi, ...candidate }]))
      .toEqual({ kind: 'unique_weak', match: coffee, candidateIds: ['a'] });
  });

  it('applies same-source exclusions before classifying and does not modify the inputs', () => {
    const rows = Object.freeze([Object.freeze({ ...coffee }), Object.freeze({ ...taxi })]);
    const exclude = new Set(['b']);
    expect(classifyMatch(Object.freeze({ ...alert }), rows, { exclude }))
      .toEqual({ kind: 'unique_weak', match: rows[0], candidateIds: ['a'] });
    expect([...exclude]).toEqual(['b']);
  });

  it('preserves inclusive date/amount boundaries and default currency behavior', () => {
    const row = { ...coffee, amount: -100, currency: undefined, occurred_at: '2026-09-19T12:00:00Z' };
    expect(classifyMatch({ ...alert, amount: 100.9, currency: undefined }, [row]).kind).toBe('unique_weak');
  });

  it('prefers named matches over nearer weak matches and retains named-nearest selection', () => {
    const namedFar = { ...coffee, merchant_key: 'coffee madrid' };
    const namedNear = { ...coffee, id: 'c', occurred_at: taxi.occurred_at };
    const weak = { ...taxi, merchant_key: 'unknown', occurred_at: alert.occurred_at };
    const sighting = { ...alert, merchant_key: 'coffee' };
    for (const rows of [[weak, namedFar, namedNear], [namedNear, namedFar, weak]]) {
      expect(classifyMatch(sighting, rows)).toEqual({ kind: 'named', match: namedNear, candidateIds: ['a', 'c'] });
      expect(findMatch(sighting, rows)).toBe(namedNear);
    }
  });

  it('preserves the existing first-in-pool tie behavior for equal-distance named matches', () => {
    const other = { ...coffee, id: 'c' };
    const sighting = { ...alert, merchant_key: 'coffee' };
    expect(classifyMatch(sighting, [coffee, other]).match).toBe(coffee);
    expect(classifyMatch(sighting, [other, coffee]).match).toBe(other);
  });

  it('rejects unrelated named merchants instead of calling them weak evidence', () => {
    expect(classifyMatch({ ...alert, merchant_key: 'groceries' }, [coffee, taxi]))
      .toEqual({ kind: 'none', match: null, candidateIds: [] });
  });
});

describe('runtime deferral with legacy matching wrapper compatibility', () => {
  it('defers the F03 ambiguous alert while preserving the legacy wrapper', () => {
    expect(classifyMatch(alert, [coffee, taxi]).kind).toBe('ambiguous_weak');
    // External legacy matcher stays compatible; the ingestion decision defers ambiguity.
    expect(findMatch(alert, [coffee, taxi])).toBe(taxi);
    expect(reconcile(alert, [coffee, taxi])).toMatchObject({ action: 'deferred', transaction: null });
  });

  it('keeps a provider identity authoritative even when fuzzy matching is ambiguous or excluded', () => {
    expect(reconcile(alert, [coffee, taxi], null, { existing: coffee, exclude: new Set(['a']) }))
      .toMatchObject({ action: 'attach', transaction: { id: 'a' } });
    expect(reconcile({ ...alert, amount: 99 }, [coffee, taxi], null, { existing: coffee }))
      .toMatchObject({ action: 'attach', transaction: { id: 'a' } });
  });
});
