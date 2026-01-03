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
import { DEMO_USER, DEMO_PLATFORM_CONNECTIONS } from '@/services/demoDataService';

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
  optimisticDisconnect: (provider: string) => void;
  revertOptimisticUpdate: () => Promise<void>;
}

/**
 * Generate demo platform status data
 */
const getDemoPlatformStatus = (): PlatformStatusMap => {
  const statusMap: PlatformStatusMap = {};

  for (const conn of DEMO_PLATFORM_CONNECTIONS) {
    statusMap[conn.platform] = {
      connected: conn.connected,
      isActive: conn.status === 'active',
      tokenExpired: false,
      connectedAt: conn.connectedAt,
      lastSync: conn.lastSync,
      status: conn.status,
      expiresAt: null,
    };
  }

  return statusMap;
};

/**
 * Fetch platform connection status from API
 */
const fetchPlatformStatus = async (userId: string): Promise<PlatformStatusMap> => {
  if (!userId) {
    throw new Error('userId is required');
  }

  // Return demo data for demo user
  if (userId === DEMO_USER.id) {
    return getDemoPlatformStatus();
  }

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const url = `${baseUrl}/connectors/status/${encodeURIComponent(userId)}`;

  const response = await fetch(url);

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
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    gcTime: 60 * 1000, // Keep unused data for 1 minute only
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
            // This is not critical - polling still works as a fallback
            // Realtime may fail if not enabled for the table or due to RLS policies
            console.warn('[Realtime] Could not subscribe to platform connections. Using polling fallback.');
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
    // Wait for the query to actually complete and return fresh data
    const result = await queryRefetch();
    return result;
  }, [queryClient, queryRefetch, userId]);

  // Optimistic disconnect - immediately update UI cache before server responds
  const optimisticDisconnect = useCallback((provider: string) => {
    // Get current cache data
    const currentData = queryClient.getQueryData<PlatformStatusMap>(['platformStatus', userId]);

    if (currentData) {
      // Create new data with the provider removed
      const newData = { ...currentData };
      delete newData[provider];

      // Immediately update the cache for instant UI response
      queryClient.setQueryData(['platformStatus', userId], newData);

      console.log('[usePlatformStatus] Optimistic disconnect:', provider);
    }
  }, [queryClient, userId]);

  // Revert optimistic update if needed (e.g., on API failure)
  const revertOptimisticUpdate = useCallback(async () => {
    // Force refetch from server to get true state
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
    optimisticDisconnect,
    revertOptimisticUpdate,
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
