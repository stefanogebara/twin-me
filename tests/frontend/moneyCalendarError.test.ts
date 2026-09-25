import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ webFetch: vi.fn() }));
vi.mock('../../src/services/api/apiBase', () => ({
  authFetch: f.webFetch, getAuthHeaders: () => ({}), getAccessToken: () => 'token',
  sessionExpected: () => false, accessTokenReady: async () => 'token', API_URL: '/api',
}));
import { moneyAPI } from '../../src/services/api/moneyAPI';

beforeEach(() => vi.clearAllMocks());

describe('web calendar recovery metadata', () => {
  const api = moneyAPI;
  const fetcher = f.webFetch;
  it('rejects a failed read with its explicit reconnect metadata', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Calendar unavailable', needsReconnect: true }), { status: 502 }));
    await expect(api.calendar()).rejects.toMatchObject({ message: 'Calendar unavailable', status: 502, needsReconnect: true });
  });

  it.each([undefined, false, 'true'])('does not request reconnect without boolean true', async (needsReconnect) => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Calendar unavailable', needsReconnect }), { status: 502 }));
    const error = await api.calendar().catch((reason: Error & { needsReconnect?: boolean }) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty('needsReconnect');
  });

  it('does not copy calendar recovery metadata onto an unrelated endpoint error', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Accounts unavailable', needsReconnect: true }), { status: 502 }));
    const error = await api.accounts().catch((reason: Error) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty('needsReconnect');
  });

  it('returns successful calendar data unchanged', async () => {
    const data = { connected: false, ahead: [] };
    fetcher.mockResolvedValue(new Response(JSON.stringify({ success: true, data })));
    await expect(api.calendar()).resolves.toEqual(data);
  });
});
