import { NativeModule, requireNativeModule } from 'expo';
import type { AppUsageEntry, NotificationEntry, AndroidUsageData } from '../../../src/types';

export type { AppUsageEntry, NotificationEntry, AndroidUsageData };

export interface UsageStatsModuleType extends NativeModule {
  /**
   * Returns true if the PACKAGE_USAGE_STATS special permission has been granted.
   * Does NOT require any runtime permission — just checks AppOps.
   */
  hasUsagePermission(): boolean;

  /**
   * Opens Android Settings > Apps > Special app access > Usage access
   * so the user can grant the PACKAGE_USAGE_STATS permission.
   */
  requestUsagePermission(): void;

  /**
   * Returns app usage stats for the last `hours` hours (default 24).
   * Requires PACKAGE_USAGE_STATS permission.
   */
  getAppUsage(hours?: number): Promise<AppUsageEntry[]>;

  /**
   * Returns total screen-on time in milliseconds for the last `hours` hours.
   * Requires PACKAGE_USAGE_STATS permission.
   */
  getScreenOnTimeMs(hours?: number): Promise<number>;

  /**
   * Collects everything in one call.
   * Requires PACKAGE_USAGE_STATS permission.
   */
  getAndroidUsageData(hours?: number): Promise<AndroidUsageData>;
}

let _module: UsageStatsModuleType | null = null;

function getModule(): UsageStatsModuleType | null {
  if (_module) return _module;
  try {
    _module = requireNativeModule('UsageStats') as UsageStatsModuleType;
    return _module;
  } catch {
    // Not available on iOS or when native module is not linked
    return null;
  }
}

export const UsageStatsModule = {
  hasUsagePermission(): boolean {
    return getModule()?.hasUsagePermission() ?? false;
  },

  requestUsagePermission(): void {
    getModule()?.requestUsagePermission();
  },

  async getAppUsage(hours = 24): Promise<AppUsageEntry[]> {
    const mod = getModule();
    if (!mod) return [];
    return mod.getAppUsage(hours);
  },

  async getScreenOnTimeMs(hours = 24): Promise<number> {
    const mod = getModule();
    if (!mod) return 0;
    return mod.getScreenOnTimeMs(hours);
  },

  async getAndroidUsageData(hours = 24): Promise<AndroidUsageData> {
    const mod = getModule();
    if (!mod) {
      return {
        capturedAt: new Date().toISOString(),
        appUsage: [],
        notificationPatterns: [],
        screenOnTimeMs: 0,
      };
    }
    return mod.getAndroidUsageData(hours);
  },
};
