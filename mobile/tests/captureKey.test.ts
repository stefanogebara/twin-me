import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  secrets: new Map<string,string>(), remove: vi.fn(), request: vi.fn(), setSession: vi.fn(), clear: vi.fn(), setKey: vi.fn(), supported: true,
}));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device',
  getItemAsync: async (k: string) => f.secrets.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { f.secrets.set(k,v); },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { removeItem: f.remove } }));
vi.mock('../src/constants', () => ({ API_URL: 'https://example.invalid/api' }));
vi.mock('../src/native/NotificationListenerModule', () => ({ NotificationListenerModule: {
  supportsCaptureSession: () => f.supported, setCaptureSession: f.setSession, clearCaptureSession: f.clear, setCaptureKey: f.setKey,
} }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); f.secrets.clear(); f.supported=true; vi.stubGlobal('fetch', f.request); });
const load = async () => ({ ...await import('../src/services/captureSession'), ...await import('../src/services/captureKey') });
const response = (key: string) => ({ ok: true, json: async () => ({ key }) });

describe('capture account lifecycle', () => {
  it('never hands A’s saved key to B and removes the unowned legacy credential', async () => {
    const m = await load();
    f.request.mockResolvedValueOnce(response('twm_A')).mockResolvedValueOnce(response('twm_B'));
    m.activateCaptureSession('A','jwt-A'); await m.ensureCaptureKey('A');
    m.detachCaptureSession();
    expect(f.clear).toHaveBeenCalledOnce();
    m.activateCaptureSession('B','jwt-B'); await m.ensureCaptureKey('B');
    expect(f.setKey.mock.calls).toEqual([['A','twm_A'],['B','twm_B']]);
    expect(f.remove).toHaveBeenCalledWith('twinme_money_capture_key');
  });
  it('drops a key response that arrives after logout/account switching', async () => {
    const m = await load();
    let resolve!: (v: ReturnType<typeof response>) => void;
    f.request.mockReturnValue(new Promise((r) => { resolve = r; }));
    m.activateCaptureSession('A','jwt-A');
    const pending = m.ensureCaptureKey('A');
    await vi.waitFor(() => expect(f.request).toHaveBeenCalled());
    m.detachCaptureSession(); m.activateCaptureSession('B','jwt-B');
    resolve(response('twm_A'));
    expect(await pending).toBeNull();
    expect(f.setKey).not.toHaveBeenCalled();
  });
  it('coalesces simultaneous setup calls, and only explicitly creates an iOS shortcut key', async () => {
    const m = await load();
    f.request.mockResolvedValue(response('twm_A'));
    m.activateCaptureSession('A','jwt-A');
    await Promise.all([m.ensureCaptureKey('A'),m.ensureCaptureKey('A')]);
    expect(f.request).toHaveBeenCalledOnce();
    f.supported=false; f.request.mockClear(); f.setKey.mockClear();
    await m.ensureCaptureKey('A');
    expect(f.request).not.toHaveBeenCalled();
    await m.ensureCaptureKey('A',{shortcut:true});
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.setKey).not.toHaveBeenCalled();
  });
  it('explicit renewal replaces a rejected stored key and resumes only that owner', async () => {
    const m = await load();
    f.request.mockResolvedValueOnce(response('twm_old')).mockResolvedValueOnce(response('twm_renewed'));
    m.activateCaptureSession('A','jwt-A');
    await m.ensureCaptureKey('A');
    expect(await m.ensureCaptureKey('A',{refresh:true})).toBe('twm_renewed');
    expect(f.setKey).toHaveBeenLastCalledWith('A','twm_renewed');
  });
});
