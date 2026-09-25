import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ status: vi.fn(), from: vi.fn() }));
vi.mock('../../../../api/_app/services/money/reconciliationService.js', () => ({ getReconciliationStatus: f.status }));
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: f.from } }));
import { listReadings, refreshReadings, moneyContext, learn, patternsFor, subscriptionUsage, refreshRecurring } from '../../../../api/_app/services/money/store.js';
const owner = '00000000-0000-4000-8000-000000000001';
const clear = { state: 'clear', unresolvedCount: 0, revision: 1, financialRevision: 1 };
const pending = { ...clear, state: 'pending', unresolvedCount: 2 };
beforeEach(() => {
  vi.clearAllMocks(); f.status.mockReset().mockResolvedValue(pending);
  f.from.mockImplementation(() => { const q = new Proxy({}, { get: (_t, k) => k === 'then' ? (res, rej) => Promise.resolve({ data: [{ id: 'cached', sentence: 'You can spend 400 EUR.', receipt_ids: [] }], error: null }).then(res, rej) : () => q }); return q; });
});
describe('cached financial advice cannot bypass live completeness', () => {
  it.each(['pending', 'unavailable'])('hides cached readings when %s without deleting their audit record', async state => {
    f.status.mockResolvedValue({ ...pending, state });
    expect(await listReadings(owner)).toEqual([]); expect(f.from).not.toHaveBeenCalled();
  });
  it('a deferral racing with the cached read suppresses the old sentence', async () => {
    f.status.mockResolvedValueOnce(clear).mockResolvedValueOnce(pending);
    expect(await listReadings(owner)).toEqual([]); expect(f.status).toHaveBeenCalledTimes(2);
  });
  it('does not manufacture refreshed advice or derived predictions while held', async () => {
    expect(await refreshReadings(owner)).toMatchObject({ findings: [], told: 0, reconciliation: pending });
    expect(await learn(owner)).toMatchObject({ profiles: [], predictions: [], summary: null });
    expect(await patternsFor(owner)).toEqual([]); expect(await refreshRecurring(owner)).toEqual([]);
    expect(await subscriptionUsage(owner)).toMatchObject({ findings: [], reconciliation: pending });
    expect(f.from).not.toHaveBeenCalled();
  });
  it('the legacy twin receives no current numeric money context while held', async () => {
    const ctx = await moneyContext(owner);
    expect(ctx).toMatchObject({ withheld: true, reconciliation: pending, readings: [] });
    expect(ctx.spent).toBeUndefined(); expect(ctx.received).toBeUndefined(); expect(f.from).not.toHaveBeenCalled();
  });
});
