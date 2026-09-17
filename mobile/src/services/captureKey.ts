/** Per-account, encrypted capture keys. The native listener receives only the active one. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { NotificationListenerModule } from '../native/NotificationListenerModule';
import { API_URL } from '../constants';
import { captureSession } from './captureSession';

const inFlight = new Map<string, Promise<string | null>>();

export function ensureCaptureKey(userId: string, { shortcut = false, refresh = false } = {}): Promise<string | null> {
  if (!userId || (!shortcut && !NotificationListenerModule.supportsCaptureSession())) return Promise.resolve(null);
  const session = captureSession();
  if (session.owner !== userId) return Promise.resolve(null);
  const purpose = shortcut ? 'shortcut' : 'android';
  const flightKey = `${userId}:${purpose}:${session.generation}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;
  const current = () => {
    const now = captureSession();
    return now.owner === userId && now.generation === session.generation;
  };
  const promise = (async () => {
    try {
      // The old device-wide plaintext key has no provable owner. Never reuse it.
      await AsyncStorage.removeItem('twinme_money_capture_key');
      const storageKey = `money_capture_${purpose}_${userId}`;
      let key = refresh ? null : await SecureStore.getItemAsync(storageKey);
      if (!current()) return null;
      if (!key) {
        const res = await fetch(`${API_URL}/api-keys`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({ name: shortcut ? 'Phone capture (iOS Shortcut)' : 'Phone capture (Android)' }),
        });
        if (!res.ok || !current()) return null;
        const body = await res.json();
        if (typeof body?.key !== 'string' || !body.key.startsWith('twm_') || !current()) return null;
        key = String(body.key);
        await SecureStore.setItemAsync(storageKey, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      }
      if (!current() || !key) return null;
      if (!shortcut) NotificationListenerModule.setCaptureKey(userId, key);
      return key;
    } catch { return null; }
  })().finally(() => { inFlight.delete(flightKey); });
  inFlight.set(flightKey, promise);
  return promise;
}

export function pendingCaptures(): number {
  try { return NotificationListenerModule.pendingCaptureCount(); } catch { return 0; }
}
export function failedCaptures(): number {
  try { return NotificationListenerModule.failedCaptureCount(); } catch { return 0; }
}
