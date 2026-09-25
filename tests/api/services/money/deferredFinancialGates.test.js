import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: null }));
import { safeToSpend } from '../../../../api/_app/services/money/allowance.js';
import { predictionsFrom } from '../../../../api/_app/services/money/predictions.js';
import { monthPlan, planLine } from '../../../../api/_app/services/money/plan.js';
import { assemble, assembleReply, buildFigure, plainReplyFor } from '../../../../api/_app/services/money/chat.js';
const now = new Date('2026-09-25T12:00:00Z');
const cast = { month: '2026-09-01', spent: 100, days_left: 5, committed: 0, projected_p10: 100, projected_p50: 120, projected_p90: 140 };
const facts = [{ kind: 'income', amount: 1000 }];
const transaction = { id: 't', merchant_key: 'cafe', merchant_raw: 'Cafe', amount: -10, currency: 'EUR', occurred_at: '2026-09-24T10:00:00Z' };
describe('deferred evidence stops financial conclusions, not factual ledger access', () => {
  it.each(['pending', 'unavailable'])('%s cannot become an allowance or day prediction', (state) => {
    const reconciliation = { state, unresolvedCount: state === 'pending' ? 1 : null, revision: 5 };
    const held = { ...cast, withheld: true, reconciliation };
    expect(safeToSpend({ cast: held, facts, now })).toMatchObject({ amount: null, reconciliation });
    expect(predictionsFrom({ cast: held, allowance: { amount: 20 }, day: { predicted_for: '2026-09-26', value: 20 }, now })).toEqual([]);
    expect(predictionsFrom({ allowance: { amount: null, withheld: true, reconciliation }, day: { predicted_for: '2026-09-26', value: 20 }, now })).toEqual([]);
  });
  it('plan retains recorded rows but removes predictions and qualifies the total', () => {
    const reconciliation = { state: 'pending', unresolvedCount: 1, revision: 5 };
    const plan = monthPlan({ forecast: { ...cast, reconciliation, withheld: true }, transactions: [transaction], now });
    expect(plan).toMatchObject({ withheld: true, reconciliation, totals: { expected_rest: null, income_ahead: null } });
    expect(plan.cells.find(c => c.day === '2026-09-24').rows).toHaveLength(1);
    expect(planLine(plan)).toMatch(/review|incomplete/i);
  });
  it('pure reply assembly cannot turn held evidence into model prose or figures', () => {
    const ctx = assemble({ transactions: [transaction], forecast: { ...cast, withheld: true, reconciliation: { state: 'pending', unresolvedCount: 1, revision: 5 } }, facts, now });
    expect(assembleReply({ text: 'You can spend 200 EUR today.', figures: [{ kind: 'band' }] }, ctx, 'Can I afford 200?')).toMatchObject({ figures: [], actions: [] });
    expect(assembleReply({ text: 'You can spend 200 EUR today.' }, ctx).text).not.toContain('200');
    expect(plainReplyFor('How much did I spend yesterday?', ctx).text).toMatch(/review/i);
    expect(buildFigure({ kind: 'months' }, ctx)).toBeNull();
  });
});
