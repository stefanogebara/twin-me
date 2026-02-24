/**
 * Background Sync Service
 * =======================
 * Registers an Expo background-fetch task that fires every 6 hours.
 * On each run it:
 *  1. Reads the stored auth token from SecureStore
 *  2. Collects real app-usage data via UsageStatsModule (native Android module)
 *     and notification patterns via NotificationListenerModule.
 *     Falls back to empty payload gracefully on Expo Go / iOS.
 *  3. POSTs to /api/imports/gdpr with platform=android_usage
 *  4. Updates LAST_SYNC in SecureStore
 *  5. Clears notification counters after successful upload (no double-counting)
 *
 * PERMISSIONS REQUIRED:
 *  - PACKAGE_USAGE_STATS  → Settings > Apps > Special app access > Usage access
 *  - BIND_NOTIFICATION_LISTENER_SERVICE → Settings > Notifications > Notification access
 * Both are user-granted via the Settings screen (no runtime permission dialog).
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { USAGE_SYNC_TASK, STORAGE_KEYS } from '../constants';
import { uploadAndroidUsage } from './api';
import type { AndroidUsageData } from '../types';
import { UsageStatsModule } from '../native/UsageStatsModule';
import { NotificationListenerModule } from '../native/NotificationListenerModule';

// ---------------------------------------------------------------------------
// Task definition (must be at module top level)
// ---------------------------------------------------------------------------

TaskManager.defineTask(USAGE_SYNC_TASK, async () => {
  try {
    const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const data = await collectUsageData();
    await uploadAndroidUsage(data);

    // Clear notification counters only after successful upload
    NotificationListenerModule.clearStats();

    await SecureStore.setItemAsync(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

    console.log('[BackgroundSync] Usage data uploaded successfully');
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error('[BackgroundSync] Error:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ---------------------------------------------------------------------------
// Collect usage data — merges UsageStats + notification patterns
// ---------------------------------------------------------------------------

async function collectUsageData(): Promise<AndroidUsageData> {
  const [usageData, notificationPatterns] = await Promise.all([
    UsageStatsModule.getAndroidUsageData(24),
    NotificationListenerModule.getNotificationStats(),
  ]);

  // Merge notification patterns from the native listener into the payload.
  // UsageStatsModule already collects a proxy via SHORTCUT_INVOCATION events;
  // the real NotificationListenerService data is richer and takes precedence
  // when available (non-empty).
  return {
    ...usageData,
    notificationPatterns:
      notificationPatterns.length > 0
        ? notificationPatterns
        : usageData.notificationPatterns,
  };
}

// ---------------------------------------------------------------------------
// Registration helpers
// ---------------------------------------------------------------------------

const SYNC_INTERVAL_SECONDS = 6 * 60 * 60; // 6 hours

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();

  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted
    || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    console.warn('[BackgroundSync] Background fetch is not available on this device.');
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(USAGE_SYNC_TASK);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(USAGE_SYNC_TASK, {
    minimumInterval: SYNC_INTERVAL_SECONDS,
    stopOnTerminate: false,
    startOnBoot: true,
  });

  console.log('[BackgroundSync] Task registered, interval:', SYNC_INTERVAL_SECONDS, 'seconds');
}

export async function unregisterBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(USAGE_SYNC_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(USAGE_SYNC_TASK);
    console.log('[BackgroundSync] Task unregistered');
  }
}
