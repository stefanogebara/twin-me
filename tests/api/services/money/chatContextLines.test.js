/** The context lines the chat quotes instead of summing: each place's month, and what is left. */
import { describe, expect, it } from 'vitest';
import { assemble, contextText } from '../../../../api/_app/services/money/chat.js';

const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, key, raw, iso, amount) => ({ id, merchant_key: key, merchant_raw: raw, occurred_at: iso, amount, currency: 'EUR' });

describe('context lines', () => {
  it('uses the current bank snapshot and subsequent payments, just like Today', () => {
    const ctx = assemble({
      now, language: 'en', facts: [{ kind: 'income', amount: 700 }],
      accounts: [{ id: 'bank', bank_name: 'Bank', currency: 'EUR', balance: 200, balance_type: 'ITAV', balance_at: '2026-09-19T06:00:00Z', balance_observed_at: '2026-09-19T06:00:00Z' }],
      transactions: [{ ...tx('pending', 'dinner', 'Dinner', '2026-09-19T07:00:00Z', -20), account_id: 'bank' }],
      forecast: { month: '2026-09-01', spent: 100, days_left: 11, committed: 60, projected_p10: 300, projected_p50: 400, projected_p90: 600 },
    });
    expect(contextText(ctx)).toMatch(/120,00 EUR \(from the balance\)/);
    expect(contextText(ctx)).toMatch(/10,00 EUR/);
  });
  it('totals each place for this month and last, with the count', () => {
    const ctx = assemble({ transactions: [tx('a', 'glovo', 'GLOVO', '2026-09-02T20:00:00Z', -14.13), tx('b', 'glovo', 'GLOVO', '2026-09-10T20:00:00Z', -4.7), tx('c', 'glovo', 'GLOVO', '2026-09-12T20:00:00Z', -5.35), tx('d', 'lidl', 'LIDL', '2026-08-12T10:00:00Z', -30)], forecast: { month: '2026-09-01', spent: 24.18, days_left: 11, committed: 0, projected_p10: 30, projected_p50: 40, projected_p90: 60 }, now, language: 'en' });
    const text = contextText(ctx);
    expect(text).toMatch(/^This month by place, total \(payments\): GLOVO 24,18 EUR \(3\)\.$/m);
    expect(text).toMatch(/^Aug by place, total \(payments\): LIDL 30,00 EUR \(1\)\.$/m);
  });
  it('says what is left for the days until the month ends, from what they said comes in', () => {
    const ctx = assemble({ transactions: [tx('a', 'glovo', 'GLOVO', '2026-09-02T20:00:00Z', -100)], facts: [{ kind: 'income', amount: 700 }], forecast: { month: '2026-09-01', spent: 100, days_left: 11, committed: 50, calendar_ahead: 0, calendar_items: [], projected_p10: 300, projected_p50: 400, projected_p90: 600 }, now, language: 'en' });
    const text = contextText(ctx);
    expect(text).toMatch(/^Left for the \d+ days until the month ends, after what is spent and spoken for: 550,00 EUR \(from what they said comes in\)\.$/m);
  });
});

describe('the return windows in the context', () => {
  it('is one line the model can quote, and none without a window', async () => {
    const { assemble, contextText } = await import('../../../../api/_app/services/money/chat.js');
    const now = new Date('2026-09-21T10:00:00Z');
    const tx = { id: 'a', occurred_at: '2026-09-20T10:00:00Z', amount: -5, currency: 'EUR', merchant_raw: 'Lidl', merchant_key: 'lidl' };
    const withWindow = contextText(assemble({ transactions: [tx], now, language: 'en', returns: [{ merchant: 'Zara', amount: 39.95, until: '2026-09-24', days_left: 3, transaction_id: null }] }));
    expect(withWindow).toMatch(/Return windows closing: Zara 39,95 EUR until 24 Sep \(3 days\)\./);
    expect(contextText(assemble({ transactions: [tx], now, language: 'en' }))).not.toMatch(/Return windows/);
  });
});
