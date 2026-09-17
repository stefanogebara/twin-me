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
  setCaptureSession(userId: string, token: string): void;
  clearCaptureSession(): void;
  failedCaptureCount(): number;
  /** The money capture key. Survives token expiry; see the Kotlin for why that matters. */
  setCaptureKey(userId: string, key: string): void;
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

  supportsCaptureSession(): boolean {
    return typeof getModule()?.setCaptureSession === 'function';
  },

  setCaptureSession(userId: string, token: string): void {
    getModule()?.setCaptureSession?.(userId, token);
  },

  clearCaptureSession(): void {
    const module = getModule();
    if (module?.clearCaptureSession) module.clearCaptureSession();
    else {
      // Detach older installed native builds until the owner installs this release.
      const legacy = module as unknown as { setAuthToken?: (s: string) => void; setCaptureKey?: (s: string) => void } | null;
      legacy?.setAuthToken?.('');
      legacy?.setCaptureKey?.('');
    }
  },

  setCaptureKey(userId: string, key: string): void {
    if (this.supportsCaptureSession()) getModule()?.setCaptureKey(userId, key);
  },

  failedCaptureCount(): number { return getModule()?.failedCaptureCount?.() ?? 0; },

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
