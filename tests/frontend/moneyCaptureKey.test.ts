/** "Make a key" and onboarding's capture step ask the money route; /api-keys left with the twin. */
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ webFetch: vi.fn() }));
vi.mock('../../src/services/api/apiBase', () => ({
  authFetch: f.webFetch, getAuthHeaders: () => ({}), getAccessToken: () => 'token',
  sessionExpected: () => false, accessTokenReady: async () => 'token', API_URL: '/api',
}));
import { moneyAPI } from '../../src/services/api/moneyAPI';

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.clearAllMocks());

it('asks POST /money/capture-key and hands back the key alone', async () => {
  f.webFetch.mockResolvedValue(answer({ success: true, data: { key: 'twm_abc' } }));
  await expect(moneyAPI.createCaptureKey()).resolves.toBe('twm_abc');
  expect(f.webFetch).toHaveBeenCalledOnce();
  expect(f.webFetch).toHaveBeenCalledWith('/money/capture-key', expect.objectContaining({ method: 'POST' }));
});

it('fails when the server refuses or the answer carries no key', async () => {
  f.webFetch.mockResolvedValueOnce(answer({ success: false, error: 'Internal server error' }, 500));
  await expect(moneyAPI.createCaptureKey()).rejects.toThrow('Internal server error');
  f.webFetch.mockResolvedValueOnce(answer({ success: true, data: {} }));
  await expect(moneyAPI.createCaptureKey()).rejects.toThrow();
});
