import { useState, useEffect, useCallback } from 'react';
import {
  calculateAuthenticityScore,
  getScoreDescription,
  getScoreRecommendations,
  type SoulSignatureScore
} from '@/services/soulSignature';
import {
  fetchPlatformConnections,
  toPlatformConnections,
  getConnectedPlatforms,
  getPlatformsByCategory,
  type PlatformStatus
} from '@/services/platformSync';

export interface UseSoulSignatureReturn {
  // Score data
  score: SoulSignatureScore | null;
  platforms: PlatformStatus[];
  connectedPlatforms: PlatformStatus[];
  personalPlatforms: PlatformStatus[];
  professionalPlatforms: PlatformStatus[];

  // UI helpers
  scoreDescription: string;
  recommendations: string[];

  // State
  loading: boolean;
  error: Error | null;

  // Actions
  refresh: () => Promise<void>;
  syncPlatform: (platform: string) => Promise<boolean>;
}

interface UseSoulSignatureOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  userId?: string;
}

/**
 * Custom hook for managing soul signature score and platform connections
 *
 * @example
 * ```tsx
 * const { score, platforms, loading, refresh } = useSoulSignature({
 *   autoRefresh: true,
 *   refreshInterval: 60000 // Refresh every minute
 * });
 *
 * if (loading) return <LoadingState />;
 *
 * return (
 *   <div>
 *     <p>Score: {score?.overall}%</p>
 *     <p>Connected: {platforms.filter(p => p.connected).length}</p>
 *     <button onClick={refresh}>Refresh</button>
 *   </div>
 * );
 * ```
 */
export function useSoulSignature(options: UseSoulSignatureOptions = {}): UseSoulSignatureReturn {
  const {
    autoRefresh = false,
    refreshInterval = 30000, // 30 seconds default
    userId
  } = options;

  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [score, setScore] = useState<SoulSignatureScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch platform connections
      const platformData = await fetchPlatformConnections(userId);
      setPlatforms(platformData);

      // Convert to platform connections and calculate score
      const connections = toPlatformConnections(platformData);
      const calculatedScore = calculateAuthenticityScore(connections);
      setScore(calculatedScore);

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch soul signature data');
      setError(error);
      console.error('useSoulSignature error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const syncPlatform = useCallback(async (platform: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/platforms/sync/${platform}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to sync ${platform}`);
      }

      // Refresh data after sync
      await fetchData();
      return true;
    } catch (err) {
      console.error(`Error syncing platform ${platform}:`, err);
      return false;
    }
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  // Derived values
  const connectedPlatforms = getConnectedPlatforms(platforms);
  const personalPlatforms = getPlatformsByCategory(platforms, 'personal');
  const professionalPlatforms = getPlatformsByCategory(platforms, 'professional');
  const scoreDescription = score ? getScoreDescription(score.overall) : '';
  const recommendations = score ? getScoreRecommendations(score) : [];

  return {
    score,
    platforms,
    connectedPlatforms,
    personalPlatforms,
    professionalPlatforms,
    scoreDescription,
    recommendations,
    loading,
    error,
    refresh,
    syncPlatform
  };
}

/**
 * Lightweight hook for just the score (without platform details)
 */
export function useSoulScore(options: UseSoulSignatureOptions = {}) {
  const { score, loading, error, refresh } = useSoulSignature(options);

  return {
    score: score?.overall ?? 0,
    personalScore: score?.personalSoul ?? 0,
    professionalScore: score?.professionalSoul ?? 0,
    breakdown: score?.breakdown,
    insights: score?.insights,
    loading,
    error,
    refresh
  };
}
