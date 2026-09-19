// @vitest-environment jsdom
/**
 * The onboarding decides its step from what the page already read (M2-3): handed the
 * accounts, the facts and the capabilities, it reads nothing; told they are on their way, it
 * shows nothing yet; on a page without them it reads for itself, as before.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ accounts: vi.fn(async () => []), facts: vi.fn(async () => []), capabilities: vi.fn(async () => ({ bank: true, capture: false })) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'U', preferred_language: 'en' } }) }));
vi.mock('@/lib/i18n', () => ({ useLocale: () => 'en-GB', useT: () => (s: string, holes: Record<string, unknown> = {}) => s.replace(/\{([^}]+)\}/g, (_, key) => String(holes[key] ?? key)) }));
vi.mock('@/components/LanguageAsk', () => ({ default: () => null }));
vi.mock('@/services/api/moneyAPI', async (original) => {
  const actual = await original<Record<string, unknown>>();
  return { ...actual, moneyAPI: new Proxy({}, { get: (_, key) => (key === 'accounts' ? f.accounts : key === 'facts' ? f.facts : key === 'capabilities' ? f.capabilities : async () => []) }) };
});
import MoneyOnboarding from '../../src/components/MoneyOnboarding';

const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML = ''; vi.clearAllMocks(); localStorage.clear(); });

it('reads nothing when handed the page’s read, and shows the step it implies', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<MoneyOnboarding given={{ accounts: [], facts: [], capabilities: { bank: true, capture: false } }} />); });
  expect(f.accounts).not.toHaveBeenCalled();
  expect(f.facts).not.toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Connect your bank.');
});

it('shows nothing while the page’s read is on its way, and nothing when a part could not be read', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<MoneyOnboarding given={null} />); });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { root.render(<MoneyOnboarding given={{ accounts: null, facts: [], capabilities: { bank: true, capture: false } }} />); });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(f.accounts).not.toHaveBeenCalled();
});

it('reads for itself on a page that hands it nothing', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<MoneyOnboarding />); });
  expect(f.accounts).toHaveBeenCalledOnce();
  expect(f.facts).toHaveBeenCalledOnce();
  expect(f.capabilities).toHaveBeenCalledOnce();
});
