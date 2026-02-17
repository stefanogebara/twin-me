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
  getStats: async (userId?: string): Promise<DashboardStats> => {
    const url = userId
      ? `${API_URL}/dashboard/stats?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/dashboard/stats`;

    const response = await fetch(url, {
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
  getActivity: async (userId?: string, limit: number = 10): Promise<ActivityItem[]> => {
    const url = userId
      ? `${API_URL}/dashboard/activity?userId=${encodeURIComponent(userId)}&limit=${limit}`
      : `${API_URL}/dashboard/activity?limit=${limit}`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.statusText}`);
    }

    const data = await response.json();
    return data.activity || data;
  },
};
