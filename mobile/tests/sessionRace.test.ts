import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ values: new Map<string,string>(), fetch: vi.fn(), emit: vi.fn(), detach: vi.fn() }));
vi.mock('react-native', () => ({ DeviceEventEmitter: { emit: f.emit } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => f.values.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { f.values.set(k,v); },
  deleteItemAsync: async (k: string) => { f.values.delete(k); },
}));
vi.mock('../src/constants', () => ({ API_URL: 'https://example.invalid', OAUTH_API_URL: 'https://example.invalid', STORAGE_KEYS: { AUTH_TOKEN: 'token', AUTH_REFRESH_TOKEN: 'refresh', USER: 'user' } }));
vi.mock('../src/services/captureSession', () => ({ detachCaptureSession: f.detach }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); f.values.clear(); vi.stubGlobal('fetch', f.fetch); });

it('a successful refresh arriving after logout cannot restore credentials', async () => {
  const api = await import('../src/services/api');
  f.values.set('refresh','refresh-A');
  let complete!: (v: unknown) => void;
  f.fetch.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const pending = api.refreshSession();
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
  await api.clearStoredSession();
  complete({ ok: true, status: 200, json: async () => ({ accessToken: 'jwt-A', refreshToken: 'new-A', user: { id: 'A', email: 'a@example.invalid' } }) });
  expect(await pending).toBeNull();
  expect(f.values.size).toBe(0);
});

it('a refused old refresh cannot sign out a newly established account', async () => {
  const api = await import('../src/services/api');
  const session = await import('../src/services/sessionEpoch');
  f.values.set('refresh','refresh-A');
  let complete!: (v: unknown) => void;
  f.fetch.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const pending = api.refreshSession();
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
  const epoch = session.invalidateSession();
  await session.writeSession(epoch, async () => { f.values.set('token','jwt-B'); f.values.set('refresh','refresh-B'); });
  complete({ status: 401 });
  expect(await pending).toBeNull();
  expect(f.values.get('token')).toBe('jwt-B');
  expect(f.emit).not.toHaveBeenCalled();
});
