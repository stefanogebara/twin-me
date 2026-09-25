// @vitest-environment jsdom
/* Exercise the real screen state and handlers; native primitives are replaced by DOM
   controls because this suite verifies evidence reads, not platform layout. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ fetch: vi.fn(), ledger: vi.fn(), total: 5, listeners: new Set<(state: string) => void>() }));
vi.mock('react-native', () => ({
  View: ({ children }: {children: React.ReactNode}) => <div>{children}</div>,
  ScrollView: ({ children }: {children: React.ReactNode}) => <div>{children}</div>,
  AppState: { currentState: 'active', addEventListener: (_: string, listener: (state: string) => void) => { f.listeners.add(listener); return { remove: () => f.listeners.delete(listener) }; } },
  RefreshControl: () => null, StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('../src/services/api', () => ({ authFetch: f.fetch }));
vi.mock('../src/services/moneyApi', () => ({ moneyApi: {
  ledger: async () => { f.ledger(); return [{id:'payment', merchant_name:'Test cafe',merchant_key:'test cafe',amount:-5,currency:'EUR',occurred_at:'2026-09-25T12:00:00Z'}]; },
  months: async () => [{month:'2026-09-01',spent:f.total}],
} }));
vi.mock('../src/ui/primitives', () => {
  const Text = ({ children }: {children: React.ReactNode}) => <span>{children}</span>;
  return { Body:Text, Display:Text, Enter:Text, Heading:Text, Label:Text, List:Text, Micro:Text, Page:Text, Small:Text,
    Row: ({label,onPress}:{label:string;onPress:()=>void}) => <button onClick={onPress}>{label}</button>,
    Pill: ({label,onPress}:{label:string;onPress:()=>void}) => <button onClick={onPress}>{label}</button>,
  };
});
import LedgerScreen from '../src/screens/LedgerScreen';
import { invalidateSession } from '../src/services/sessionEpoch';
const host = document.createElement('div'); document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML=''; f.fetch.mockReset(); f.ledger.mockClear(); f.total=5; });
const click = async (label: string) => { const button = [...host.querySelectorAll('button')].find(b => b.textContent === label); expect(button).toBeTruthy(); await act(async () => button!.click()); };
async function open() { root = createRoot(host); await act(async () => root.render(<LedgerScreen />)); await click('Test cafe'); }
const response = (data: unknown) => ({ok:true,json:async()=>({success:true,data})});

it('shows failed evidence and retries in place instead of reading forever', async () => {
  f.fetch.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(response([{id:'s',source:'bankfeed',seen_at:'2026-09-25',raw_text:'Recovered receipt'}]));
  await open();
  expect(host.textContent).toContain('Could not read these receipts.');
  expect(host.textContent).not.toContain('Reading the receipts.');
  await click('Try again');
  expect(host.textContent).toContain('Recovered receipt');
  expect(host.textContent).not.toContain('Could not read these receipts.');
});

it('treats an invalid response as failure, while an explicit empty list is empty', async () => {
  f.fetch.mockResolvedValueOnce(response(undefined)).mockResolvedValueOnce(response([]));
  await open(); expect(host.textContent).toContain('Could not read these receipts.');
  await click('Try again'); expect(host.textContent).toContain('No receipt kept for this one.');
});

it('deduplicates pending reads and discards receipts from the previous session', async () => {
  let finish!: (response: unknown) => void;
  f.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(response([]));
  await open();
  expect(host.textContent).toContain('Reading the receipts.');
  await click('Test cafe'); await click('Test cafe'); expect(f.fetch).toHaveBeenCalledTimes(1);
  await act(async () => { invalidateSession(); finish(response([{id:'private',source:'bankfeed',seen_at:'2026-09-25',raw_text:'Old private receipt'}])); });
  await click('Test cafe');
  expect(host.textContent).not.toContain('Old private receipt');
  expect(host.textContent).toContain('No receipt kept for this one.');
});


it('refreshes the visible ledger on foreground and tab return, with no duplicate initial read', async () => {
  root=createRoot(host);
  await act(async () => root.render(<LedgerScreen active />));
  expect(f.ledger).toHaveBeenCalledTimes(1);
  f.total=9;
  await act(async () => { f.listeners.forEach(fn=>fn('background')); f.listeners.forEach(fn=>fn('active')); });
  expect(f.ledger).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('9,00');
  await act(async () => root.render(<LedgerScreen active={false} />));
  await act(async () => { f.listeners.forEach(fn=>fn('background')); f.listeners.forEach(fn=>fn('active')); });
  expect(f.ledger).toHaveBeenCalledTimes(2);
  await act(async () => root.render(<LedgerScreen active />));
  expect(f.ledger).toHaveBeenCalledTimes(3);
});
