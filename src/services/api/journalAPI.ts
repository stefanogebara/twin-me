/**
 * Journal API Module (Soul Journal)
 */

import { API_URL, getAuthHeaders } from './apiBase';

export interface JournalEntry {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  mood: 'happy' | 'calm' | 'anxious' | 'sad' | 'energized' | 'reflective' | 'grateful' | 'frustrated' | null;
  energy_level: number | null;
  tags: string[];
  is_analyzed: boolean;
  created_at: string;
  updated_at: string;
  journal_analyses?: JournalAnalysis[];
}

export interface JournalAnalysis {
  id: string;
  themes: string[];
  emotions: { emotion: string; intensity: number }[];
  personality_signals: { trait: string; direction: 'high' | 'low'; evidence: string }[];
  self_perception: { how_they_see_themselves: string; values_expressed: string[] };
  summary: string;
  created_at: string;
}

export interface JournalInsights {
  totalEntries: number;
  analyzedEntries: number;
  topThemes: { theme: string; count: number }[];
  avgEmotions: { emotion: string; avgIntensity: number; occurrences: number }[];
  moodDistribution: Record<string, number>;
  avgEnergy: number | null;
  valuesExpressed: string[];
  personalitySignals: { trait: string; direction: 'high' | 'low'; evidence: string }[];
  recentSummaries: string[];
}

export interface CreateJournalEntry {
  title?: string;
  content: string;
  mood?: string;
  energy_level?: number;
  tags?: string[];
}

export const journalAPI = {
  getEntries: async (page: number = 1, limit: number = 20): Promise<{ entries: JournalEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await fetch(`${API_URL}/journal/entries?page=${page}&limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to fetch journal entries: ${response.statusText}`);
    return response.json();
  },

  createEntry: async (entry: CreateJournalEntry): Promise<{ entry: JournalEntry }> => {
    const response = await fetch(`${API_URL}/journal/entries`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error(`Failed to create journal entry: ${response.statusText}`);
    return response.json();
  },

  updateEntry: async (id: string, entry: Partial<CreateJournalEntry>): Promise<{ entry: JournalEntry }> => {
    const response = await fetch(`${API_URL}/journal/entries/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error(`Failed to update journal entry: ${response.statusText}`);
    return response.json();
  },

  deleteEntry: async (id: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/journal/entries/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to delete journal entry: ${response.statusText}`);
    return response.json();
  },

  analyzeEntry: async (id: string): Promise<{ analysis: JournalAnalysis }> => {
    const response = await fetch(`${API_URL}/journal/entries/${id}/analyze`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to analyze journal entry: ${response.statusText}`);
    return response.json();
  },

  getInsights: async (): Promise<{ insights: JournalInsights }> => {
    const response = await fetch(`${API_URL}/journal/insights`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to fetch journal insights: ${response.statusText}`);
    return response.json();
  },
};
