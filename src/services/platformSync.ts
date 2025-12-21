/**
 * Platform Sync Service
 *
 * Centralized service for managing platform connections and sync status.
 * Provides real-time status updates across the application.
 */

import { PlatformConnection } from './soulSignature';
import { DEMO_PLATFORM_CONNECTIONS } from './demoDataService';

// API URL configuration (already includes /api)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Check if demo mode is active
 */
function isDemoMode(): boolean {
  return localStorage.getItem('demo_mode') === 'true';
}

export interface PlatformStatus {
  platform: string;
  displayName: string;
  category: 'personal' | 'professional' | 'creative';
  connected: boolean;
  connectedAt?: Date;
  lastSync?: Date;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  errorMessage?: string;
  dataPoints: number;
  dataQuality: 'high' | 'medium' | 'low';
  nextSyncAt?: Date;
  icon?: string;
  // Activity scoring fields
  activityScore?: number; // 0-100
  activityLevel?: 'none' | 'minimal' | 'moderate' | 'active' | 'power_user';
  activityLabel?: string;
  contentVolume?: number;
}

// MVP Platform definitions - Spotify, Google Calendar, Whoop
export const PLATFORM_DEFINITIONS: Record<string, Omit<PlatformStatus, 'connected' | 'syncStatus' | 'dataPoints' | 'dataQuality'>> = {
  // MVP Platforms
  spotify: {
    platform: 'spotify',
    displayName: 'Spotify',
    category: 'personal',
    icon: '🎵'
  },
  google_calendar: {
    platform: 'google_calendar',
    displayName: 'Google Calendar',
    category: 'professional',
    icon: '📅'
  },
  whoop: {
    platform: 'whoop',
    displayName: 'Whoop',
    category: 'personal',
    icon: '💪'
  }
};

/**
 * Fetch platform connections from the backend
 * DEMO MODE SUPPORT: Returns demo data merged with real database counts
 */
