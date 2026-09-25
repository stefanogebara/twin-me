// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ history: vi.fn(), stream: vi.fn(() => vi.fn()), attach: vi.fn(), draft: 'Passed draft' }));
vi.mock('../../src/services/api/moneyAPI', () => ({
  moneyChat: { history: f.history, stream: f.stream, attach: f.attach },
  moneyAPI: { questions: async () => ({ opening: [], fromLedger: [] }), chatOpeners: async () => [] },
}));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: { draft: f.draft } }), useNavigate: () => vi.fn() }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => true }));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('@/lib/i18n', () => ({ useLocale: () => 'en', useT: () => (s: string) => s }));
vi.mock('../../src/pages/money/chat/useLedgerTrace', () => ({ useLedgerTrace: () => ({ steps: [], reading: false }) }));
import { useConversation, type Conversation } from '../../src/pages/money/chat/useConversation';

function deferred() {
  let resolve!: (rows: unknown[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let c: Conversation;
let renders: number;
let root: ReturnType<typeof createRoot> | null;
let host: HTMLDivElement;
function Harness() { c = useConversation(); renders++; return null; }
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn(); host = document.createElement('div'); document.body.append(host); renders = 0; });
afterEach(async () => { await act(async () => root?.unmount()); root = null; host.remove(); vi.useRealTimers(); });
async function mount() { root = createRoot(host); await act(async () => { root!.render(<Harness />); }); }

it('waits for kept history before sending or attaching and preserves the draft', async () => {
  const read = deferred(); f.history.mockReturnValue(read.promise); await mount();
  expect(c.historyLoading).toBe(true); expect(c.asking).toBe(false); expect(c.offersShown).toBe(false);
  expect(c.text).toBe('Passed draft');
  await act(async () => { c.setText('Typed draft'); });
  await act(async () => { c.ask(c.text); await c.attach(new File(['test'], 'receipt.pdf')); });
  expect(f.stream).not.toHaveBeenCalled(); expect(f.attach).not.toHaveBeenCalled();
  expect(c.text).toBe('Typed draft'); expect(c.lines).toEqual([]);
  await act(async () => { read.resolve([{ id: '1', role: 'user', text: 'Earlier question' }, { id: '2', role: 'twin', text: 'Earlier answer' }]); });
  expect(c.historyLoading).toBe(false); expect(c.text).toBe('Typed draft');
  await act(async () => { c.ask(c.text); });
  expect(f.stream).toHaveBeenCalledWith('Typed draft', [{ role: 'user', text: 'Earlier question' }, { role: 'twin', text: 'Earlier answer' }], expect.any(Object));
});

it('unblocks an empty saved conversation', async () => {
  const read = deferred(); f.history.mockReturnValue(read.promise); await mount();
  await act(async () => { read.resolve([]); });
  expect(c.historyLoading).toBe(false); expect(c.historyFailed).toBe(false);
  f.attach.mockResolvedValue({ said: 'Read it', receipts: [] });
  await act(async () => { await c.attach(new File(['test'], 'receipt.pdf')); });
  expect(f.attach).toHaveBeenCalled();
});

it('exposes the existing history warning and unblocks after a rejected read', async () => {
  const read = deferred(); f.history.mockReturnValue(read.promise); await mount();
  await act(async () => { read.reject(new Error('Unavailable')); });
  expect(c.historyFailed).toBe(true); expect(c.historyLoading).toBe(false); expect(c.text).toBe('Passed draft');
  await act(async () => { c.ask(c.text); });
  expect(f.stream).toHaveBeenCalledWith('Passed draft', [], expect.any(Object));
});

it('ignores a stale history read after unmount while another conversation loads', async () => {
  const old = deferred(); f.history.mockReturnValue(old.promise); await mount();
  await act(async () => { root!.unmount(); }); root = null;
  const fresh = deferred(); f.history.mockReturnValue(fresh.promise); await mount();
  const before = renders;
  await act(async () => { old.resolve([{ id: 'old', role: 'user', text: 'Stale account' }]); });
  expect(renders).toBe(before); expect(c.lines).toEqual([]); expect(c.historyLoading).toBe(true);
  await act(async () => { fresh.resolve([]); });
  expect(c.historyLoading).toBe(false);
});

it.each(['resolve', 'reject'] as const)('releases a stalled history read after 15 seconds and ignores its late %s', async (outcome) => {
  vi.useFakeTimers();
  const read = deferred(); f.history.mockReturnValue(read.promise); await mount();
  await act(async () => { c.setText('Kept while waiting'); await vi.advanceTimersByTimeAsync(14_999); });
  expect(c.historyLoading).toBe(true); expect(c.historyFailed).toBe(false);
  await act(async () => { c.ask(c.text); });
  expect(f.stream).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(c.historyLoading).toBe(false); expect(c.historyFailed).toBe(true); expect(c.text).toBe('Kept while waiting');
  await act(async () => { c.ask(c.text); });
  expect(f.stream).toHaveBeenCalledWith('Kept while waiting', [], expect.any(Object));
  const transcript = c.lines;
  await act(async () => {
    if (outcome === 'resolve') read.resolve([{ id: 'old', role: 'user', text: 'Late history' }]);
    else read.reject(new Error('Late failure'));
  });
  expect(c.lines).toBe(transcript); expect(c.historyFailed).toBe(true); expect(c.historyLoading).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['resolve', 'reject', 'unmount'] as const)('clears the history deadline after %s', async (outcome) => {
  vi.useFakeTimers();
  const read = deferred(); f.history.mockReturnValue(read.promise); await mount();
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => {
    if (outcome === 'resolve') read.resolve([]);
    else if (outcome === 'reject') read.reject(new Error('Unavailable'));
    else { root!.unmount(); root = null; }
  });
  expect(vi.getTimerCount()).toBe(0);
  const before = renders;
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(renders).toBe(before);
  if (outcome === 'resolve') expect(c.historyFailed).toBe(false);
  if (outcome === 'unmount') {
    await act(async () => { read.resolve([{ id: 'old', role: 'user', text: 'Late unmounted history' }]); });
    expect(renders).toBe(before);
  }
});
