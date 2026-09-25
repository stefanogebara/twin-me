import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { rpc } }));
import { currentFigureScores } from '../../../../api/_app/services/money/figureScoreStore.js';
const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-25T12:00:00Z');
const issued = { id: 'figure', kind: 'day_total', predicted_for: '2026-09-10', value: 20, low: 10, high: 30, issued_low: 5, issued_high: 40, actual: 15, error: -5, hit: true, scored_at: '2026-09-24T10:00:00Z' };
const snapshot = () => ({ dirty: true, revision: 4, reconciliation: { state: 'pending', revision: 2, financialRevision: 4, unresolvedCount: 1 }, figures: [issued], facts: [], transactions: [], accounts: [{ provider: 'enablebanking', currency: 'EUR', last_pulled_at: now.toISOString() }] });
beforeEach(() => rpc.mockReset());
describe('scoring uses completeness inside the revision-checked snapshot', () => {
  it('removes prior training outcomes while preserving every issued bound', async () => {
    rpc.mockResolvedValueOnce({ data: snapshot() }).mockResolvedValueOnce({ data: { changed: 1 } });
    const result = await currentFigureScores(owner, { now });
    expect(result.figures[0]).toMatchObject({ value: 20, low: 10, high: 30, issued_low: 5, issued_high: 40, actual: null, error: null, hit: null, scored_at: null });
    expect(rpc).toHaveBeenLastCalledWith('commit_money_scoring', expect.objectContaining({ p_revision: 4, p_changes: [{ id: 'figure', actual: null, error: null, hit: null, scored_at: null }] }));
  });
  it('will not use a legacy snapshot without the completeness capability', async () => {
    const legacy = snapshot(); delete legacy.reconciliation; rpc.mockResolvedValue({ data: legacy });
    await expect(currentFigureScores(owner, { now })).rejects.toThrow(/completeness/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('does not churn already withdrawn outcomes', async () => {
    const held = snapshot(); held.dirty = false; held.figures = [{ ...issued, actual: null, error: null, hit: null, scored_at: null }]; rpc.mockResolvedValue({ data: held });
    expect(await currentFigureScores(owner, { now })).toMatchObject({ changed: 0 }); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('retries a commit invalidated by a concurrent deferral with a fresh snapshot', async () => {
    const first = snapshot(); first.reconciliation.state = 'clear';
    rpc.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ error: { code: 'PT409' } }).mockResolvedValueOnce({ data: snapshot() }).mockResolvedValueOnce({ data: {} });
    expect((await currentFigureScores(owner, { now })).figures[0].actual).toBeNull(); expect(rpc).toHaveBeenCalledTimes(4);
  });
});

it('stops after three fresh snapshot attempts when revisions keep changing', async () => {
  rpc.mockImplementation(async name => name === 'prepare_money_scoring' ? { data: snapshot() } : { error: { code: 'PT409' } });
  await expect(currentFigureScores(owner, { now })).rejects.toThrow('Financial evidence changed during scoring');
  expect(rpc).toHaveBeenCalledTimes(6);
});
