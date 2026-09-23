/** "Not mine" always carries the offer that changes the ledger, whatever the model offered. */
import { describe, expect, it } from 'vitest';
import { assemble, notMineOffer, assembleReply } from '../../../../api/_app/services/money/chat.js';

const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, key, raw, iso, amount) => ({ id, merchant_key: key, merchant_raw: raw, occurred_at: iso, amount, currency: 'EUR' });
const ctx = () => assemble({ transactions: [tx('a', 'lidl mad mercad', 'LIDL MAD MERCAD', '2026-09-19T06:00:00Z', -1.68), tx('b', 'glovo', 'GLOVO', '2026-09-18T20:00:00Z', -14.13), tx('c', 'refund', 'REFUND', '2026-09-18T21:00:00Z', 5)], now, language: 'en' });

describe('notMineOffer', () => {
  it('finds the payment named in the message', () => {
    expect(notMineOffer('The LIDL MAD MERCAD payment is not mine, my flatmate used my card', ctx())).toEqual({ kind: 'not_me', transaction_id: 'a' });
    expect(notMineOffer('glovo não foi eu', ctx())).toEqual({ kind: 'not_me', transaction_id: 'b' });
  });
  it('takes the newest spending for "the last payment", never money in', () => {
    expect(notMineOffer('the last payment is not mine', ctx())).toEqual({ kind: 'not_me', transaction_id: 'a' });
  });
  it('offers nothing without the words, or without a match', () => {
    expect(notMineOffer('how much did I spend at lidl?', ctx())).toBeNull();
    expect(notMineOffer('the mercadona one is not mine', ctx())).toBeNull();
  });
  it('is added in front when the model only offered to remember', () => {
    const reply = assembleReply({ text: 'Noted.', figures: [], actions: [{ kind: 'remember', text: 'flatmate used my card' }] }, ctx(), 'The LIDL MAD MERCAD payment is not mine, my flatmate used my card');
    expect(reply.actions[0]).toMatchObject({ kind: 'not_me', transaction_id: 'a' });
  });
});
