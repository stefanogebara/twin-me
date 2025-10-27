/**
 * Unified Platform Status Hook
 * Single source of truth for connection status across all components
 * Eliminates localStorage usage and ensures database consistency
 * Now with Supabase Realtime for instant UI updates
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PlatformConnectionStatus {
  connected: boolean;
  isActive: boolean;
  tokenExpired: boolean;
  connectedAt: string | null;
  lastSync: string | null;
  status: string;
  expiresAt: string | null;
}

export interface PlatformStatusMap {
  [provider: string]: PlatformConnectionStatus;
}

export interface UsePlatformStatusReturn {
  data: PlatformStatusMap;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  hasConnectedServices: boolean;
  connectedProviders: string[];
  connectedCount: number;
}

/**
 * Fetch platform connection status from API
 */
const fetchPlatformStatus = async (userId: string): Promise<PlatformStatusMap> => {
  if (!userId) {
    throw new Error('userId is required');
  }

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const response = await fetch(`${baseUrl}/connectors/status/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch platform status: ${response.statusText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch platform status');
  }

  return result.data || {};
};

/**
 * Custom hook for managing platform connection status
 *
 * Features:
 * - Automatic refetching every 30 seconds
 * - Cache management with React Query
 * - Derived state for common use cases
 * - Manual refetch capability
 *
 * @param userId - User UUID (required)
 * @param options - Optional configuration
 */
export const usePlatformStatus = (
  userId: string | undefined,
  options?: {
    refetchInterval?: number;
    enabled?: boolean;
    enableRealtime?: boolean; // Option to enable/disable realtime updates
  }
): UsePlatformStatusReturn => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch: queryRefetch
  } = useQuery<PlatformStatusMap, Error>({
    queryKey: ['platformStatus', userId],
    queryFn: () => fetchPlatformStatus(userId!),
    enabled: !!userId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval ?? 30000, // Default: 30 seconds
    staleTime: 10000, // Consider data fresh for 10 seconds
    gcTime: 5 * 60 * 1000, // Keep unused data for 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Set up Supabase Realtime subscription for instant updates
  useEffect(() => {
    if (!userId || options?.enableRealtime === false) return;

    let channel: RealtimeChannel | null = null;

    const setupRealtimeSubscription = async () => {
      // Subscribe to changes in platform_connections for this user
      channel = supabase
        .channel(`platform-connections-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen for INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'platform_connections',
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            console.log('[Realtime] Platform connection change detected:', payload);

            // Invalidate and refetch the platform status query
            await queryClient.invalidateQueries({
              queryKey: ['platformStatus', userId]
            });

            // Also invalidate related queries that might depend on platform status
            await queryClient.invalidateQueries({
              queryKey: ['platforms']
            });
            await queryClient.invalidateQueries({
              queryKey: ['connectorStatuses', userId]
            });
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Realtime] Subscribed to platform connections for user:', userId);
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[Realtime] Failed to subscribe to platform connections');
          }
        });
    };

    setupRealtimeSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (channel) {
        console.log('[Realtime] Unsubscribing from platform connections');
        supabase.removeChannel(channel);
      }
    };
  }, [userId, queryClient, options?.enableRealtime]);

  // Derived state
  const platformStatus = data || {};
  const connectedProviders = Object.keys(platformStatus).filter(
    (provider) => platformStatus[provider]?.connected
  );
  const hasConnectedServices = connectedProviders.length > 0;
  const connectedCount = connectedProviders.length;

  // Manual refetch with cache invalidation
  const refetch = useCallback(async () => {
    // Invalidate cache to force fresh data
    await queryClient.invalidateQueries({ queryKey: ['platformStatus', userId] });
    await queryRefetch();
  }, [queryClient, queryRefetch, userId]);

  return {
    data: platformStatus,
    isLoading,
    error: error as Error | null,
    refetch,
    hasConnectedServices,
    connectedProviders,
    connectedCount,
  };
};

/**
 * Hook to check if a specific platform is connected
 */
export const useIsPlatformConnected = (
  userId: string | undefined,
  provider: string
): boolean => {
  const { data } = usePlatformStatus(userId);
  return data[provider]?.connected ?? false;
};

/**
 * Hook to get connection status for a specific platform
 */
export const usePlatformConnectionStatus = (
  userId: string | undefined,
  provider: string
): PlatformConnectionStatus | null => {
  const { data } = usePlatformStatus(userId);
  return data[provider] || null;
};
