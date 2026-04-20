/**
 * usePlatformConnect — Custom hook encapsulating OAuth connect/disconnect logic
 * for the InstantTwinOnboarding flow.
 */

import { useCallback } from 'react';
import { DataProvider } from '@/types/data-integration';
import { getAccessToken } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { useToast } from '@/components/ui/use-toast';
import { AVAILABLE_CONNECTORS } from '../../onboarding/components/connectorConfig';
import { NANGO_PROVIDER_MAP } from './onboardingHelpers';
import { CONNECTION_INSIGHT_MESSAGES } from './connectionInsights';

type ConnectResult = {
  success?: boolean;
  authUrl?: string;
  connectUrl?: string;
  error?: string;
  code?: string;
};

type ConnectError = Error & {
  status?: number;
  code?: string;
};

interface UsePlatformConnectOptions {
  userId: string | undefined;
  isDemoMode: boolean;
  refetchPlatformStatus: () => Promise<unknown>;
  optimisticDisconnect: (provider: DataProvider) => void;
  revertOptimisticUpdate: () => Promise<unknown>;
  setConnectingProvider: (provider: DataProvider | null) => void;
  setDisconnectingProvider: (provider: DataProvider | null) => void;
  setDemoModalPlatform: (platform: string | null) => void;
  setGarminModalOpen?: (open: boolean) => void;
  setSteamModalOpen?: (open: boolean) => void;
}

function createConnectError(message: string, status?: number, code?: string): ConnectError {
  const error = new Error(message) as ConnectError;
  error.status = status;
  error.code = code;
  return error;
}

