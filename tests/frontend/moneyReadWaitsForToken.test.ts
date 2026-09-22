// @vitest-environment jsdom
/** A money read made before the token exists leaves when it arrives, not before (M2-A, 2026-09-22). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, setAccessToken } from '../../src/services/api/apiBase';
import { moneyAPI } from '../../src/services/api/moneyAPI';

const ok = (body: unknown) => new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('moneyAPI before the token', () => {
  afterEach(() => { clearAccessToken(); vi.unstubAllGlobals(); localStorage.removeItem('auth_user'); });

  it('waits for the token for a person the browser knows, then sends it', async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization });
      return ok({ forecast: null, today: null, ledger: [], failed: [] });
    }));
    clearAccessToken();
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1' }));
    const read = moneyAPI.page('today');
    await Promise.resolve();
    expect(calls).toHaveLength(0);
    setAccessToken('tok');
    await read;
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/money/page?view=today');
    expect(calls[0].auth).toBe('Bearer tok');
  });

  it('does not wait for a stranger', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return ok({}); }));
    clearAccessToken();
    localStorage.removeItem('auth_user');
    await moneyAPI.page('today').catch(() => null);
    expect(calls).toHaveLength(1);
  });
});
