import { NativeModule, requireNativeModule, EventSubscription } from 'expo';
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

  addPurchaseListener(callback: (event: PurchaseEvent) => void): EventSubscription | null {
    return getModule()?.addListener('onPurchaseDetected', callback) ?? null;
  },
};
