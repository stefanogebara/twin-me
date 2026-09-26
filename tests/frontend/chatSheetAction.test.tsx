// @vitest-environment jsdom
/**
 * The month offered as a file under an answer is saved by the browser, from the server's own
 * export, with the person's token; nothing is posted to the ledger and the offer stays for a
 * second download (2026-09-26).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ history: vi.fn(async () => []), stream: vi.fn(), act: vi.fn(), save: vi.fn() }));
vi.mock('../../src/services/api/moneyAPI', () => ({
  moneyChat: { history: f.history, stream: f.stream, attach: vi.fn(), act: f.act },
  moneyAPI: { questions: async () => ({ opening: [], fromLedger: [] }), chatOpeners: async () => [] },
}));
vi.mock('../../src/pages/money/monthSheet', () => ({ saveMonthSheet: f.save }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }), useNavigate: () => vi.fn() }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => true }));
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('@/lib/i18n', () => ({ useLocale: () => 'en', useT: () => (s: string) => s }));
vi.mock('../../src/pages/money/chat/useLedgerTrace', () => ({ useLedgerTrace: () => ({ steps: [], reading: false }) }));
import { useConversation, type Conversation } from '../../src/pages/money/chat/useConversation';

let c: Conversation;
let root: ReturnType<typeof createRoot> | null;
let host: HTMLDivElement;
function Harness() { c = useConversation(); return null; }
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn(); host = document.createElement('div'); document.body.append(host); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; host.remove(); });

const sheet = { kind: 'sheet', month: '2026-09', label: 'Download September as a spreadsheet' };
async function answered() {
  root = createRoot(host);
  await act(async () => { root!.render(<Harness />); });
  f.stream.mockImplementation((_m: string, _h: unknown, handlers: { onEvent: (e: unknown) => void; onEnd: (ok: boolean) => void }) => {
    handlers.onEvent({ phase: 'text', delta: 'September as a spreadsheet.' });
    handlers.onEvent({ phase: 'actions', actions: [sheet], receipts: [] });
    handlers.onEvent({ phase: 'done' });
    handlers.onEnd(true);
    return () => {};
  });
  await act(async () => { c.ask('Create an Excel file of my September spending.'); });
  return c.lines.find((l) => l.who === 'twin')!;
}

it('saves the month the offer names, and posts nothing to the ledger', async () => {
  f.save.mockResolvedValue(undefined);
  const line = await answered();
  await act(async () => { await c.take(line.id, sheet); });
  expect(f.save).toHaveBeenCalledWith('2026-09');
  expect(f.act).not.toHaveBeenCalled();
  const after = c.lines.find((l) => l.id === line.id)!;
  expect(after.actions).toEqual([sheet]);
  expect(after.acted).toBeUndefined();
});

it('keeps a month offered as a file across a reload, and no other offer', async () => {
  f.history.mockResolvedValueOnce([
    { id: '1', role: 'user', text: 'Create an Excel file of my September spending.' },
    { id: '2', role: 'twin', text: 'September as a spreadsheet.', actions: [sheet, { kind: 'not_me', transaction_id: 't1', label: 'Not mine' }] },
    { id: '3', role: 'twin', text: 'Noted.', actions: [{ kind: 'remember', text: 'x', label: 'Remember this' }] },
  ]);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness />); });
  expect(c.lines.find((l) => l.id === 'kept-2')!.actions).toEqual([sheet]);
  expect(c.lines.find((l) => l.id === 'kept-3')!.actions).toBeUndefined();
});

it('says so when the file could not be made, and keeps the offer to try again', async () => {
  f.save.mockRejectedValue(new Error('The sheet could not be made.'));
  const line = await answered();
  await act(async () => { await c.take(line.id, sheet); });
  const after = c.lines.find((l) => l.id === line.id)!;
  expect(after.acted).toBe('The sheet could not be made. Try again.');
  expect(after.actions).toEqual([sheet]);
});
