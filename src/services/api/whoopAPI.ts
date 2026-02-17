/**
 * Whoop API Module (Health & Fitness Data)
 */

import { API_URL, getAuthHeaders } from './apiBase';

export interface WhoopStatus {
  connected: boolean;
  tokenExpired: boolean;
  lastSync: string | null;
  connectedAt: string | null;
  status?: string;
}

export interface WhoopCurrentState {
  recovery: {
    score: number | null;
    label: string;
    components: {
      hrv: number | null;
      rhr: number | null;
      sleepQuality: number | null;
    };
  };
  sleep: {
    hours: number | null;
    efficiency: number | null;
    quality: string;
  };
  strain: {
    current: number | null;
    max: number;
    label: string;
  };
  recommendations: {
    activityCapacity: string;
    optimalBedtime: string | null;
    recoveryNeeded: boolean;
    message: string;
  };
}

export const whoopAPI = {
  /**
   * Get Whoop connection status
   * Note: Now uses Nango for connection management. Status is checked via Nango connections API.
   */
  getStatus: async (): Promise<WhoopStatus> => {
    const response = await fetch(`${API_URL}/health/whoop/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Whoop status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Get current health state from Whoop
   * Note: Now uses Nango for authentication. Token refresh is handled automatically by Nango.
   */
  getCurrentState: async (): Promise<WhoopCurrentState> => {
    const response = await fetch(`${API_URL}/health/whoop/current-state`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Whoop authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('Whoop not connected. Please connect your Whoop account first.');
      }
      throw new Error(`Failed to fetch Whoop current state: ${response.statusText}`);
    }

    const data = await response.json();
    return data.currentState || data;
  },

  /**
   * @deprecated Use NangoConnect component instead. Whoop now uses Nango for OAuth.
   * Legacy method - kept for backwards compatibility but not used.
   */
  connect: (returnUrl?: string): string => {
    const userId = localStorage.getItem('user_id') || '';
    const baseUrl = `${API_URL}/health/connect/whoop?userId=${encodeURIComponent(userId)}`;
    return returnUrl ? `${baseUrl}&returnUrl=${encodeURIComponent(returnUrl)}` : baseUrl;
  },

  /**
   * @deprecated Use NangoConnect component's disconnect instead. Whoop now uses Nango.
   * Legacy method - kept for backwards compatibility but not used.
   */
  disconnect: async (): Promise<void> => {
    const userId = localStorage.getItem('user_id') || '';
    const response = await fetch(`${API_URL}/health/disconnect/whoop`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to disconnect Whoop: ${response.statusText}`);
    }
  },
};
