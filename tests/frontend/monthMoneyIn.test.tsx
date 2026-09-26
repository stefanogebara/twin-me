// @vitest-environment jsdom
/**
 * Month shows money in beside money out (2026-09-26): one line of figures under the month's
 * own, the payers under an ink rule, five at most and the rest as one row, and nothing at all
 * for a month with no money in. The figures are the server's; the page adds nothing up.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/components/Wait', () => ({ default: () => null }));
vi.mock('@/pages/money/figures/MonthOrbits', () => ({ default: () => null }));
import MonthHero from '../../src/pages/money/views/month/MonthHero';
import CameIn from '../../src/pages/money/views/month/CameIn';
import Ledger from '../../src/pages/money/views/month/Ledger';
import type { MoneyAccount } from '../../src/pages/money/useMoneyAccount';
import type { MoneyFlows } from '../../src/services/api/moneyAPI';

const t = (s: string, holes: Record<string, unknown> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(holes[k] ?? `{${k}}`));
const source = (key: string, name: string, amount: number, count = 1, last_at = '2026-09-03T20:00:00Z') => ({ key, name, amount, count, last_at });
const september = {
  month: '2026-09-01', money_in: 1279.95, money_out: 119.95, net: 1160,
  sources: [source('acme sl', 'ACME SL', 1200, 1, '2026-09-01T09:00:00Z'), source('ana lopez', 'Ana Lopez', 40, 2), source('zara', 'Zara', 39.95, 1, '2026-09-06T12:00:00Z')],
  more_sources: 0, more_amount: 0,
};
const flows: MoneyFlows = { ...september, months: [september, { month: '2026-08-01', money_in: 1750, money_out: 1600, net: 150, sources: [], more_sources: 0, more_amount: 0 }] };
const account = (over: Record<string, unknown> = {}) => ({
  t, locale: 'en-GB', loaded: true, user: { id: 'owner' },
  forecast: { month: '2026-09-01', spent: 99.95 }, today: null, ledger: [], months: [], categories: null, recurring: [],
  monthKey: '2026-09', monthRows: [], incomeEdge: null, todayDay: 20, pairMax: 0, last: 30, monthLabel: 'September', zone: 'Europe/Madrid',
  reconciliation: { state: 'clear', unresolvedCount: 0, revision: 1 }, flows, byMonth: [], verdict: vi.fn(), seen: {},
  ...over,
} as unknown as MoneyAccount);

const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML = ''; });
async function paint(node: React.ReactNode) { root = createRoot(host); await act(async () => root.render(<>{node}</>)); }
const text = () => (host.textContent || '').replace(/\u00a0/g, ' ');

it('puts the month\'s money in, money out and the difference on one line under its figure', async () => {
  await paint(<MonthHero m={account()} />);
  const h1 = host.querySelector('h1');
  const line = host.querySelector('#month-flows');
  expect(h1?.textContent).toContain('September');
  expect(line?.previousElementSibling).toBe(h1);
  expect(line?.textContent?.replace(/\u00a0/g, ' ')).toBe('1279,95 \u20ac in, 119,95 \u20ac out, 1160,00 \u20ac more in than out.');
});

it('says so when more went out than came in, and draws both figures when they are level', async () => {
  await paint(<MonthHero m={account({ flows: { ...flows, money_in: 50, money_out: 80, net: -30 } })} />);
  expect(text()).toContain('50,00 \u20ac in, 80,00 \u20ac out, 30,00 \u20ac more out than in.');
  await act(async () => root.unmount());
  await paint(<MonthHero m={account({ flows: { ...flows, money_in: 80, money_out: 80, net: 0 } })} />);
  expect(host.querySelector('#month-flows')?.textContent?.replace(/\u00a0/g, ' ')).toBe('80,00 \u20ac in, 80,00 \u20ac out.');
});

it('lists where the money came from under an ink rule, largest first, with its total', async () => {
  await paint(<CameIn m={account()} />);
  expect(host.querySelector('h2')?.textContent).toBe('Where it came from this month.');
  expect(text()).toContain('1279,95 \u20ac in all, largest first.');
  const rows = [...host.querySelectorAll('ol.mv-list > li')].map((li) => li.textContent?.replace(/\u00a0/g, ' '));
  /* Named the way every row on the page is named (merchantLabel): a bank's capitals become a name. */
  expect(rows).toEqual(['Acme sl1 Sept1200,00 \u20ac', 'Ana Lopez2 payments, the last on 3 Sept40,00 \u20ac', 'Zara6 Sept39,95 \u20ac']);
});

it('names five payers at most, and the rest as one row with the server\'s own sum', async () => {
  const five = [1, 2, 3, 4, 5].map((n) => source(`p${n}`, `Payer ${n}`, 100 - n));
  await paint(<CameIn m={account({ flows: { ...flows, sources: five, more_sources: 3, more_amount: 42.5 } })} />);
  const rows = [...host.querySelectorAll('ol.mv-list > li')];
  expect(rows).toHaveLength(6);
  expect(rows[5].textContent?.replace(/\u00a0/g, ' ')).toBe('and 3 more42,50 \u20ac');
});

it('says nothing for a month with no money in: no line, no list, no zero', async () => {
  const none = { ...flows, money_in: 0, money_out: 45.5, net: -45.5, sources: [] };
  await paint(<><MonthHero m={account({ flows: none })} /><CameIn m={account({ flows: none })} /></>);
  expect(host.querySelector('#month-flows')).toBeNull();
  expect(host.querySelector('#came-in')).toBeNull();
  expect(text()).not.toMatch(/0,00 \u20ac in/);
});

it('says nothing when the flows could not be read or the month is not the page\'s', async () => {
  await paint(<><MonthHero m={account({ flows: null })} /><CameIn m={account({ flows: null })} /></>);
  expect(host.querySelector('#month-flows')).toBeNull();
  expect(host.querySelector('#came-in')).toBeNull();
  await act(async () => root.unmount());
  await paint(<><MonthHero m={account({ monthKey: '2026-10' })} /><CameIn m={account({ monthKey: '2026-10' })} /></>);
  expect(host.querySelector('#month-flows')).toBeNull();
  expect(host.querySelector('#came-in')).toBeNull();
});

it('gives the ledger\'s month the same money in as the line above it', async () => {
  const row = { id: 'pay', merchant_name: 'ACME SL', merchant_key: 'acme sl', amount: 1200, currency: 'EUR', occurred_at: '2026-09-01T09:00:00Z' };
  /* The month's own segment still counts a move between two of the person's accounts. */
  const segment = { month: '2026-09-01', spent: 99.95, received: 1579.95, lines: 4, days_covered: 20, days_in_month: 30, complete: false, biggest: null };
  await paint(<Ledger m={account({ ledger: [row], byMonth: [{ key: '2026-09', rows: [row], segment }, { key: '2026-07', rows: [row], segment: { ...segment, month: '2026-07-01', received: 12, complete: true } }] })} />);
  const months = [...host.querySelectorAll('ol.mv-list > li')].map((li) => li.textContent?.replace(/\u00a0/g, ' '));
  expect(months[0]).toContain('1 payment in 20 of 30 days, 1279,95 \u20ac in');
  expect(months[0]).not.toContain('1579,95');
  /* A month the flows do not carry keeps its own figure. */
  expect(months[1]).toContain('1 payment, 12,00 \u20ac in');
});
