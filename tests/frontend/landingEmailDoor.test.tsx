// @vitest-environment jsdom
/**
 * The front door's email field leads to sign-in with the address filled in. It used to
 * call POST /api/discovery/scan, which left with the twin and answers 410, so every
 * visitor who typed an email met an error (audit A1, 2026-09-25).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ navigate: vi.fn(), scan: vi.fn(), trackFunnel: vi.fn(), fetch: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...(await original<Record<string, unknown>>()), useNavigate: () => f.navigate }));
vi.mock('../../src/contexts/AnalyticsContext', () => ({ useAnalytics: () => ({ trackFunnel: f.trackFunnel }) }));
vi.mock('../../src/services/enrichmentService', () => ({ discoveryScan: f.scan }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => ({ signInWithOAuth: vi.fn(), isSignedIn: false, isLoaded: true }) }));
import NocturneLanding from '../../src/pages/nocturne/NocturneLanding';
import CustomAuth from '../../src/pages/CustomAuth';

const host = document.createElement('div');
document.body.append(host);
let root: ReturnType<typeof createRoot>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => { vi.stubGlobal('fetch', f.fetch); });
afterEach(async () => { await act(async () => root?.unmount()); host.innerHTML = ''; vi.clearAllMocks(); vi.unstubAllGlobals(); });

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function submit(form: HTMLFormElement) {
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

it('sends the visitor to sign-in with their email, and calls nothing', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter><NocturneLanding /></MemoryRouter>); });
  const form = host.querySelector('form.fd-prompt') as HTMLFormElement;
  await type(form.querySelector('input[type="email"]') as HTMLInputElement, ' ana@example.com ');
  await submit(form);
  expect(f.navigate).toHaveBeenCalledWith('/auth?email=ana%40example.com');
  expect(f.scan).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
});

it('stays put and says why when the address is not an email', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter><NocturneLanding /></MemoryRouter>); });
  const form = host.querySelector('form.fd-prompt') as HTMLFormElement;
  await type(form.querySelector('input[type="email"]') as HTMLInputElement, 'not-an-email');
  await submit(form);
  expect(f.navigate).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Enter a valid email address.');
});

it('sign-in starts with the email the front door handed it, and ignores anything else', async () => {
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter initialEntries={['/auth?email=ana%40example.com']}><CustomAuth /></MemoryRouter>); });
  expect((host.querySelector('input[type="email"]') as HTMLInputElement).value).toBe('ana@example.com');
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter initialEntries={['/auth?email=%3Cscript%3E']}><CustomAuth /></MemoryRouter>); });
  expect((host.querySelector('input[type="email"]') as HTMLInputElement).value).toBe('');
});
