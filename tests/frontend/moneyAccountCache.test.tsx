// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ owner: 'A', forecast: vi.fn(), today: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: f.owner, name: f.owner } }) }));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('@/lib/i18n', () => ({ useLocale: () => 'en-GB', useT: () => (s: string, holes: Record<string, unknown> = {}) => s.replace(/\{([^}]+)\}/g, (_, key) => String(holes[key] ?? key)) }));
vi.mock('react-router-dom', () => ({ Link: ({ children }: {children: React.ReactNode}) => <span>{children}</span> }));
vi.mock('@/pages/money/HomeAsk', () => ({ default: () => null }));
vi.mock('@/pages/money/MoneyNav', () => ({ default: () => null }));
vi.mock('@/components/Wait', () => ({ default: () => null }));
vi.mock('@/components/LedgerOrb', () => ({ default: () => null }));
vi.mock('@/pages/money/figures/DayGlobe', () => ({ default: () => null }));
vi.mock('@/pages/money/figures/Fortnight', () => ({ default: () => null }));
vi.mock('@/pages/money/figures/MonthOrbits', () => ({ default: () => null }));
vi.mock('@/pages/money/figures/TotalRow', () => ({ default: () => null }));
vi.mock('@/services/api/moneyAPI', async (original) => {
  const actual = await original<Record<string,unknown>>();
  return { ...actual, moneyAPI: new Proxy({}, { get: (_, key) => {
    /* The page is one read now (M2-3); it is built from the same two fakes so every count below holds. */
    if (key === 'page') return async () => {
      const [forecast, today] = await Promise.all([f.forecast(), f.today()]);
      return { forecast, today, ledger: [{ id: 't', amount: -5, currency: 'EUR', occurred_at: new Date().toISOString(), merchant_key: 'coffee' }], recurring: [], accounts: [], months: [], readings: [], categories: null, usage: null, capabilities: { bank: false, capture: false }, inbox: { receiving: false }, failed: [] };
    };
    if (key === 'forecast') return f.forecast;
    if (key === 'today') return f.today;
    if (key === 'ledger') return async () => [{ id: 't', amount: -5, currency: 'EUR', occurred_at: new Date().toISOString(), merchant_key: 'coffee' }];
    if (key === 'inbox') return async () => ({ receiving: false });
    if (key === 'refreshIfStale') return async () => ({ pulled: false });
    return async () => [];
  } }) };
});
import MoneyV2Page from '../../src/pages/money/MoneyV2Page';

const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML=''; });

it('does not paint the previous owner’s fresh Money snapshot after switching accounts', async () => {
  f.owner='A'; f.forecast.mockResolvedValue({ month:'2026-09-01',spent:5,days_left:13,committed:0,projected_p90:5 });
  f.today.mockResolvedValue({ amount:123.45,basis:'income',base:1000,income:1000,keep:0,free:100,budget:1000,days_left:13,today_events:[],sentence:'Account A private estimate',why:null });
  root=createRoot(host);
  await act(async () => { root.render(<MoneyV2Page />); });
  expect(f.forecast).toHaveBeenCalledOnce();
  const previousText=host.textContent;
  expect(previousText).toContain('123');
  await act(async () => root.unmount());
  f.owner='B';
  f.forecast.mockReturnValue(new Promise(() => {}));
  f.today.mockReturnValue(new Promise(() => {}));
  root=createRoot(host);
  await act(async () => { root.render(<MoneyV2Page />); });
  expect(f.forecast).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('123');
});


it('reloads a fresh snapshot immediately after a confirmed chat edit', async () => {
  const { moneyChanged } = await import('../../src/services/api/moneyChanges');
  f.owner = 'fresh-chat-owner';
  f.forecast.mockClear().mockResolvedValue({ month:'2026-09-01',spent:5,days_left:13,committed:0,projected_p90:5 });
  f.today.mockResolvedValue(null);
  root=createRoot(host);
  await act(async () => root.render(<MoneyV2Page />));
  expect(f.forecast).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  moneyChanged({ done: true });
  root=createRoot(host);
  await act(async () => root.render(<MoneyV2Page />));
  expect(f.forecast).toHaveBeenCalledTimes(2);
});


/* A mount that is interrupted and remounted on the same fiber is what StrictMode does on
   every mount, and what the app does whenever auth resolves mid-mount. The read the first
   mount started is cancelled by the unmount; the page has to read again rather than wait for
   an answer nobody will deliver (2026-09-18: /money sat on "Reading your month" for ever). */
it('paints after a mount that was interrupted and remounted', async () => {
  f.owner = 'interrupted-owner';
  f.forecast.mockClear().mockResolvedValue({ month:'2026-09-01',spent:5,days_left:13,committed:0,projected_p90:5 });
  f.today.mockClear().mockResolvedValue({ amount:42.5,basis:'income',base:1000,income:1000,keep:0,free:100,budget:1000,days_left:13,today_events:[],sentence:'Forty two and a half',why:null });
  root = createRoot(host);
  await act(async () => { root.render(<React.StrictMode><MoneyV2Page /></React.StrictMode>); });
  expect(host.textContent).toContain('42');
});

it('paints at once from what the tab kept, then reads again quietly', async () => {
  /* A reload or a return from the bank: the numbers of a moment ago, then the fresh ones. */
  f.owner = 'K';
  const { moneyRevision } = await import('../../src/services/api/moneyChanges');
  sessionStorage.setItem('twinme:money:page:K', JSON.stringify({ userId: 'K', revision: moneyRevision(), at: Date.now() - 120000, forecast: { month: '2026-09-01', spent: 5, days_left: 13, committed: 0, projected_p90: 5 }, today: { amount: 77.5, basis: 'income', base: 1000, income: 1000, keep: 0, free: 100, budget: 1000, days_left: 13, today_events: [], sentence: '' }, ledger: [{ id: 'k', amount: -5, currency: 'EUR', occurred_at: new Date().toISOString(), merchant_key: 'coffee' }], recurring: [], accounts: [], months: [], readings: [], categories: null, usage: null, capabilities: { bank: false, capture: false }, inbox: null, unread: false }));
  f.forecast.mockClear().mockReturnValue(new Promise(() => {}));
  f.today.mockClear().mockReturnValue(new Promise(() => {}));
  root = createRoot(host);
  await act(async () => { root.render(<MoneyV2Page />); });
  expect(host.textContent).toContain('77');
  expect(f.forecast).toHaveBeenCalledOnce();
  sessionStorage.removeItem('twinme:money:page:K');
});

it('never paints another person from what the tab kept', async () => {
  const { moneyRevision } = await import('../../src/services/api/moneyChanges');
  sessionStorage.setItem('twinme:money:page:K', JSON.stringify({ userId: 'K', revision: moneyRevision(), at: Date.now(), forecast: null, today: { amount: 77.5, basis: 'income', base: 1000, income: 1000, keep: 0, free: 100, budget: 1000, days_left: 13, today_events: [], sentence: '' }, ledger: [{ id: 'k', amount: -5, currency: 'EUR', occurred_at: new Date().toISOString(), merchant_key: 'coffee' }], recurring: [], accounts: [], months: [], readings: [], categories: null, usage: null, capabilities: { bank: false, capture: false }, inbox: null, unread: false }));
  f.owner = 'L';
  f.forecast.mockClear().mockReturnValue(new Promise(() => {}));
  f.today.mockClear().mockReturnValue(new Promise(() => {}));
  root = createRoot(host);
  await act(async () => { root.render(<MoneyV2Page />); });
  expect(host.textContent).not.toContain('77');
  sessionStorage.removeItem('twinme:money:page:K');
});
