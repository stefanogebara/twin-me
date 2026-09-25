// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ sightings: vi.fn() }));
vi.mock('@/services/api/moneyAPI', async original => ({ ...await original<Record<string, unknown>>(), moneyAPI: { sightings: f.sightings } }));
import Ledger from '../../src/pages/money/views/month/Ledger';
import type { MoneyAccount } from '../../src/pages/money/useMoneyAccount';
const row = { id: 'payment', merchant_name: 'Test cafe', merchant_key: 'test cafe', amount: -5, currency: 'EUR', occurred_at: '2026-09-25T12:00:00Z' };
const account = (id = 'A') => ({ user: { id }, t: (s: string) => s, locale: 'en-GB', ledger: [row], byMonth: [{ key: '2026-09', rows: [row] }], pairMax: 0, todayDay: 25, verdict: vi.fn(), seen: {} } as unknown as MoneyAccount);
const host = document.createElement('div'); document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML = ''; f.sightings.mockReset(); });
const click = async (label: string) => { const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(label)); expect(button).toBeTruthy(); await act(async () => button!.click()); };
async function open() { root = createRoot(host); await act(async () => root.render(<Ledger m={account()} />)); await click('September'); await click('Test cafe'); }

it('distinguishes pending, failed and empty evidence, then retries successfully without closing the payment', async () => {
  let reject!: (error: Error) => void;
  f.sightings.mockImplementationOnce(() => new Promise((_, no) => { reject = no; })).mockResolvedValueOnce([]);
  await open();
  expect(host.textContent).toContain('Reading the receipts.');
  await act(async () => reject(new Error('Database unavailable')));
  expect(host.textContent).toContain('Could not read these receipts.');
  expect(host.textContent).not.toContain('No receipt kept for this one.');
  expect(host.textContent).not.toContain('Reading the receipts.');
  await click('Try again');
  expect(host.textContent).toContain('No receipt kept for this one.');
  expect(host.textContent).not.toContain('Could not read these receipts.');
  expect(f.sightings).toHaveBeenCalledTimes(2);
});

it('does not start duplicate reads when a pending row is closed and reopened', async () => {
  f.sightings.mockReturnValue(new Promise(() => {}));
  await open(); await click('Test cafe'); await click('Test cafe');
  expect(f.sightings).toHaveBeenCalledTimes(1);
});

it('discards evidence and delayed reads when the signed-in owner changes', async () => {
  let finish!: (rows: unknown[]) => void;
  f.sightings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([]);
  await open();
  await act(async () => root.render(<Ledger m={account('B')} />));
  await act(async () => finish([{ id: 'private', source: 'bankfeed', seen_at: '2026-09-25', raw_text: 'A private receipt' }]));
  await click('September'); await click('Test cafe');
  expect(host.textContent).not.toContain('A private receipt');
  expect(host.textContent).toContain('No receipt kept for this one.');
});

it.each([undefined, { unexpected: true }])('treats malformed successful evidence as failure and allows retry: %j', async value => {
  f.sightings.mockResolvedValueOnce(value).mockResolvedValueOnce([]);
  await open();
  expect(host.textContent).toContain('Could not read these receipts.');
  expect(host.textContent).not.toContain('Reading the receipts.');
  await click('Try again');
  expect(host.textContent).toContain('No receipt kept for this one.');
});
