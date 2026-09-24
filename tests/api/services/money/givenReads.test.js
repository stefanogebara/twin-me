/**
 * One read, handed on (M2-A, 2026-09-22). The page and the chat read the ledger and the facts
 * once and give the rows to every part; each part must take what it is given, select the same
 * slice it used to read for itself, and read nothing of its own. Alone, each still reads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ listTransactions: vi.fn(), listFacts: vi.fn(), from: vi.fn(), figures: vi.fn(), accounts: vi.fn(), returns: vi.fn() }));
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: f.from } }));
vi.mock('../../../../api/_app/services/money/figureScoreStore.js', () => ({ currentFigureScores: f.figures }));
vi.mock('../../../../api/_app/services/money/returns.js', () => ({ listReturnsClosing: f.returns }));
vi.mock('../../../../api/_app/services/money/transactionRepository.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listTransactions: f.listTransactions, listOwnTransactions: (u, o = {}) => f.listTransactions(u, { ...o, currency: 'EUR' }) };
});
vi.mock('../../../../api/_app/services/money/factsRepository.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listFacts: f.listFacts };
});

import { selectTransactions } from '../../../../api/_app/services/money/transactionRepository.js';
import { forecast, months } from '../../../../api/_app/services/money/forecastService.js';
import { todayAllowance } from '../../../../api/_app/services/money/allowanceService.js';
import { refreshRecurring, categorySpend, subscriptionUsage } from '../../../../api/_app/services/money/store.js';
import { accountsWithCards } from '../../../../api/_app/services/money/instruments.js';
import { inboxAddress } from '../../../../api/_app/services/money/inbox.js';

const owner = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-22T10:00:00Z');
const day = (n) => new Date(now.getTime() - n * 86400000).toISOString();
const tx = (id, daysAgo, amount, extra = {}) => ({ id, user_id: owner, occurred_at: day(daysAgo), amount, currency: 'EUR', merchant_key: `m${id}`, merchant_raw: `M${id}`, channel: 'bankfeed', verdict: null, ...extra });
const rows = [tx('1', 1, -12), tx('2', 3, -8, { verdict: 'not_me' }), tx('3', 9, -30), tx('4', 120, -5), tx('5', 2, -7, { currency: 'USD' }), tx('6', 450, -9)];
const facts = [{ id: 'f1', kind: 'home_area', value: 'Madrid' }, { id: 'f2', kind: 'calendar_feed', value: 'https://x' }, { id: 'f3', kind: 'event_spend', value: '1' },
  { id: 'f4', kind: 'card_type', subject: 'a1:1234', value: 'credit' }, { id: 'f5', kind: 'inbox_address', subject: '', value: 'r-abc@in.twinme.me' }];

/* A table read that answers every builder chain with an empty page, and records the table. */
function emptyTables() {
  const chain = { data: [], error: null };
  const q = new Proxy({}, { get: (_t, k) => (k === 'then' ? (res) => Promise.resolve(chain).then(res) : () => q) });
  f.from.mockImplementation(() => q);
}

