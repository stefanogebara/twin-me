/**
 * Training API Module
 */

import { API_URL, getAuthHeaders } from './apiBase';

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
      ? `${API_URL}/training/status?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/training/status`;

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
    const response = await fetch(`${API_URL}/training/start`, {
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
    const response = await fetch(`${API_URL}/training/stop`, {
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
    const response = await fetch(`${API_URL}/training/reset`, {
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
