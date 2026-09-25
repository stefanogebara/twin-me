import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/services/api', () => ({ authFetch: f.fetch }));
vi.mock('../src/constants', () => ({ API_URL: '/api', STORAGE_KEYS: {} }));
vi.mock('expo-secure-store', () => ({}));
import { moneyApi } from '../src/services/moneyApi';

beforeEach(() => vi.clearAllMocks());

describe('native calendar recovery metadata', () => {
  it('rejects a failed read with its explicit reconnect metadata', async () => {
    f.fetch.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Calendar unavailable', needsReconnect: true }), { status: 502 }));
    await expect(moneyApi.calendar()).rejects.toMatchObject({ message: 'Calendar unavailable', status: 502, needsReconnect: true });
  });

  it.each([undefined, false, 'true'])('does not request reconnect without boolean true', async (needsReconnect) => {
    f.fetch.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Calendar unavailable', needsReconnect }), { status: 502 }));
    const error = await moneyApi.calendar().catch((reason: Error) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty('needsReconnect');
  });

  it('does not copy calendar recovery metadata onto an unrelated endpoint error', async () => {
    f.fetch.mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Accounts unavailable', needsReconnect: true }), { status: 502 }));
    const error = await moneyApi.accounts().catch((reason: Error) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty('needsReconnect');
  });

  it('returns successful calendar data unchanged', async () => {
    const data = { connected: false, ahead: [] };
    f.fetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data })));
    await expect(moneyApi.calendar()).resolves.toEqual(data);
  });
});
