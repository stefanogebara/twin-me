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

export interface ActivityItem {
  id: string;
  type: 'connection' | 'analysis' | 'twin_created' | 'training' | 'sync';
  message: string;
  timestamp: string;
  icon?: string;
}

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

  /**
   * Get recent activity feed
   */
  getActivity: async (limit: number = 10): Promise<ActivityItem[]> => {
    const response = await fetch(`${API_URL}/dashboard/activity?limit=${limit}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.statusText}`);
    }

    const data = await response.json();
    return data.activity || data;
  },
};
