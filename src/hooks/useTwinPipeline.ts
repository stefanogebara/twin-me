/**
 * useTwinPipeline Hook
 *
 * React hook for managing the twin formation pipeline.
 * Provides status tracking, extraction triggers, and pipeline management.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types for the pipeline
export interface PlatformStatus {
  platform: string;
  lastSync: string | null;
  lastSyncStatus: string | null;
  latestJob: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    itemsExtracted: number;
    error: string | null;
  } | null;
}

export interface PersonalityScore {
  score: number;
  sampleSize: number;
  contributors: Array<{
    platform: string;
    feature: string;
    value: number;
    weight: number;
  }>;
}

export interface PersonalityScores {
  openness: PersonalityScore;
  conscientiousness: PersonalityScore;
  extraversion: PersonalityScore;
  agreeableness: PersonalityScore;
  neuroticism: PersonalityScore;
}

export interface Archetype {
  code: string;
  fullCode: string;
  name: string;
  group: string;
  description: string;
  motto: string;
}

export interface TwinProfile {
  archetype_code: string;
  archetype_name: string;
  archetype_group: string;
  narrative: string;
  profile_strength: string;
  platform_count: number;
  feature_count: number;
  raw_data: {
    scores: PersonalityScores;
    confidence: Record<string, unknown>;
    dominantTraits: Array<{
      dimension: string;
      label: string;
      score: number;
      pole: string;
    }>;
    archetype: Archetype;
  };
  formed_at: string;
  updated_at: string;
  reflections?: Array<{
    platform: string;
    title: string;
    content: string;
    generated_at: string;
  }>;
}

export interface EvolutionEvent {
  id: string;
  event_type: string;
  old_scores: Record<string, number>;
  new_scores: Record<string, number>;
  changes: Array<{
    dimension: string;
    previousValue: number;
    newValue: number;
    change: number;
    direction: string;
    magnitude: string;
    insight: string | null;
  }>;
  insight: string | null;
  recorded_at: string;
}

export interface TwinStatus {
  success: boolean;
  pipeline: {
    isRunning: boolean;
    stage?: string;
    startedAt?: string;
  };
  extraction: {
    platforms: PlatformStatus[];
    totalConnected: number;
  };
  twin: TwinProfile | null;
  hasTwin: boolean;
  evolution: {
    status: string;
    message: string;
    recentEvents: EvolutionEvent[];
    eventCount: number;
  } | null;
  personality: {
    scores: PersonalityScores;
    confidence: Record<string, unknown>;
    profileStrength: string;
  } | null;
  lastUpdated: string | null;
}

export interface PipelineResult {
  success: boolean;
  pipelineId?: string;
  duration?: string;
  twin?: {
    archetype: Archetype;
    narrative: { content: string };
    scores: PersonalityScores;
  };
  extraction?: {
    successful: number;
    failed: number;
  };
  error?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Fetch twin status from API
 */
async function fetchTwinStatus(userId: string): Promise<TwinStatus> {
  const response = await fetch(`${API_BASE}/twin/status/${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch twin status');
  }
  return response.json();
}

/**
 * Trigger full pipeline
 */
async function triggerPipeline(userId: string, forceRefresh = false): Promise<PipelineResult> {
  const response = await fetch(`${API_BASE}/twin/form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, forceRefresh }),
  });
  if (!response.ok) {
    throw new Error('Failed to trigger pipeline');
  }
  return response.json();
}

/**
 * Refresh single platform
 */
async function refreshPlatform(userId: string, platform: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/twin/refresh/${platform}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh ${platform}`);
  }
  return response.json();
}

/**
 * Fetch evolution history
 */
async function fetchEvolution(userId: string) {
  const response = await fetch(`${API_BASE}/twin/evolution/${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch evolution data');
  }
  return response.json();
}

/**
 * Main hook for twin pipeline management
 */
