/**
 * ledger: sightings reconcile into transactions; the phone keeps the minute, the bank keeps the amount.
 */
import { describe, it, expect } from 'vitest';
import { reconcile, findMatch, clusterEpisodes, signedAmount } from '../../../../api/services/money/ledger.js';

const phone = { id: 's1', source: 'phone', amount: 12.5, direction: 'out', merchant_key: 'mercadona', merchant_raw: 'MERCADONA', occurred_at: '2026-09-07T19:41:00Z', channel: 'card', card_last4: '1234' };
const feed = { id: 's2', source: 'bankfeed', amount: 12.5, direction: 'out', merchant_key: 'mercadona madrid', merchant_raw: 'MERCADONA MADRID', occurred_at: '2026-09-08T12:00:00Z' };

describe('signedAmount', () => {
  it('out is negative, in is positive', () => {
    expect(signedAmount({ amount: 5, direction: 'out' })).toBe(-5);
    expect(signedAmount({ amount: 5, direction: 'in' })).toBe(5);
  });
});

describe('reconcile', () => {
  it('opens a transaction for a first sighting, the swipe as occurred_at', () => {
    const d = reconcile(phone, []);
    expect(d.action).toBe('create');
    expect(d.transaction).toMatchObject({ amount: -12.5, merchant_key: 'mercadona', occurred_at: phone.occurred_at, posted_at: null, card_last4: '1234' });
  });
  it('attaches the bank row to the phone transaction: amount from the bank, minute from the phone', () => {
    const tx = { id: 't1', amount: -12.5, merchant_key: 'mercadona', merchant_raw: 'MERCADONA', occurred_at: phone.occurred_at, posted_at: null, card_last4: '1234', primary_sighting_id: 's1' };
    const d = reconcile(feed, [tx], 'phone');
    expect(d.action).toBe('attach');
    expect(d.transaction.id).toBe('t1');
    expect(d.transaction.posted_at).toBe(feed.occurred_at);
    expect(d.transaction.merchant_raw).toBe('MERCADONA MADRID');
    expect(d.transaction.occurred_at).toBeUndefined(); // the phone's minute stands
  });
  it('a phone sighting arriving after the bank row moves occurred_at to the swipe', () => {
    const tx = { id: 't1', amount: -12.5, merchant_key: 'mercadona madrid', occurred_at: feed.occurred_at, posted_at: feed.occurred_at, primary_sighting_id: 's2' };
    const d = reconcile(phone, [tx], 'bankfeed');
    expect(d.action).toBe('attach');
    expect(d.transaction.occurred_at).toBe(phone.occurred_at);
    expect(d.transaction.amount).toBeUndefined(); // the bank's amount stands
  });
  it('does not match a different amount, a different sign, or a purchase two days away', () => {
    const base = { id: 't1', amount: -12.5, merchant_key: 'mercadona', occurred_at: phone.occurred_at };
    expect(findMatch({ ...phone, amount: 13.5 }, [base])).toBeNull();
    expect(findMatch({ ...phone, direction: 'in' }, [base])).toBeNull();
    expect(findMatch({ ...phone, occurred_at: '2026-09-10T19:41:00Z' }, [base])).toBeNull();
  });
  it('tolerates a one-percent rounding difference', () => {
    const base = { id: 't1', amount: -100, merchant_key: 'renfe', occurred_at: phone.occurred_at };
    expect(findMatch({ amount: 100.9, direction: 'out', merchant_key: 'renfe', occurred_at: phone.occurred_at }, [base])?.id).toBe('t1');
  });
});

describe('clusterEpisodes', () => {
  it('groups purchases within three hours, keeps inflows out, splits on a gap', () => {
    const txs = [
      { id: 'a', amount: -18, occurred_at: '2026-09-05T21:10:00Z' },
      { id: 'b', amount: -6.5, occurred_at: '2026-09-05T21:40:00Z' },
      { id: 'c', amount: -9, occurred_at: '2026-09-05T23:35:00Z' },
      { id: 'd', amount: 850, occurred_at: '2026-09-05T22:00:00Z' },
      { id: 'e', amount: -4, occurred_at: '2026-09-06T09:00:00Z' },
    ];
    const eps = clusterEpisodes(txs);
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ total: 33.5, transaction_count: 3, transaction_ids: ['a', 'b', 'c'] });
    expect(eps[1]).toMatchObject({ total: 4, transaction_count: 1 });
  });
});
