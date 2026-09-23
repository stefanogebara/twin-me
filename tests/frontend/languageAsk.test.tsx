// @vitest-environment jsdom
/**
 * The language step writes the choice into the cached user the moment it is kept: the
 * snapshot only refreshes with the token, so the sheet asked again on the next load and the
 * pages stayed in English after the choice (a stranger walk, 2026-09-23).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ save: vi.fn(async () => {}), patch: vi.fn(), done: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'U', preferred_language: null }, patchUser: f.patch }) }));
vi.mock('@/lib/language', async (original) => ({ ...(await original<Record<string, unknown>>()), saveLanguage: f.save }));
vi.mock('@/lib/i18n', () => ({ useT: () => (s: string) => s }));
import LanguageAsk from '../../src/components/LanguageAsk';

const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML = ''; vi.clearAllMocks(); });

it('keeps the choice on the account and in the cached user, then closes', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<LanguageAsk onDone={f.done} />); });
  const radios = [...host.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];
  const spanish = radios.find((r) => /Espa/.test(r.textContent || ''));
  expect(spanish).toBeTruthy();
  await act(async () => { spanish!.click(); });
  const go = [...host.querySelectorAll('button')].find((b) => /Continue/.test(b.textContent || '')) as HTMLButtonElement;
  await act(async () => { go.click(); });
  expect(f.save).toHaveBeenCalledWith('es');
  expect(f.patch).toHaveBeenCalledWith({ preferred_language: 'es' });
  expect(f.done).toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
