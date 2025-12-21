/**
 * useArcticOAuth Hook
 * React hook for managing Arctic OAuth connections
 */

import { useState, useEffect, useCallback } from 'react';
import {
  connectPlatform,
  disconnectPlatform,
  refreshTokens,
  getConnectionStatus,
  type ArcticProvider,
  type ArcticConnectionStatus
} from '@/services/arcticService';
import { toast } from 'sonner';

interface UseArcticOAuthResult {
  connections: Record<string, ArcticConnectionStatus>;
  isLoading: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: (provider: ArcticProvider) => Promise<void>;
  disconnect: (provider: ArcticProvider) => Promise<void>;
  refresh: (provider: ArcticProvider) => Promise<void>;
  refetchStatus: () => Promise<void>;
}

export function useArcticOAuth(userId: string | null): UseArcticOAuthResult {
  const [connections, setConnections] = useState<Record<string, ArcticConnectionStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch connection status
  const fetchConnectionStatus = useCallback(async () => {
    if (!userId) {
      setConnections({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const status = await getConnectionStatus(userId);
      setConnections(status);
    } catch (err) {
      console.error('[useArcticOAuth] Failed to fetch status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch connection status');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Load initial status
  useEffect(() => {
    fetchConnectionStatus();
  }, [fetchConnectionStatus]);

  // Connect to a platform
  const connect = useCallback(async (provider: ArcticProvider) => {
    if (!userId) {
      toast.error('Authentication Required', {
        description: 'Please sign in to connect platforms'
      });
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const providerName = provider.replace('google_', '').replace('_', ' ');
      const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

      toast.loading(`Connecting to ${displayName}...`, {
        id: `connect-${provider}`
      });

      await connectPlatform(provider, userId);

      toast.success(`${displayName} Connected!`, {
        id: `connect-${provider}`,
        description: 'Your data is now being synced'
      });

      // Refresh connection status
      await fetchConnectionStatus();
    } catch (err) {
      console.error(`[useArcticOAuth] Failed to connect ${provider}:`, err);
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';

      setError(errorMessage);

      toast.error('Connection Failed', {
        id: `connect-${provider}`,
        description: errorMessage
      });
    } finally {
      setIsConnecting(false);
    }
  }, [userId, fetchConnectionStatus]);

  // Disconnect from a platform
  const disconnect = useCallback(async (provider: ArcticProvider) => {
    if (!userId) return;

    setError(null);

    try {
      const providerName = provider.replace('google_', '').replace('_', ' ');
      const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

      toast.loading(`Disconnecting ${displayName}...`, {
        id: `disconnect-${provider}`
      });

      await disconnectPlatform(userId, provider);

      toast.success(`${displayName} Disconnected`, {
        id: `disconnect-${provider}`
      });

      // Refresh connection status
      await fetchConnectionStatus();
    } catch (err) {
      console.error(`[useArcticOAuth] Failed to disconnect ${provider}:`, err);
      const errorMessage = err instanceof Error ? err.message : 'Disconnect failed';

      setError(errorMessage);

      toast.error('Disconnect Failed', {
        id: `disconnect-${provider}`,
        description: errorMessage
      });
    }
  }, [userId, fetchConnectionStatus]);

  // Refresh tokens for a platform
  const refresh = useCallback(async (provider: ArcticProvider) => {
    if (!userId) return;

    setError(null);

    try {
      const providerName = provider.replace('google_', '').replace('_', ' ');
      const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

      toast.loading(`Refreshing ${displayName} connection...`, {
        id: `refresh-${provider}`
      });

      await refreshTokens(userId, provider);

      toast.success(`${displayName} Connection Refreshed`, {
        id: `refresh-${provider}`
      });

      // Refresh connection status
      await fetchConnectionStatus();
    } catch (err) {
      console.error(`[useArcticOAuth] Failed to refresh ${provider}:`, err);
      const errorMessage = err instanceof Error ? err.message : 'Refresh failed';

      setError(errorMessage);

      toast.error('Refresh Failed', {
        id: `refresh-${provider}`,
        description: errorMessage
      });
    }
  }, [userId, fetchConnectionStatus]);

  return {
    connections,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    refresh,
    refetchStatus: fetchConnectionStatus
  };
}

export default useArcticOAuth;
