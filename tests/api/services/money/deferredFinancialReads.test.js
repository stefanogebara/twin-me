import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ status: vi.fn(), model: vi.fn(), stream: vi.fn(), save: vi.fn(), from: vi.fn(), scores: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../../api/_app/services/money/reconciliationService.js', () => ({ getReconciliationStatus: f.status }));
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: f.from, rpc: f.rpc } }));
vi.mock('../../../../api/_app/services/llmGateway.js', () => ({ complete: f.model, stream: f.stream, TIER_CHAT: 'chat' }));
vi.mock('../../../../api/_app/services/money/figureScoreStore.js', () => ({ currentFigureScores: f.scores }));
vi.mock('../../../../api/_app/services/money/returns.js', () => ({ listReturnsClosing: async () => [] }));
vi.mock('../../../../api/_app/services/money/store.js', async original => ({ ...(await original()),
  listTransactions: async () => [{ id: 't1', amount: -10, occurred_at: '2026-09-24T10:00:00Z', currency: 'EUR', merchant_key: 'cafe' }],
  listFacts: async () => [], months: async () => [], forecast: async () => ({ month: '2026-09-01', spent: 10 }),
  listReadings: async () => [], refreshRecurring: async () => [], listBankAccounts: async () => [],
  listPlaces: async () => [], questionsFor: async () => ({ opening: [], fromLedger: [] }),
  categorySpend: async () => ({ groups: [] }), subscriptionUsage: async () => ({ findings: [] }), userLanguage: async () => 'en', saveChatTurn: f.save,
}));
import { answer, answerStream } from '../../../../api/_app/services/money/chat.js';
import { forecast } from '../../../../api/_app/services/money/forecastService.js';
import { beginReconciliationRead, finishReconciliationRead } from '../../../../api/_app/services/money/reconciliationRead.js';
import { recordPredictions } from '../../../../api/_app/services/money/predictions.js';
const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-25T12:00:00Z');
const clear = { state: 'clear', unresolvedCount: 0, revision: 1, financialRevision: 2 };
const pending = { ...clear, state: 'pending', unresolvedCount: 1 };
beforeEach(() => {
  vi.clearAllMocks(); f.status.mockReset().mockResolvedValue(clear); f.save.mockResolvedValue({});
  f.scores.mockResolvedValue({ figures: [] });
  f.rpc.mockResolvedValue({ data: { recorded: 1 }, error: null });
  f.from.mockImplementation(() => { const q = new Proxy({}, { get: (_t, key) => key === 'then' ? (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej) : () => q }); return q; });
});
describe('one stable completeness check controls every answer transport', () => {
  it.each(['pending', 'unavailable'])('withholds %s from non-streamed and persisted replies before calling a model', async state => {
    f.status.mockResolvedValue({ ...pending, state });
    const reply = await answer(owner, 'Can I afford 200 euros?', [{ role: 'twin', text: 'You can spend 200 euros.' }], { now });
    expect(reply.text).not.toContain('200'); expect(reply.figures).toEqual([]);
    expect(reply.text).toMatch(/review|paused/i); expect(f.model).not.toHaveBeenCalled();
    expect(f.save).toHaveBeenLastCalledWith(owner, expect.objectContaining({ role: 'twin', text: reply.text, figures: [] }));
  });
  it('streams and persists only the held explanation, without revisiting old numeric history', async () => {
    f.status.mockResolvedValue(pending); const events = [];
    const reply = await answerStream(owner, 'And what about tomorrow?', [{ role: 'twin', text: '200 EUR tomorrow.' }], { now, onEvent: event => events.push(event) });
    expect(f.stream).not.toHaveBeenCalled(); expect(f.model).not.toHaveBeenCalled();
    expect(events.filter(e => e.phase === 'text').map(e => e.delta).join('')).toBe(reply.text);
    expect(events.find(e => e.phase === 'figures').figures).toEqual([]);
    expect(events.at(-1).phase).toBe('done'); expect(reply.text).not.toContain('200');
  });
  it('greetings still work without querying financial data', async () => {
    f.status.mockResolvedValue(pending); await answer(owner, 'hello');
    expect(f.status).not.toHaveBeenCalled(); expect(f.model).not.toHaveBeenCalled();
  });
  it.each(['revision', 'financialRevision'])('a concurrent %s change withholds a mixed financial read', async field => {
    f.status.mockResolvedValueOnce(clear).mockResolvedValueOnce({ ...clear, [field]: clear[field] + 1 });
    const read = await beginReconciliationRead(owner);
    expect(await finishReconciliationRead(read)).toMatchObject({ state: 'unavailable', revision: null });
    expect(f.status).toHaveBeenCalledTimes(2);
  });
  it('failed status is unavailable, never a fake clear ledger', async () => {
    f.status.mockRejectedValue(new Error('network'));
    const cast = await forecast(owner, now, { facts: [], transactions: [] });
    expect(cast).toMatchObject({ withheld: true, spent: null, projected_p50: null, reconciliation: { state: 'unavailable' } });
    expect(f.from).not.toHaveBeenCalled(); expect(f.scores).not.toHaveBeenCalled();
  });
  it('direct forecast callers are gated before calculation and do not store a zero snapshot', async () => {
    f.status.mockResolvedValue(pending);
    expect(await forecast(owner, now, { facts: [], transactions: [] })).toMatchObject({ withheld: true, projected_p10: null, projected_p50: null, projected_p90: null, tomorrow: null });
    expect(f.from).not.toHaveBeenCalled(); expect(f.scores).not.toHaveBeenCalled();
  });
  it('direct issue calls cannot write a day figure while evidence is pending', async () => {
    f.status.mockResolvedValue(pending);
    expect(await recordPredictions(owner, { cast: null, day: { predicted_for: '2026-09-26', value: 20 }, now })).toEqual({ recorded: 0 });
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
  it('a deferral racing with issue is rejected atomically, without falling back to table writes', async () => {
    f.rpc.mockResolvedValue({ error: { code: 'PT409' } });
    expect(await recordPredictions(owner, { cast: { reconciliation: clear }, day: { predicted_for: '2026-09-26', value: 20 }, now })).toMatchObject({ recorded: 0, withheld: true });
    expect(f.rpc).toHaveBeenCalledWith('commit_money_prediction_issue', expect.objectContaining({ p_user_id: owner, p_revision: 1, p_financial_revision: 2 }));
    expect(f.from).not.toHaveBeenCalled();
  });
});
