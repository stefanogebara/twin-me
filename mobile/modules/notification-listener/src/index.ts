import { NativeModule, requireNativeModule } from 'expo';
import type { NotificationEntry } from '../../../src/types';

export type { NotificationEntry };

export interface NotificationStatsModuleType extends NativeModule {
  /**
   * Returns true if the BIND_NOTIFICATION_LISTENER_SERVICE permission
   * has been granted via Settings > Notifications > Notification access.
   */
  hasNotificationPermission(): boolean;

  /**
   * Opens Settings > Notifications > Notification access so the user
   * can grant permission.
   */
  requestNotificationPermission(): void;

  /**
   * Returns aggregated notification counts accumulated since the last
   * call to clearStats() (or app install).
   *
   * Each entry: { packageName, appName, hour, count }
   * Privacy: notification CONTENT is never stored — only metadata.
   */
  getNotificationStats(): Promise<NotificationEntry[]>;

  /**
   * Clears all stored notification counters. Call after uploading to
   * avoid double-counting on the next sync cycle.
   */
  clearStats(): void;
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
    const mod = getModule();
    if (!mod) return [];
    return mod.getNotificationStats();
  },

  clearStats(): void {
    getModule()?.clearStats();
  },
};
