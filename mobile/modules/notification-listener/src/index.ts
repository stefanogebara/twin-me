import { NativeModule, requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';
import type { NotificationEntry } from '../../../src/types';

export type { NotificationEntry };

export interface PurchaseEvent {
  packageName: string;
  appName: string;
  text: string;
  amount: string; // e.g. "R$60" or "" if not parsed
}

export interface NotificationStatsModuleType extends NativeModule {
  hasNotificationPermission(): boolean;
  requestNotificationPermission(): void;
  getNotificationStats(): Promise<NotificationEntry[]>;
  clearStats(): void;
  setAuthToken(token: string): void;
  /** The money capture key. Survives token expiry; see the Kotlin for why that matters. */
  setCaptureKey(key: string): void;
  /** Captures held back because the phone could not reach the server. */
  pendingCaptureCount(): number;
  addListener(eventName: string, listener: (event: PurchaseEvent) => void): EventSubscription;
}

let _module: NotificationStatsModuleType | null = null;

function getModule(): NotificationStatsModuleType | null {
  if (_module) return _module;
  try {
    _module = requireNativeModule('NotificationStats') as NotificationStatsModuleType;
    return _module;
  } catch {
    return null;
  }
}

export const NotificationListenerModule = {
  hasNotificationPermission(): boolean {
    return getModule()?.hasNotificationPermission() ?? false;
  },

  requestNotificationPermission(): void {
    getModule()?.requestNotificationPermission();
  },

  async getNotificationStats(): Promise<NotificationEntry[]> {
    return getModule()?.getNotificationStats() ?? [];
  },

  clearStats(): void {
    getModule()?.clearStats();
  },

  setAuthToken(token: string): void {
    getModule()?.setAuthToken(token);
  },

  /**
   * The money capture key. Kept apart from the session token because this service runs for
   * months without the app being opened: a JWT would expire there quietly and take every
   * payment with it. Older native builds do not have it, hence the guard.
   */
  setCaptureKey(key: string): void {
    const module = getModule();
    if (module && typeof module.setCaptureKey === 'function') module.setCaptureKey(key);
  },

  /** Payments the phone is holding because it could not reach the server. */
  pendingCaptureCount(): number {
    const module = getModule();
    if (!module || typeof module.pendingCaptureCount !== 'function') return 0;
    return module.pendingCaptureCount();
  },

  addPurchaseListener(callback: (event: PurchaseEvent) => void): EventSubscription | null {
    return getModule()?.addListener('onPurchaseDetected', callback) ?? null;
  },
};
