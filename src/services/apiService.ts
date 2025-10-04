/**
 * API Service Layer
 * Centralized API calls for frontend components
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AuthHeaders {
  'Content-Type': string;
  'Authorization'?: string;
}

const getAuthHeaders = (): AuthHeaders => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: AuthHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

// ====================================================================
// DASHBOARD API
// ====================================================================

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
      ? `${API_URL}/api/dashboard/stats?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/api/dashboard/stats`;

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
      ? `${API_URL}/api/dashboard/activity?userId=${encodeURIComponent(userId)}&limit=${limit}`
      : `${API_URL}/api/dashboard/activity?limit=${limit}`;

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

// ====================================================================
// TRAINING API
// ====================================================================

export interface TrainingMetrics {
  modelStatus: 'idle' | 'training' | 'ready' | 'error';
  accuracy: number;
  totalSamples: number;
  lastTraining: string | null;
  epochs: number;
  currentEpoch: number;
  connectedPlatforms?: number;
  progress?: number;
}

export interface TrainingStartResponse {
  success: boolean;
  message?: string;
  jobId?: string;
}

export const trainingAPI = {
  /**
   * Get current training status and metrics
   */
  getStatus: async (userId?: string): Promise<TrainingMetrics> => {
    const url = userId
      ? `${API_URL}/api/training/status?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/api/training/status`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch training status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.metrics || data;
  },

  /**
   * Start training the model
   */
  startTraining: async (userId?: string, epochs: number = 10): Promise<TrainingStartResponse> => {
    const response = await fetch(`${API_URL}/api/training/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, epochs }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start training: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Stop ongoing training
   */
  stopTraining: async (userId?: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/api/training/stop`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to stop training: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Reset the model
   */
  resetModel: async (userId?: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/api/training/reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to reset model: ${response.statusText}`);
    }

    return response.json();
  },
};

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================

/**
 * Generic API error handler
 */
export const handleAPIError = (error: any): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};
