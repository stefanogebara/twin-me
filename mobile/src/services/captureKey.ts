/**
 * The credential the phone's notification listener uses to send a payment.
 * =======================================================================
 * The listener runs in the background for months without the app being opened. A session
 * token would expire in that time, quietly, and every payment after that would vanish with
 * no error anybody would ever see: the ledger would simply stop growing on the days the
 * person most wanted it to. So the listener uses a capture key, which does not expire, and
 * which can be revoked on its own without touching a password.
 *
 * The key is minted once and kept on the device. The server shows it once and never again,
 * exactly like the web, so if this file loses it a new one has to be made.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationListenerModule } from '../native/NotificationListenerModule';
import { authFetch } from './api';

const STORAGE_KEY = 'twinme_money_capture_key';

/**
 * Hand the listener a capture key, minting one the first time. Safe to call on every login:
 * it mints at most once per device and does nothing at all when the native module is
 * missing, which is every iOS build, since Apple provides no way to read notifications.
 */
export async function ensureCaptureKey(): Promise<string | null> {
  const module = NotificationListenerModule;
  if (!module || typeof module.setCaptureKey !== 'function') return null;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      module.setCaptureKey(stored);
      return stored;
    }

    const res = await authFetch('/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Phone capture (Android)' }),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const key: string | undefined = body?.key;
    if (!key) return null;

    await AsyncStorage.setItem(STORAGE_KEY, key);
    module.setCaptureKey(key);
    return key;
  } catch {
    /* A phone with no network on the morning it is installed should not fail to open. The
       next login tries again, and until then the listener simply has nothing to send with. */
    return null;
  }
}

/** How many payments the phone is holding because it could not reach the server. */
export function pendingCaptures(): number {
  const module = NotificationListenerModule;
  if (!module || typeof module.pendingCaptureCount !== 'function') return 0;
  try {
    return module.pendingCaptureCount();
  } catch {
    return 0;
  }
}
