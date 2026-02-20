/**
 * Goals API Module
 *
 * Client for the Twin-Driven Goal Tracking system.
 * Endpoints: /goals/*
 */

import { authFetch } from './apiBase';

// --- Types ---

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  category: string; // sleep, fitness, focus, schedule, balance
  source_platform: string | null;
  source_observation: string | null;
  metric_type: string;
  target_value: number | null;
  target_operator: string;
  target_unit: string | null;
  measurement_window: string;
  status: 'suggested' | 'active' | 'completed' | 'abandoned' | 'expired';
  start_date: string | null;
  end_date: string | null;
  duration_days: number;
  current_streak: number;
  best_streak: number;
  total_days_tracked: number;
  total_days_met: number;
  last_progress_check: string | null;
  last_mentioned_at: string | null;
  celebration_delivered: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GoalProgress {
  id: string;
  goal_id: string;
  tracked_date: string;
  measured_value: number | null;
  target_met: boolean;
  source_data: Record<string, unknown>;
  created_at: string;
}

export interface GoalWithProgress extends Goal {
  progress: GoalProgress[];
}

export interface GoalSummary {
  active: number;
  suggested: number;
  completed: number;
  bestStreak: number;
  categories: string[];
}

// --- API Methods ---

export const goalsAPI = {
  /**
   * Get goals filtered by status
   */
  getGoals: async (status?: string): Promise<Goal[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const response = await authFetch(`/goals${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch goals: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data ?? [];
  },

  /**
   * Get goal suggestions from the twin
   */
  getSuggestions: async (): Promise<Goal[]> => {
    const response = await authFetch('/goals/suggestions');

    if (!response.ok) {
      throw new Error(`Failed to fetch goal suggestions: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data ?? [];
  },

  /**
   * Get goals summary (counts, streaks, categories)
   */
  getSummary: async (): Promise<GoalSummary> => {
    const response = await authFetch('/goals/summary');

    if (!response.ok) {
      throw new Error(`Failed to fetch goals summary: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Get a single goal with its progress history
   */
  getGoal: async (id: string): Promise<GoalWithProgress> => {
    const response = await authFetch(`/goals/${encodeURIComponent(id)}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch goal: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Accept a suggested goal (moves it to active)
   */
  acceptGoal: async (id: string): Promise<Goal> => {
    const response = await authFetch(`/goals/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to accept goal: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Dismiss a suggested goal
   */
  dismissGoal: async (id: string): Promise<void> => {
    const response = await authFetch(`/goals/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to dismiss goal: ${response.statusText}`);
    }
  },

  /**
   * Abandon an active goal
   */
  abandonGoal: async (id: string): Promise<Goal> => {
    const response = await authFetch(`/goals/${encodeURIComponent(id)}/abandon`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to abandon goal: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  },
};
