/**
 * The guard for the ten phantom lines of 2026-09-24, at the layer that actually runs.
 * =================================================================================
 * ledger.test.js pins findMatch. This pins planIngestion, which is what a bank alert mail
 * really goes through: the exclude set, the backings and the pool are all in play here, and
 * it was their combination, not findMatch alone, that decided whether a second line was
 * opened. A nameless alert must join the booked line of its figure; two alerts must not
 * collapse onto one line; and the bank must keep its name, its key and its amount.
 */
import { describe, it, expect } from 'vitest';
import { planIngestion } from '../../../../api/_app/services/money/ingestion.js';

const bankLine = {
  id: 't-cabify', account_id: 'acc-1', amount: -10.93, currency: 'EUR',
  merchant_key: 'cabify', merchant_raw: 'Cabify',
  occurred_at: '2026-09-19T12:00:00Z', posted_at: '2026-09-19T12:00:00Z',
  primary_sighting_id: 's-bank', primary_source: 'bankfeed', primary_status: 'BOOK',
  backings: [{ id: 's-bank', source: 'bankfeed', status: 'BOOK' }],
};
const alert = (ref, amount = 10.93, at = '2026-09-21T16:54:46Z') => ({
  source: 'email', source_ref: ref, amount, currency: 'EUR', direction: 'out',
  occurred_at: at, merchant_key: 'unknown', merchant_raw: null,
  raw_text: `movimiento de -${amount} EUR en tu cuenta acabada en 7516`, parse_confidence: 0.6,
});
const snapshot = (transactions) => ({ revision: 1, transactions, sightings: [] });

describe('a bank alert mail reaching the ledger', () => {
  it('joins the booked line instead of opening a second one', () => {
    const plan = planIngestion([alert('email:aaa')], snapshot([bankLine]));
    expect(plan.creates).toHaveLength(0);
    expect(plan.results[0].action).toBe('attach');
    expect(plan.links[0].transaction_id).toBe('t-cabify');
  });

  it('leaves the bank line saying exactly what it said', () => {
    const plan = planIngestion([alert('email:aaa')], snapshot([bankLine]));
    const [update] = plan.updates;
    expect(update?.merchant_raw).toBeUndefined();
    expect(update?.merchant_key).toBeUndefined();
    expect(update?.amount).toBeUndefined();
    expect(update?.primary_sighting_id).toBeUndefined();
  });

  it('opens one line only when the bank has booked nothing of that figure', () => {
    const plan = planIngestion([alert('email:bbb', 22.36)], snapshot([bankLine]));
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].merchant_key).toBe('unknown');
  });

  it('never folds two alerts onto one line: the second opens its own', () => {
    const plan = planIngestion([alert('email:aaa'), alert('email:ccc', 10.93, '2026-09-21T17:10:00Z')], snapshot([bankLine]));
    expect(plan.creates).toHaveLength(1);
    expect(plan.results[0].action).toBe('attach');
    expect(plan.results[1].action).toBe('create');
  });

  it('is named when the bank row arrives after the alert opened the line', () => {
    const first = planIngestion([alert('email:ddd')], snapshot([]));
    const opened = first.creates[0];
    expect(opened.merchant_key).toBe('unknown');
    const second = planIngestion([{
      source: 'bankfeed', source_ref: 'bank:acc-1:ref-9', amount: 10.93, currency: 'EUR', direction: 'out',
      occurred_at: '2026-09-19T12:00:00Z', merchant_key: 'cabify', merchant_raw: 'Cabify', account_id: 'acc-1',
    }], snapshot([{ ...opened, backings: [{ id: first.sightings[0].id, source: 'email', status: 'BOOK' }], primary_source: 'email' }]));
    expect(second.creates).toHaveLength(0);
    expect(second.updates[0].merchant_raw).toBe('Cabify');
    expect(second.updates[0].merchant_key).toBe('cabify');
  });

  it('an arrival is folded the same way: 500,00 EUR came in once, not twice', () => {
    const transfer = { ...bankLine, id: 't-in', amount: 500, merchant_key: 'mauad gebara christian', merchant_raw: 'Mauad Gebara Christian', occurred_at: '2026-09-24T12:00:00Z', posted_at: '2026-09-24T12:00:00Z' };
    const inbound = { ...alert('email:eee', 500, '2026-09-24T16:16:27Z'), direction: 'in' };
    const plan = planIngestion([inbound], snapshot([transfer]));
    expect(plan.creates).toHaveLength(0);
    expect(plan.links[0].transaction_id).toBe('t-in');
  });
});