export async function fetchPlatformConnections(userId?: string): Promise<PlatformStatus[]> {
  // DEMO MODE: Fetch real data counts from database and merge with demo connections
  if (isDemoMode()) {
    console.log('[platformSync] 🎭 Demo mode active - fetching real data counts');

    try {
      const demoUserId = localStorage.getItem('demo_user_id') || 'a483a979-cf85-481d-b65b-af396c2c513a';
      const response = await fetch(`${API_URL}/test-extraction/data-counts/${demoUserId}`);

      if (response.ok) {
        const { platformCounts, totalDataPoints } = await response.json();
        console.log('[platformSync] ✅ Real data counts fetched:', platformCounts);

        // Transform demo data and merge with real counts
        const demoStatuses = transformDemoPlatformData(DEMO_PLATFORM_CONNECTIONS);
        return demoStatuses.map(status => ({
          ...status,
          dataPoints: platformCounts[status.platform] || 0
        }));
      }
    } catch (error) {
      console.error('[platformSync] ⚠️ Failed to fetch real counts, using demo data:', error);
    }

    // Fallback to demo data without real counts
    return transformDemoPlatformData(DEMO_PLATFORM_CONNECTIONS);
  }

  try {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const response = await fetch(`${API_URL}/platforms/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch platform connections');
    }

    const data = await response.json();
    return transformPlatformData(data.platforms || []);
  } catch (error) {
    console.error('Error fetching platform connections:', error);
    // Return default state with known platforms
    return Object.values(PLATFORM_DEFINITIONS).map(def => ({
      ...def,
      connected: false,
      syncStatus: 'idle' as const,
      dataPoints: 0,
      dataQuality: 'low' as const
    }));
  }
}

/**
 * Transform backend platform data to frontend format
 */
function transformPlatformData(backendData: any[]): PlatformStatus[] {
  const statuses: PlatformStatus[] = [];

  // Add all defined platforms
  Object.values(PLATFORM_DEFINITIONS).forEach(def => {
    const backendPlatform = backendData.find(p =>
      p.platform?.toLowerCase() === def.platform ||
      p.name?.toLowerCase() === def.platform
    );

    statuses.push({
      ...def,
      connected: backendPlatform?.connected || false,
      connectedAt: backendPlatform?.connected_at ? new Date(backendPlatform.connected_at) : undefined,
      lastSync: backendPlatform?.last_sync ? new Date(backendPlatform.last_sync) : undefined,
      syncStatus: backendPlatform?.sync_status || 'idle',
      errorMessage: backendPlatform?.error_message,
      dataPoints: backendPlatform?.data_points || 0,
      dataQuality: backendPlatform?.data_quality || 'low',
      nextSyncAt: backendPlatform?.next_sync_at ? new Date(backendPlatform.next_sync_at) : undefined,
      // Activity scoring data
      activityScore: backendPlatform?.activity_score,
      activityLevel: backendPlatform?.activity_level,
      activityLabel: backendPlatform?.activity_label,
      contentVolume: backendPlatform?.content_volume
    });
  });

  return statuses;
}

/**
 * Transform demo platform data to frontend format
 */
function transformDemoPlatformData(demoData: any[]): PlatformStatus[] {
  const statuses: PlatformStatus[] = [];

  // Add all defined platforms
  Object.values(PLATFORM_DEFINITIONS).forEach(def => {
    const demoPlatform = demoData.find(p => p.platform?.toLowerCase() === def.platform);

    statuses.push({
      ...def,
      connected: demoPlatform?.connected || false,
      connectedAt: demoPlatform?.connectedAt ? new Date(demoPlatform.connectedAt) : undefined,
      lastSync: demoPlatform?.lastSync ? new Date(demoPlatform.lastSync) : undefined,
      syncStatus: demoPlatform?.syncStatus || 'idle',
      errorMessage: demoPlatform?.errorMessage,
      dataPoints: demoPlatform?.extractedDataPoints || 0,
      dataQuality: demoPlatform?.dataQuality || 'low',
      nextSyncAt: demoPlatform?.nextSyncAt ? new Date(demoPlatform.nextSyncAt) : undefined
    });
  });

  return statuses;
}

/**
 * Convert PlatformStatus to PlatformConnection for soul signature calculations
 */
export function toPlatformConnections(statuses: PlatformStatus[]): PlatformConnection[] {
  return statuses.map(status => ({
    id: status.platform,
    platform: status.platform,
    connected: status.connected,
    lastSync: status.lastSync,
    dataQuality: status.dataQuality,
    extractedDataPoints: status.dataPoints
  }));
}

/**
 * Get platforms by category
 */
export function getPlatformsByCategory(
  statuses: PlatformStatus[],
  category: 'personal' | 'professional' | 'creative'
): PlatformStatus[] {
  return statuses.filter(s => s.category === category);
}

/**
 * Get connected platforms only
 */
export function getConnectedPlatforms(statuses: PlatformStatus[]): PlatformStatus[] {
  return statuses.filter(s => s.connected);
}

/**
 * Get platforms that need syncing (connected but haven't synced recently)
 */
export function getPlatformsNeedingSync(statuses: PlatformStatus[]): PlatformStatus[] {
  const now = Date.now();
  const SYNC_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

  return statuses.filter(s => {
    if (!s.connected) return false;
    if (!s.lastSync) return true;
    return (now - s.lastSync.getTime()) > SYNC_THRESHOLD;
  });
}

/**
 * Trigger a platform sync
 * DEMO MODE SUPPORT: Calls test-extraction endpoint to generate realistic data
 */
export async function syncPlatform(platform: string): Promise<boolean> {
  // DEMO MODE: Call test-extraction endpoint to generate and store real data
  if (isDemoMode()) {
    console.log(`[platformSync] 🎭 Demo mode active - triggering test extraction for ${platform}`);

    try {
      // Get demo user ID from localStorage or use default
      const demoUserId = localStorage.getItem('demo_user_id') || 'a483a979-cf85-481d-b65b-af396c2c513a';

      // Only Spotify, YouTube, and GitHub have test extraction endpoints (for now)
      const supportedTestPlatforms = ['spotify', 'youtube', 'github'];
      if (!supportedTestPlatforms.includes(platform.toLowerCase())) {
        console.log(`[platformSync] ⚠️ Test extraction not yet implemented for ${platform}`);
        return true; // Return success for unsupported platforms in demo
      }

      const response = await fetch(`${API_URL}/test-extraction/${platform.toLowerCase()}/${demoUserId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[platformSync] ❌ Test extraction failed for ${platform}:`, errorData);
        return false;
      }

      const result = await response.json();
      console.log(`[platformSync] ✅ Test extraction succeeded for ${platform}:`, {
        itemsExtracted: result.itemsExtracted,
        jobId: result.jobId
      });

      return true;
    } catch (error) {
      console.error(`[platformSync] ❌ Error during test extraction for ${platform}:`, error);
      return false;
    }
  }

  try {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const response = await fetch(`${API_URL}/platforms/sync/${platform}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to sync ${platform}`);
    }

    return true;
  } catch (error) {
    console.error(`Error syncing platform ${platform}:`, error);
    return false;
  }
}

/**
 * Trigger sync for all connected platforms
 */
export async function syncAllPlatforms(): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  try {
    const statuses = await fetchPlatformConnections();
    const connectedPlatforms = getConnectedPlatforms(statuses);

    const results = await Promise.allSettled(
      connectedPlatforms.map(p => syncPlatform(p.platform))
    );

    const success = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.length - success;
    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message || 'Unknown error');

    return { success, failed, errors };
  } catch (error) {
    console.error('Error syncing all platforms:', error);
    return { success: 0, failed: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
}

/**
 * Get a human-readable sync status message
 */
export function getSyncStatusMessage(status: PlatformStatus): string {
  switch (status.syncStatus) {
    case 'syncing':
      return 'Syncing data...';
    case 'success':
      return status.lastSync
        ? `Last synced ${getRelativeTime(status.lastSync)}`
        : 'Sync completed';
    case 'error':
      return status.errorMessage || 'Sync failed';
    case 'idle':
    default:
      return status.connected
        ? 'Ready to sync'
        : 'Not connected';
  }
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}
