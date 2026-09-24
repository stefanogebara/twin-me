/**
 * ledger: sightings reconcile into transactions; the phone keeps the minute, the bank keeps the amount.
 */
import { describe, it, expect } from 'vitest';
import { reconcile, findMatch, clusterEpisodes, signedAmount } from '../../../../api/_app/services/money/ledger.js';

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
    /* The key is what matching, the repeating charges and the categories read. Taking the
       bank's name without its key left the two saying different things for ever, so a name
       corrected at the source never reached the line already stored (2026-09-18). */
    expect(d.transaction.merchant_key).toBe('mercadona madrid');
    expect(d.transaction.occurred_at).toBeUndefined(); // the phone's minute stands
  });

  it('never lets a worse name take the key from a line that has one', () => {
    const tx = { id: 't1', amount: -12.5, merchant_key: 'mercadona madrid', merchant_raw: 'MERCADONA MADRID', occurred_at: feed.occurred_at, posted_at: feed.occurred_at, primary_sighting_id: 's2' };
    const d = reconcile({ ...phone, id: 's3' }, [tx], 'bankfeed');
    expect(d.action).toBe('attach');
    expect(d.transaction.merchant_key).toBeUndefined();
    expect(d.transaction.merchant_raw).toBeUndefined();
  });
  it('a phone sighting arriving after the bank row moves occurred_at to the swipe', () => {
    const tx = { id: 't1', amount: -12.5, merchant_key: 'mercadona madrid', occurred_at: feed.occurred_at, posted_at: feed.occurred_at, primary_sighting_id: 's2' };
    const d = reconcile(phone, [tx], 'bankfeed');
    expect(d.action).toBe('attach');
    expect(d.transaction.occurred_at).toBe(phone.occurred_at);
    expect(d.transaction.amount).toBeUndefined(); // the bank's amount stands
  });
  it('does not match a different amount, a different sign, or a purchase a week away', () => {
    const base = { id: 't1', amount: -12.5, merchant_key: 'mercadona', occurred_at: phone.occurred_at };
    expect(findMatch({ ...phone, amount: 13.5 }, [base])).toBeNull();
    expect(findMatch({ ...phone, direction: 'in' }, [base])).toBeNull();
    expect(findMatch({ ...phone, occurred_at: '2026-08-31T19:41:00Z' }, [base])).toBeNull();
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

/* A pending bank row is seen, not settled: it opens the line without a posting date, and
   the booked row that follows it, with the bank's own reference, settles the same line. */
describe('reconcile, pending then booked', () => {
  const pending = { source: 'bankfeed', amount: 19.99, direction: 'out', merchant_key: 'cabify', merchant_raw: 'Cabify', occurred_at: '2026-09-13T12:00:00Z', raw_json: { status: 'PDNG' } };
  const bookedRow = { source: 'bankfeed', amount: 19.99, direction: 'out', merchant_key: 'cabify', merchant_raw: 'Cabify', occurred_at: '2026-09-14T12:00:00Z', raw_json: { status: 'BOOK' } };
  it('opens the line without a posting date', () => {
    const d = reconcile(pending, []);
    expect(d.action).toBe('create');
    expect(d.transaction.posted_at).toBe(null);
    expect(d.transaction.amount).toBe(-19.99);
  });
  it('the booked row settles the pending line', () => {
    const line = { id: 't1', amount: -19.99, merchant_key: 'cabify', occurred_at: '2026-09-13T12:00:00Z', posted_at: null };
    const d = reconcile(bookedRow, [line], 'bankfeed');
    expect(d.action).toBe('attach');
    expect(d.transaction.id).toBe('t1');
    expect(d.transaction.posted_at).toBe('2026-09-14T12:00:00Z');
  });
  it('a pending row never gives a settled line a posting date of its own', () => {
    const line = { id: 't2', amount: -19.99, merchant_key: 'cabify', occurred_at: '2026-09-13T12:00:00Z', posted_at: null };
    const d = reconcile(pending, [line], 'phone');
    expect(d.transaction.posted_at).toBeUndefined();
  });
});

describe('a weekend between the alert and the booking', () => {
  it('still matches a Friday night alert to the row the bank books on Monday', () => {
    const alert = { amount: 9.9, direction: 'out', merchant_key: 'cabify', occurred_at: '2026-09-11T23:02:00.000Z' };
    const booked = [{ id: 't1', amount: -9.9, merchant_key: 'cabify', occurred_at: '2026-09-14T12:00:00.000Z' }];
    expect(findMatch(alert, booked)?.id).toBe('t1');
  });
  it('does not reach across a whole week', () => {
    const alert = { amount: 9.9, direction: 'out', merchant_key: 'cabify', occurred_at: '2026-09-04T23:02:00.000Z' };
    const booked = [{ id: 't1', amount: -9.9, merchant_key: 'cabify', occurred_at: '2026-09-14T12:00:00.000Z' }];
    expect(findMatch(alert, booked)).toBeNull();
  });
});

describe('one bank row is one payment', () => {
  const bank = { id: 's1', source: 'bankfeed', amount: 0.5, direction: 'out', merchant_key: 'sebastian', merchant_raw: 'Sebastian', occurred_at: '2026-09-14T12:00:00Z', channel: 'bizum' };
  const line = { id: 't1', amount: -0.5, merchant_key: 'sebastian', occurred_at: '2026-09-14T12:00:00Z', posted_at: null };
  it('does not fold a second bank sighting onto a line the bank already backs', () => {
    expect(findMatch(bank, [line], { exclude: new Set(['t1']) })).toBeNull();
    expect(reconcile(bank, [line], null, { exclude: new Set(['t1']) }).action).toBe('create');
    expect(reconcile(bank, [line], null).action).toBe('attach');
  });
  it('still lets a phone sighting attach to the bank line, and the bank line to a phone sighting', () => {
    const phone = { ...bank, id: 's2', source: 'phone' };
    expect(reconcile(phone, [line], 'bankfeed', { exclude: new Set() }).action).toBe('attach');
  });
});

/**
 * The bank's own alert mail says only "movimiento de -10,93 EUR en tu cuenta acabada en
 * 7516": an amount, no shop. It carried merchant_key 'unknown', findMatch refused every
 * candidate on that alone, and each alert opened a second line beside the bank row it was
 * announcing. Ten of them stood in the ledger on 2026-09-24, 80,99 EUR of spending and a
 * 500,00 EUR arrival that never happened twice, and the week's review read them as the
 * payments that weighed most. A nameless alert is not a second payment: it is the same
 * account saying the same figure again.
 */
describe('a bank alert with no shop in it', () => {
  const alert = { id: 'e1', source: 'email', amount: 10.93, direction: 'out', merchant_key: 'unknown', merchant_raw: null, occurred_at: '2026-09-21T16:54:46Z', parse_confidence: 0.6 };
  const cabify = { id: 't1', amount: -10.93, merchant_key: 'cabify', merchant_raw: 'Cabify', occurred_at: '2026-09-19T12:00:00Z', posted_at: '2026-09-19T12:00:00Z', primary_sighting_id: 's9' };

  it('attaches to the named line the bank already booked, rather than opening a second one', () => {
    const d = reconcile(alert, [cabify], 'bankfeed');
    expect(d.action).toBe('attach');
    expect(d.transaction.id).toBe('t1');
  });

  it('takes nothing from the line it joins: the bank keeps the name, the key and the amount', () => {
    const d = reconcile(alert, [cabify], 'bankfeed');
    expect(d.transaction.merchant_raw).toBeUndefined();
    expect(d.transaction.merchant_key).toBeUndefined();
    expect(d.transaction.amount).toBeUndefined();
    expect(d.transaction.primary_sighting_id).toBeUndefined();
  });

  it('is named by the bank row when the alert was seen first', () => {
    const nameless = { id: 't2', amount: -10.93, merchant_key: 'unknown', merchant_raw: null, occurred_at: alert.occurred_at, posted_at: null, primary_sighting_id: 'e1' };
    const feedRow = { id: 's9', source: 'bankfeed', amount: 10.93, direction: 'out', merchant_key: 'cabify', merchant_raw: 'Cabify', occurred_at: '2026-09-19T12:00:00Z' };
    const d = reconcile(feedRow, [nameless], 'email');
    expect(d.action).toBe('attach');
    expect(d.transaction.merchant_raw).toBe('Cabify');
    expect(d.transaction.merchant_key).toBe('cabify');
  });

  it('still opens a line when the bank has booked nothing of that figure', () => {
    expect(reconcile(alert, [{ ...cabify, amount: -4.55 }], 'bankfeed').action).toBe('create');
    expect(reconcile(alert, [], 'bankfeed').action).toBe('create');
  });

  it('never joins two nameless lines: two anonymous coffees are two coffees', () => {
    const otherAlert = { ...cabify, merchant_key: 'unknown', merchant_raw: null, primary_sighting_id: 'e0' };
    expect(findMatch(alert, [otherAlert])).toBeNull();
  });

  it('prefers a line that shares the shop over a nameless one of the same figure', () => {
    const named = { id: 't3', amount: -10.93, merchant_key: 'cabify', merchant_raw: 'Cabify', occurred_at: '2026-09-21T10:00:00Z' };
    const blank = { id: 't4', amount: -10.93, merchant_key: 'unknown', merchant_raw: null, occurred_at: '2026-09-21T16:00:00Z' };
    const named_sighting = { ...alert, id: 'e2', merchant_key: 'cabify', merchant_raw: 'Cabify' };
    expect(findMatch(named_sighting, [blank, named])?.id).toBe('t3');
  });

  it('will not cross accounts or cards on a figure alone', () => {
    const onCard = { ...cabify, card_last4: '9999' };
    expect(findMatch({ ...alert, card_last4: '7516' }, [onCard])).toBeNull();
    const onAccount = { ...cabify, account_id: 'acc-a' };
    expect(findMatch({ ...alert, account_id: 'acc-b' }, [onAccount])).toBeNull();
  });
});
