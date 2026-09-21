/**
 * The page in one read: every part in parallel, the forecast read once for the month and
 * the day both, and a part that could not be read named rather than dropped.
 */
import { describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ sources: vi.fn(), forecast: vi.fn(), months: vi.fn(), today: vi.fn(), ledger: vi.fn(), recurring: vi.fn(), readings: vi.fn(), categories: vi.fn(), usage: vi.fn(), accounts: vi.fn(), reconnect: vi.fn(), cards: vi.fn(), inbox: vi.fn(), facts: vi.fn(), seen: vi.fn() }));
vi.mock('../../../../api/services/money/forecastService.js', () => ({ forecast: f.forecast, months: f.months }));
vi.mock('../../../../api/services/money/allowanceService.js', () => ({ todayAllowance: f.today }));
vi.mock('../../../../api/services/money/transactionRepository.js', () => ({ listTransactions: f.ledger }));
vi.mock('../../../../api/services/money/factsRepository.js', () => ({ listFacts: f.facts }));
vi.mock('../../../../api/services/money/seen.js', () => ({ seenBy: f.seen, sourceCounts: f.sources }));
vi.mock('../../../../api/services/money/store.js', () => ({ refreshRecurring: f.recurring, listBankAccounts: f.accounts, reconnectByAccount: f.reconnect, listReadings: f.readings, categorySpend: f.categories, subscriptionUsage: f.usage }));
vi.mock('../../../../api/services/money/instruments.js', () => ({ accountsWithCards: f.cards }));
vi.mock('../../../../api/services/money/betaCapabilities.js', () => ({ moneyCapabilities: () => ({ bank: true, capture: false }) }));
vi.mock('../../../../api/services/money/inbox.js', () => ({ inboxAddress: f.inbox, inboxDomain: () => 'in.twinme.me', isInboxConfigured: () => true }));
import { readPage, accountsView } from '../../../../api/services/money/pageRead.js';

const owner = '00000000-0000-4000-8000-000000000001';
function happy() {
  f.forecast.mockResolvedValue({ month: '2026-09-01', spent: 10 });
  f.months.mockResolvedValue([{ month: '2026-09-01' }]);
  f.today.mockResolvedValue({ amount: 12 });
  f.ledger.mockResolvedValue([{ id: 't1' }]);
  f.recurring.mockResolvedValue([]);
  f.readings.mockResolvedValue([]);
  f.categories.mockResolvedValue({ groups: [] });
  f.usage.mockResolvedValue({ findings: [] });
  f.accounts.mockResolvedValue([{ id: 'a1', session_id: 's', created_at: 'c', bank_name: 'Santander' }]);
  f.reconnect.mockResolvedValue(new Set(['a1']));
  f.cards.mockImplementation(async (_u, accounts) => accounts.map((a) => ({ ...a, cards: [] })));
  f.inbox.mockResolvedValue('u1@in.twinme.me');
  f.facts.mockResolvedValue([{ id: 'f1', kind: 'home_area' }]);
  f.seen.mockResolvedValue({ t1: ['bankfeed', 'phone'] });
  f.sources.mockResolvedValue({ by: { bankfeed: 2 }, month: { payments: 2, named: 2, timed: 1 } });
}

describe('readPage', () => {
  it('reads every part once, and hands the forecast to the day instead of reading it twice', async () => {
    vi.clearAllMocks(); happy();
    const { data, failed } = await readPage(owner, { view: 'today', now: new Date('2026-09-19T10:00:00Z') });
    expect(failed).toEqual([]);
    expect(Object.keys(data).sort()).toEqual(['accounts', 'capabilities', 'categories', 'facts', 'forecast', 'inbox', 'ledger', 'months', 'readings', 'recurring', 'seen', 'sources', 'today', 'usage']);
    expect(f.forecast).toHaveBeenCalledTimes(1);
    expect(f.months).toHaveBeenCalledTimes(1);
    expect(f.today).toHaveBeenCalledWith(owner, expect.any(Date), { cast: { month: '2026-09-01', spent: 10 }, segments: [{ month: '2026-09-01' }] });
    expect(f.ledger).toHaveBeenCalledWith(owner, { limit: 20000 });
    expect(f.categories).toHaveBeenCalledWith(owner, { month: '2026-09-01' });
    expect(data.accounts).toEqual([{ id: 'a1', bank_name: 'Santander', cards: [], needs_reconnect: true }]);
    expect(data.inbox).toEqual({ address: 'u1@in.twinme.me', domain: 'in.twinme.me', receiving: true });
    expect(data.capabilities).toEqual({ bank: true, capture: false });
  });
  it('names the parts that could not be read and keeps the rest', async () => {
    vi.clearAllMocks(); happy();
    f.forecast.mockRejectedValue(new Error('down'));
    f.usage.mockRejectedValue(new Error('down'));
    const { data, failed } = await readPage(owner, { view: 'month' });
    /* The day rests on the forecast, so it fails with it, and says so. */
    expect(failed.sort()).toEqual(['forecast', 'today', 'usage']);
    expect(data.forecast).toBeNull();
    expect(data.today).toBeNull();
    expect(data.ledger).toEqual([{ id: 't1' }]);
  });
  it('refuses a view it does not know', async () => {
    await expect(readPage(owner, { view: 'plan' })).rejects.toThrow('Unknown view');
    await expect(readPage(null)).rejects.toThrow('userId required');
  });
  it('accountsView survives a reconnect check that fails', async () => {
    vi.clearAllMocks(); happy();
    f.reconnect.mockRejectedValue(new Error('no session'));
    expect(await accountsView(owner)).toEqual([{ id: 'a1', bank_name: 'Santander', cards: [], needs_reconnect: false }]);
  });
});
