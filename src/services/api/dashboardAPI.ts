/**
 * Dashboard API Module
 */

import { API_URL, getAuthHeaders } from './apiBase';

export interface DashboardStats {
  connectedPlatforms: number;
  totalDataPoints: number;
  soulSignatureProgress: number;
  lastSync: string | null;
  trainingStatus: 'idle' | 'training' | 'ready';
}

// ActivityItem + getActivity removed 2026-05-26: the backend /dashboard/activity
// route was end-to-end dead (no emitters of any of the 5 event_types it
// switched on, broken is_active filter in fallback) and zero components
// called this getter. See dashboard.js audit-2026-05-26.

export const dashboardAPI = {
  /**
   * Get dashboard statistics
   */
  getStats: async (): Promise<DashboardStats> => {
    const response = await fetch(`${API_URL}/dashboard/stats`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard stats: ${response.statusText}`);
    }

    const data = await response.json();
    return data.stats || data;
  },
};
