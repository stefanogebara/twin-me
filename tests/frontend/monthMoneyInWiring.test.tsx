// @vitest-environment jsdom
/**
 * The page read carries the month from both sides, and Month says it (2026-09-26): the line
 * under the month's figure and the payers under it, from the payload's own `flows`. While the
 * payments await review the month's figures are withheld, and so is this.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ owner: 'money-in-a', reconciliation: { state: 'clear', unresolvedCount: 0, revision: 0 } as Record<string, unknown>, flows: null as unknown }));
/* A person per test: the page keeps its last read for half a minute, keyed by the person. */
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: f.owner, name: f.owner } }) }));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('@/lib/i18n', () => ({ useLocale: () => 'en-GB', useT: () => (s: string, holes: Record<string, unknown> = {}) => s.replace(/\{([^}]+)\}/g, (_, key) => String(holes[key] ?? key)) }));
vi.mock('react-router-dom', () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/pages/money/HomeAsk', () => ({ default: () => null }));
vi.mock('@/pages/money/MoneyNav', () => ({ default: () => null }));
vi.mock('@/components/Wait', () => ({ default: () => null }));
vi.mock('@/pages/money/figures/MonthOrbits', () => ({ default: () => null }));
vi.mock('@/services/api/moneyAPI', async (original) => {
  const actual = await original<Record<string, unknown>>();
  return { ...actual, moneyAPI: new Proxy({}, { get: (_, key) => {
    if (key === 'page') return async () => ({
      reconciliation: f.reconciliation,
      forecast: { month: '2026-09-01', spent: 99.95, days_left: 10, committed: 0, projected_p10: 99.95, projected_p50: 99.95, projected_p90: 99.95 },
      today: null, ledger: [], recurring: [], accounts: [], months: [], readings: [], categories: null, usage: null,
      capabilities: { bank: false, capture: false }, inbox: { receiving: false }, facts: [], seen: {}, sources: null, flows: f.flows, failed: [],
    });
    if (key === 'refreshIfStale') return async () => ({ pulled: false });
    return async () => [];
  } }) };
});
import MoneyV2Page from '../../src/pages/money/MoneyV2Page';

const september = {
  month: '2026-09-01', money_in: 1215, money_out: 99.95, net: 1115.05,
  sources: [{ key: 'acme sl', name: 'Acme', amount: 1200, count: 1, last_at: '2026-09-01T09:00:00Z' }, { key: 'ana lopez', name: 'Ana Lopez', amount: 15, count: 1, last_at: '2026-09-03T20:00:00Z' }],
  more_sources: 0, more_amount: 0,
};
const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root?.unmount()); host.innerHTML = '';
  sessionStorage.clear();
  f.reconciliation = { state: 'clear', unresolvedCount: 0, revision: 0 };
});

it('shows the month\'s money in beside its money out, and where it came from, from the page read', async () => {
  f.owner = 'money-in-a';
  f.flows = { ...september, months: [september] };
  root = createRoot(host);
  await act(async () => { root.render(<MoneyV2Page view="month" />); });
  const line = host.querySelector('#month-flows')?.textContent?.replace(/\u00a0/g, ' ');
  expect(line).toBe('1215,00 \u20ac in, 99,95 \u20ac out, 1115,05 \u20ac more in than out.');
  const rows = [...host.querySelectorAll('#came-in ol.mv-list > li .mv-item-title')].map((n) => n.textContent);
  expect(rows).toEqual(['Acme', 'Ana Lopez']);
});

it('withholds it while payments await review, with every other figure of the month', async () => {
  f.owner = 'money-in-b';
  f.flows = { ...september, months: [september] };
  f.reconciliation = { state: 'pending', unresolvedCount: 2, revision: 3 };
  root = createRoot(host);
  await act(async () => { root.render(<MoneyV2Page view="month" />); });
  expect(host.textContent).toContain('Recorded payments below exclude observations awaiting review.');
  expect(host.querySelector('#month-flows')).toBeNull();
  expect(host.querySelector('#came-in')).toBeNull();
});

it('says nothing when the server sent no flows at all', async () => {
  f.owner = 'money-in-c';
  f.flows = undefined;
  root = createRoot(host);
  await act(async () => { root.render(<MoneyV2Page view="month" />); });
  expect(host.querySelector('h1')?.textContent).toContain('99,95');
  expect(host.querySelector('#month-flows')).toBeNull();
  expect(host.querySelector('#came-in')).toBeNull();
});