async function readConnectResult(response: Response): Promise<ConnectResult | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function usePlatformConnect({
  userId,
  isDemoMode,
  refetchPlatformStatus,
  optimisticDisconnect,
  revertOptimisticUpdate,
  setConnectingProvider,
  setDisconnectingProvider,
  setDemoModalPlatform,
  setGarminModalOpen,
  setSteamModalOpen,
}: UsePlatformConnectOptions) {
  const { trackFunnel } = useAnalytics();
  const { toast } = useToast();

  const handleNangoPopup = useCallback((provider: DataProvider, connectUrl: string) => {
    const width = 600, height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      connectUrl,
      'nango-connect',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      trackFunnel('oauth_popup_blocked', { platform: provider });
      sessionStorage.setItem('connecting_provider', provider);
      window.location.href = connectUrl;
      return;
    }

    const platformName = AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name || provider;
    let retryCount = 0;
    const maxRetries = 3;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

    const verifyConnection = async () => {
      const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
      try {
        const verifyResponse = await fetch(`${baseUrl}/nango/verify-connection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ integrationId: nangoIntegrationId })
        });
        const verifyResult = await verifyResponse.json();

        if (verifyResult.success && verifyResult.connected) {
          toast({ title: 'Connected', description: CONNECTION_INSIGHT_MESSAGES[provider] || `${platformName} is now connected` });
          trackFunnel('platform_connection_verified', { platform: provider, retries: retryCount });
          await refetchPlatformStatus();
          setConnectingProvider(null);
          return;
        }

        if (retryCount < maxRetries) {
          retryCount++;
          trackFunnel('platform_connection_verify_retry', { platform: provider, attempt: retryCount });
          setTimeout(verifyConnection, 1500);
          return;
        }

        toast({
          title: 'Connection not verified',
          description: `${platformName} authorization may not have completed. Try again.`,
          variant: 'destructive',
        });
        trackFunnel('platform_connection_verify_failed', { platform: provider, retries: maxRetries });
        setConnectingProvider(null);
      } catch (err) {
        console.error('Verify failed:', err);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(verifyConnection, 1500);
          return;
        }
        toast({
          title: 'Network error',
          description: 'Unable to verify connection. Check your internet and try again.',
          variant: 'destructive',
        });
        trackFunnel('platform_connection_network_error', { platform: provider });
        setConnectingProvider(null);
      }
    };

    const pollInterval = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(pollInterval);
        toast({ title: 'Verifying connection...', description: `Checking ${platformName} authorization` });
        verifyConnection();
      }
    }, 500);

    // Safety: if popup open > 2 min, assume abandoned
    setTimeout(() => {
      clearInterval(pollInterval);
      if (popup && !popup.closed) popup.close();
      trackFunnel('platform_connection_abandoned', { platform: provider });
      setConnectingProvider(null);
    }, 120000);
  }, [toast, trackFunnel, refetchPlatformStatus, setConnectingProvider]);

  const connectService = useCallback(async (provider: DataProvider) => {
    if (isDemoMode) {
      trackFunnel('demo_mode_platform_click', { platform: provider });
      setDemoModalPlatform(provider);
      return;
    }

    // Handle external URL connectors (e.g. Browser Extension -> Chrome Web Store)
    const connector = AVAILABLE_CONNECTORS.find(c => c.provider === provider);
    if (connector?.externalUrl) {
      trackFunnel('platform_external_link', { platform: provider });
      window.open(connector.externalUrl, '_blank');
      setConnectingProvider(null);
      return;
    }

    setConnectingProvider(provider);
    try {
      const effectiveUserId = userId || 'demo-user';
      toast({
        title: "Connecting...",
        description: `Redirecting to ${connector?.name || provider}`,
      });

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

      // Garmin uses direct credential login (no OAuth developer approval available)
      if (provider === 'garmin') {
        setConnectingProvider(null);
        if (setGarminModalOpen) {
          setGarminModalOpen(true);
        } else {
          toast({ title: 'Garmin', description: 'Open Settings > Platforms to connect Garmin.', variant: 'default' });
        }
        return;
      }

      // Steam uses user-provided profile URL/ID (Steam Web API, not OAuth)
      if (provider === 'steam') {
        setConnectingProvider(null);
        if (setSteamModalOpen) {
          setSteamModalOpen(true);
        } else {
          toast({ title: 'Steam', description: 'Open Settings > Platforms to connect Steam.', variant: 'default' });
        }
        return;
      }

      const nangoPlatforms = ['fitbit', 'microsoft_outlook', 'whoop', 'twitch'];

      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`,
      };

      const runConnectionRequest = async (apiUrl: string, fetchOptions: RequestInit): Promise<ConnectResult> => {
        const response = await fetch(apiUrl, fetchOptions);
        const result = await readConnectResult(response);

        if (!response.ok) {
          throw createConnectError(
            result?.error || `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            result?.code
          );
        }

        if (!result?.success) {
          throw createConnectError(result?.error || 'Connection failed', response.status, result?.code);
        }

        return result;
      };

      const runStravaConnection = async (): Promise<ConnectResult> => {
        const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
        const attempts = [
          {
            apiUrl: `${baseUrl}/nango/connect-session`,
            fetchOptions: {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ integrationId: nangoIntegrationId }),
            },
          },
          {
            apiUrl: `${baseUrl}/entertainment/connect/${provider}`,
            fetchOptions: {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ userId: effectiveUserId }),
            },
          },
        ];

        const failures: ConnectError[] = [];

        for (const attempt of attempts) {
          try {
            return await runConnectionRequest(attempt.apiUrl, attempt.fetchOptions);
          } catch (error) {
            failures.push(error as ConnectError);
          }
        }

        const notConfigured = failures.every((error) =>
          error.code === 'INTEGRATION_NOT_CONFIGURED' ||
          /not configured/i.test(error.message)
        );

        if (notConfigured) {
          throw createConnectError(
            'Strava is not configured on this server yet. Configure the Strava Nango integration or STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET.',
            failures[failures.length - 1]?.status,
            'STRAVA_NOT_CONFIGURED'
          );
        }

        throw failures[failures.length - 1] || createConnectError('Connection failed');
      };

      let result: ConnectResult;

      if (provider === 'strava') {
        result = await runStravaConnection();
      } else if (nangoPlatforms.includes(provider as string)) {
        const nangoIntegrationId = NANGO_PROVIDER_MAP[provider] || provider;
        result = await runConnectionRequest(`${baseUrl}/nango/connect-session`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ integrationId: nangoIntegrationId }),
        });
      } else {
        result = await runConnectionRequest(`${baseUrl}/entertainment/connect/${provider}`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ userId: effectiveUserId }),
        });
      }

      if (result.success && result.authUrl) {
        trackFunnel('platform_connect_initiated', { platform: provider });
        sessionStorage.setItem('connecting_provider', provider);
        window.location.href = result.authUrl;
      } else if (result.success && result.connectUrl) {
        handleNangoPopup(provider, result.connectUrl);
      } else if (result.success) {
        await refetchPlatformStatus();
        toast({
          title: "Connected",
          description: CONNECTION_INSIGHT_MESSAGES[provider] || `${AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name} is now connected`,
          variant: "default",
        });
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      toast({
        title: "Connection failed",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setConnectingProvider(null);
    }
  }, [toast, userId, refetchPlatformStatus, isDemoMode, trackFunnel, setConnectingProvider, setDemoModalPlatform, setGarminModalOpen, setSteamModalOpen, handleNangoPopup]);

  const disconnectService = useCallback(async (provider: DataProvider) => {
    if (!userId) return;
    setDisconnectingProvider(provider);

    const connectorName = AVAILABLE_CONNECTORS.find(c => c.provider === provider)?.name;

    optimisticDisconnect(provider);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

      const fetchOptions: RequestInit = {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`
        }
      };

      const apiUrl = `${baseUrl}/connectors/${provider}/${encodeURIComponent(userId)}`;

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await refetchPlatformStatus();

      toast({
        title: "Disconnected",
        description: `${connectorName} has been disconnected`,
      });
    } catch (error: unknown) {
      await revertOptimisticUpdate();

      const errorMsg = error instanceof Error ? error.message : 'Disconnect failed';
      toast({
        title: "Disconnect failed",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setDisconnectingProvider(null);
    }
  }, [userId, toast, refetchPlatformStatus, optimisticDisconnect, revertOptimisticUpdate, setDisconnectingProvider]);

  return { connectService, disconnectService };
}
