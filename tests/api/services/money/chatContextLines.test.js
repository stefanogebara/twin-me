/** The context lines the chat quotes instead of summing: each place's month, and what is left. */
import { describe, expect, it } from 'vitest';
import { assemble, contextText } from '../../../../api/services/money/chat.js';

const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, key, raw, iso, amount) => ({ id, merchant_key: key, merchant_raw: raw, occurred_at: iso, amount, currency: 'EUR' });

describe('context lines', () => {
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