export function useTwinPipeline(userId: string | null) {
  const queryClient = useQueryClient();
  const [isPolling, setIsPolling] = useState(false);

  // Query for twin status
  const statusQuery = useQuery({
    queryKey: ['twinStatus', userId],
    queryFn: () => fetchTwinStatus(userId!),
    enabled: !!userId,
    staleTime: 30000, // 30 seconds
    refetchInterval: isPolling ? 2000 : false, // Poll every 2s when running
  });

  // Query for evolution data
  const evolutionQuery = useQuery({
    queryKey: ['twinEvolution', userId],
    queryFn: () => fetchEvolution(userId!),
    enabled: !!userId && statusQuery.data?.hasTwin,
    staleTime: 60000, // 1 minute
  });

  // Mutation for triggering pipeline
  const formMutation = useMutation({
    mutationFn: ({ forceRefresh }: { forceRefresh?: boolean } = {}) =>
      triggerPipeline(userId!, forceRefresh),
    onMutate: () => {
      setIsPolling(true);
    },
    onSettled: () => {
      setIsPolling(false);
      queryClient.invalidateQueries({ queryKey: ['twinStatus', userId] });
      queryClient.invalidateQueries({ queryKey: ['twinEvolution', userId] });
    },
  });

  // Mutation for refreshing single platform
  const refreshMutation = useMutation({
    mutationFn: (platform: string) => refreshPlatform(userId!, platform),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['twinStatus', userId] });
    },
  });

  // Stop polling when pipeline completes
  useEffect(() => {
    if (statusQuery.data?.pipeline?.isRunning === false && isPolling) {
      setIsPolling(false);
    }
  }, [statusQuery.data?.pipeline?.isRunning, isPolling]);

  // Form twin - main action
  const formTwin = useCallback((forceRefresh = false) => {
    if (!userId) return;
    formMutation.mutate({ forceRefresh });
  }, [userId, formMutation]);

  // Refresh single platform
  const refreshSinglePlatform = useCallback((platform: string) => {
    if (!userId) return;
    refreshMutation.mutate(platform);
  }, [userId, refreshMutation]);

  // Derived state
  const isPipelineRunning = statusQuery.data?.pipeline?.isRunning || formMutation.isPending;
  const currentStage = statusQuery.data?.pipeline?.stage;
  const hasTwin = statusQuery.data?.hasTwin || false;
  const twin = statusQuery.data?.twin;
  const personality = statusQuery.data?.personality;
  const platforms = statusQuery.data?.extraction?.platforms || [];
  const connectedCount = statusQuery.data?.extraction?.totalConnected || 0;

  return {
    // Status
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    isError: statusQuery.isError,
    error: statusQuery.error,

    // Pipeline state
    isPipelineRunning,
    currentStage,
    pipelineProgress: formMutation.data,

    // Twin data
    hasTwin,
    twin,
    personality,
    archetype: twin?.raw_data?.archetype || null,
    narrative: twin?.narrative || null,

    // Platform data
    platforms,
    connectedCount,

    // Evolution data
    evolution: evolutionQuery.data,
    evolutionLoading: evolutionQuery.isLoading,

    // Actions
    formTwin,
    refreshPlatform: refreshSinglePlatform,
    refetchStatus: statusQuery.refetch,

    // Mutation states
    isForming: formMutation.isPending,
    formError: formMutation.error,
    isRefreshing: refreshMutation.isPending,
    refreshError: refreshMutation.error,
  };
}

/**
 * Hook for just extraction status (lighter weight)
 */
export function useExtractionStatus(userId: string | null) {
  return useQuery({
    queryKey: ['extractionStatus', userId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/extraction/status/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch extraction status');
      return response.json();
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}

/**
 * Hook for personality profile only
 */
export function usePersonalityProfile(userId: string | null) {
  return useQuery({
    queryKey: ['personalityProfile', userId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/twin/personality/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch personality profile');
      return response.json();
    },
    enabled: !!userId,
    staleTime: 60000,
  });
}

export default useTwinPipeline;
