/**
 * Onboarding Questionnaire API Module
 */

import { API_URL, getAuthHeaders } from './apiBase';

export interface OnboardingQuestion {
  id: string;
  category: string;
  question: string;
  options: {
    value: string;
    label: string;
    icon?: string;  // Lucide icon name
  }[];
}

export interface OnboardingAnswers {
  [questionId: string]: string;
}

export interface OnboardingPreferences {
  morning_person?: number;
  peak_hours?: string;
  novelty_seeking?: number;
  music_emotional_strategy?: string;
  stress_coping?: string;
  introversion?: number;
}

export interface OnboardingStatus {
  hasCompleted: boolean;
  completedAt: string | null;
  questionsAnswered: number;
  totalQuestions: number;
  percentComplete: number;
}

export const onboardingAPI = {
  /**
   * Get all onboarding questions
   */
  getQuestions: async (): Promise<{ questions: OnboardingQuestion[]; totalQuestions: number }> => {
    const response = await fetch(`${API_URL}/onboarding/questions`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch questions: ${response.statusText}`);
    }

    const data = await response.json();
    return { questions: data.questions, totalQuestions: data.totalQuestions };
  },

  /**
   * Get user's onboarding status
   */
  getStatus: async (): Promise<OnboardingStatus> => {
    const response = await fetch(`${API_URL}/onboarding/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get user's existing answers
   */
  getAnswers: async (): Promise<{
    hasCompleted: boolean;
    completedAt: string | null;
    answers: OnboardingAnswers;
    preferences: OnboardingPreferences | null;
  }> => {
    const response = await fetch(`${API_URL}/onboarding/answers`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch answers: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Save user's answers
   */
  saveAnswers: async (answers: OnboardingAnswers): Promise<{
    success: boolean;
    message: string;
    preferences: OnboardingPreferences;
  }> => {
    const response = await fetch(`${API_URL}/onboarding/answers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save answers: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Skip the questionnaire
   */
  skip: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/onboarding/skip`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to skip questionnaire: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Reset questionnaire (allow retaking)
   */
  reset: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/onboarding/answers`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to reset questionnaire: ${response.statusText}`);
    }

    return response.json();
  },
};