describe('selectTransactions', () => {
  it('selects what the ledger RPC would, in the order it was given', () => {
    expect(selectTransactions(rows).map((r) => r.id)).toEqual(['1', '3', '4', '5', '6']);
    expect(selectTransactions(rows, { includeRejected: true }).map((r) => r.id)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(selectTransactions(rows, { currency: 'EUR' }).map((r) => r.id)).toEqual(['1', '3', '4', '6']);
    expect(selectTransactions(rows, { since: day(9) }).map((r) => r.id)).toEqual(['1', '3', '5']);
    expect(selectTransactions(rows, { since: day(9), currency: 'EUR', includeRejected: true }).map((r) => r.id)).toEqual(['1', '2', '3']);
  });
  it('keeps the same safety bound as the read', () => {
    expect(() => selectTransactions(rows, { limit: 2 })).toThrow('larger than this analysis window');
    expect(selectTransactions([], { limit: 0 })).toEqual([]);
    expect(selectTransactions(null)).toEqual([]);
  });
});

describe('every part takes what it is given and reads nothing of its own', () => {
  beforeEach(() => {
    vi.clearAllMocks(); emptyTables();
    f.listTransactions.mockRejectedValue(new Error('must not read the ledger'));
    f.listFacts.mockRejectedValue(new Error('must not read the facts'));
    f.figures.mockResolvedValue({ figures: [] });
    f.returns.mockResolvedValue([]);
    f.accounts.mockResolvedValue([]);
  });
  const given = { facts, transactions: rows };

  it('forecast', async () => {
    const cast = await forecast(owner, now, given);
    expect(cast).toBeTruthy();
    expect(f.listTransactions).not.toHaveBeenCalled();
    expect(f.listFacts).not.toHaveBeenCalled();
  });
  it.each(['failure', 'deadline'])('keeps issued uncertainty when score reconciliation cannot finish: %s', async (mode) => {
    if (mode === 'deadline') vi.useFakeTimers();
    f.figures.mockImplementation(() => mode === 'deadline' ? new Promise(() => {}) : Promise.reject(new Error('score unavailable')));
    const issued = [{ kind: 'day_total', predicted_on: '2026-09-21', predicted_for: '2026-09-22', high: 50, issued_high: 100.19, low: 0, issued_low: 0, scored_at: '2026-09-21', actual: 1 }];
    f.from.mockImplementation((table) => {
      const q = new Proxy({}, { get: (_t, k) => k === 'then' ? (res, rej) => Promise.resolve({ data: table === 'money_figure_scores' ? issued : [], error: null }).then(res, rej) : () => q });
      return q;
    });
    try {
      const result = forecast(owner, now, given);
      if (mode === 'deadline') await vi.advanceTimersByTimeAsync(2501);
      const cast = await result;
      expect(cast.band_calibration).toMatchObject({ widen: 50.19, days: 0, carried_from: '2026-09-21', reconciliation_pending: true });
    } finally { vi.useRealTimers(); }
  });
  it('withholds a forecast when both reconciliation and issued uncertainty cannot be read', async () => {
    f.figures.mockRejectedValue(new Error('score unavailable'));
    f.from.mockImplementation((table) => {
      const q = new Proxy({}, { get: (_t, k) => k === 'then' ? (res, rej) => Promise.resolve({ data: [], error: table === 'money_figure_scores' ? { message: 'unavailable' } : null }).then(res, rej) : () => q });
      return q;
    });
    await expect(forecast(owner, now, given)).rejects.toThrow(/uncertainty/i);
  });
  it('months', async () => {
    const segments = await months(owner, now, given);
    expect(Array.isArray(segments)).toBe(true);
    expect(f.listTransactions).not.toHaveBeenCalled();
    expect(f.listFacts).not.toHaveBeenCalled();
  });
  it('todayAllowance, with the forecast and the segments too', async () => {
    const today = await todayAllowance(owner, now, { ...given, cast: { month: '2026-09-01', projected_p50: 300, spent: 100 }, segments: [] });
    expect(today).toHaveProperty('returns_closing', []);
    expect(f.listTransactions).not.toHaveBeenCalled();
    expect(f.listFacts).not.toHaveBeenCalled();
  });
  it('refreshRecurring', async () => {
    await refreshRecurring(owner, now, given);
    expect(f.listTransactions).not.toHaveBeenCalled();
    expect(f.listFacts).not.toHaveBeenCalled();
  });
  it('categorySpend', async () => {
    await categorySpend(owner, { month: '2026-09-01', facts });
    expect(f.listFacts).not.toHaveBeenCalled();
  });
  it('subscriptionUsage', async () => {
    await subscriptionUsage(owner, now, given);
    expect(f.listTransactions).not.toHaveBeenCalled();
  });
  it('accountsWithCards, labelling from the given facts', async () => {
    const out = await accountsWithCards(owner, [{ id: 'a1' }], { facts, transactions: [tx('9', 1, -3, { account_id: 'a1', channel: 'card', card_last4: '1234' })] });
    expect(out[0].cards).toEqual([{ last4: '1234', type: 'credit', source: 'user' }]);
    expect(f.listTransactions).not.toHaveBeenCalled();
    expect(f.from).not.toHaveBeenCalled();
  });
  it('inboxAddress, from the given facts', async () => {
    expect(await inboxAddress(owner, { facts })).toBe('r-abc@in.twinme.me');
    expect(f.from).not.toHaveBeenCalled();
  });
});

describe('alone, each part still reads for itself', () => {
  beforeEach(() => {
    vi.clearAllMocks(); emptyTables();
    f.listTransactions.mockResolvedValue([]);
    f.listFacts.mockResolvedValue([]);
    f.figures.mockResolvedValue({ figures: [] });
    f.returns.mockResolvedValue([]);
  });
  it('forecast reads the euro ledger since 100 days and every fact', async () => {
    await forecast(owner, now);
    expect(f.listTransactions).toHaveBeenCalledWith(owner, expect.objectContaining({ currency: 'EUR', limit: 5000, since: expect.any(String) }));
    expect(f.listFacts).toHaveBeenCalledWith(owner, { includeInternal: true });
  });
  it('months and subscriptionUsage read the whole euro ledger', async () => {
    await months(owner, now);
    await subscriptionUsage(owner, now);
    expect(f.listTransactions).toHaveBeenCalledTimes(2);
    for (const call of f.listTransactions.mock.calls) expect(call[1]).toEqual({ currency: 'EUR', limit: 5000 });
  });
  it('refreshRecurring reads 400 days with the rejected rows', async () => {
    await refreshRecurring(owner, now);
    expect(f.listTransactions).toHaveBeenCalledWith(owner, expect.objectContaining({ currency: 'EUR', includeRejected: true, limit: 5000 }));
  });
});
