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
