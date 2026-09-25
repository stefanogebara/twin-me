import { affordabilityAnswer } from '../../../../api/_app/services/money/affordability.js';
import { withPerson } from '../../../../api/_app/services/money/scope.js';
import { describe, it, expect } from 'vitest';
import { assemble, shortCircuit } from '../../../../api/_app/services/money/chat.js';

const now = new Date('2026-09-25T12:00:00Z');
const context = (extra = {}) => assemble({ now, language: 'en',
  forecast: { month: '2026-09-01', spent: 0, committed: 0, days_left: 5 },
  accounts: [{ id: 'bank', currency: 'EUR', balance: 70.56, balance_type: 'ITAV', bank_name: 'Bank',
    balance_at: now.toISOString(), balance_observed_at: now.toISOString() }], ...extra });

describe('a hypothetical purchase today', () => {
  it('computes the difference from Today and adds no unrelated chart, payments or write offer', () => {
    const reply = shortCircuit('Can I spend 25 euros on dinner today?', context());
    expect(reply?.text).toContain('13,24');
    expect(reply?.text).toContain('11,76');
    expect(reply?.text).toContain('above');
    expect(reply).toMatchObject({ figures: [{ kind: 'purchase', cost: 25, allowance: 11.76, difference: 13.24, currency: 'EUR' }], receipts: [], actions: [] });
  });
  it('says what remains inside the estimate, without treating it as permission to spend', () => {
    const reply = shortCircuit('Can I spend €10 on dinner tonight?', context());
    expect(reply?.text).toContain('1,76');
    expect(reply?.text).toContain('within');
    expect(reply?.text).not.toMatch(/safe|yes|guaranteed/i);
  });
  it.each(['¿Puedo gastar 25 euros hoy?', 'Posso gastar 25 euros hoje?'])('supports %s', (question) => {
    expect(shortCircuit(question, context())?.text).toContain('13,24');
  });
  it('withholds an estimate when financial evidence is missing', () => {
    const reply = shortCircuit('Can I spend €25 today?', context({ forecast: null }));
    expect(reply?.text).toMatch(/cannot compare/i);
    expect(reply).toMatchObject({ figures: [], receipts: [], actions: [] });
  });
  it.each(['Can I spend 25 dollars today?', 'Can I spend €25 or €30 today?', 'Can I afford €25 tomorrow?',
    'Did I spend €25 today?', 'Can I spend €25 today and €30 tomorrow?'])('does not silently reuse Today for %s', (question) => {
    expect(shortCircuit(question, context())?.text || '').not.toContain('13,24');
  });
});

// The purchase and the estimate must be expressed in the same currency.
describe('purchase comparison evidence', () => {
  it('does not compare an explicit euro purchase with a dollar ledger', () => {
    const reply = withPerson({ currency: 'USD' }, () => shortCircuit('Can I spend €25 today?', context({ accounts: [{ id: 'usd', currency: 'USD', balance: 70.56, balance_type: 'ITAV', balance_at: now.toISOString(), balance_observed_at: now.toISOString() }] })));
    expect(reply?.figures?.some(f => f.kind === 'purchase')).not.toBe(true);
    expect(reply?.text || '').not.toContain('above today');
  });
  it.each([NaN, Infinity, -Infinity])('withholds non-finite allowance %s', amount => {
    expect(affordabilityAnswer('Can I spend €25 today?', () => ({ amount })).text).toMatch(/unavailable/);
  });
  it('exposes the exact comparison as structured evidence', () => {
    const reply = affordabilityAnswer('Can I spend €25 today?', () => ({ amount: 16.43 }));
    expect(reply.figures).toEqual([{ kind: 'purchase', cost: 25, allowance: 16.43, difference: 8.57, currency: 'EUR' }]);
  });
});

it('keeps a missing estimate in text without a comparison figure', () => {
  expect(affordabilityAnswer('Can I spend €25 today?', () => ({ amount: null })).figures).toEqual([]);
});
