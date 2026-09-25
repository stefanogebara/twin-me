// @vitest-environment jsdom
/**
 * A Google Calendar consent comes back to /oauth/callback (2026-09-26).
 *
 * The page posted it to /connectors/callback, which left with the twin and answers 410, and it
 * sent no session with it. It now posts to the money API with the person's token, waiting for
 * the token when this browser knows a session, and goes back to the path the server returned,
 * never off the site.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/Wait', () => ({ default: ({ line }: { line?: string }) => <p>{line}</p> }));
vi.mock('@/contexts/AnalyticsContext', () => ({ useAnalytics: () => ({ trackFunnel: () => undefined }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import OAuthCallback from '../../src/pages/OAuthCallback';
import { clearAccessToken, setAccessToken } from '../../src/services/api/apiBase';

type Call = { url: string; method?: string; auth?: string; body?: unknown };

function Where() {
  const at = useLocation();
  return <p data-where={at.pathname + at.search}>{at.pathname + at.search}</p>;
}

let root: Root | null = null;
const host = document.createElement('div');
document.body.appendChild(host);

function answer(returnUrl: string) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers || {}) as Record<string, string>;
    calls.push({ url, method: init.method, auth: headers.Authorization, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ success: true, data: { returnUrl } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

async function open(code: string) {
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter initialEntries={[`/oauth/callback?code=${code}&state=connector.sealed`]}>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  ));
}
const where = () => host.querySelector('[data-where]')?.getAttribute('data-where') ?? null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  clearAccessToken();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('the calendar consent on /oauth/callback', () => {
  it('posts the code and state to the money API with the person\'s token, then goes back', async () => {
    setAccessToken('tok');
    const calls = answer('/money?calendar=connected');
    await open('code-a');
    await vi.waitFor(() => expect(where()).toBe('/money?calendar=connected'));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/money\/calendar\/callback$/);
    expect(calls[0].url).not.toMatch(/connectors/);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].auth).toBe('Bearer tok');
    expect(calls[0].body).toEqual({ code: 'code-a', state: 'connector.sealed' });
  });

  it('waits for the token when this browser knows a session, and only then posts', async () => {
    clearAccessToken();
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1' }));
    const calls = answer('/money?calendar=connected');
    await open('code-b');
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(0);
    await act(async () => { setAccessToken('late-tok'); });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].auth).toBe('Bearer late-tok');
    await vi.waitFor(() => expect(where()).toBe('/money?calendar=connected'));
  });

  it('never follows a way back off the site', async () => {
    setAccessToken('tok');
    answer('//evil.example/money');
    await open('code-c');
    await vi.waitFor(() => expect(where()).toBe('/money'));
  });
});
