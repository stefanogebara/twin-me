/**
 * PipedreamContext - Pipedream Connect Integration
 *
 * Provides React context for managing Pipedream Connect OAuth flows
 * Handles platform connections via Pipedream's pre-approved OAuth apps
 *
 * Key Features:
 * - Generate Connect tokens for users
 * - Open Pipedream Connect modal for OAuth
 * - Fetch connected accounts
 * - Disconnect platform accounts
 * - Real-time connection status updates
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { PipedreamClient } from '@pipedream/sdk/browser';

interface ConnectedAccount {
  id: string;
  platform: string;
  pipedream_account_id: string;
  connected: boolean;
  metadata: {
    connected_at: string;
    app_name: string;
    external_account_id?: string;
  };
}

interface PipedreamContextType {
  connectedAccounts: ConnectedAccount[];
  isLoading: boolean;
  error: string | null;
  openConnect: (appNameSlug?: string) => Promise<void>;
  fetchConnectedAccounts: () => Promise<void>;
  disconnectAccount: (platform: string) => Promise<void>;
}

const PipedreamContext = createContext<PipedreamContextType | undefined>(undefined);

export const usePipedream = () => {
  const context = useContext(PipedreamContext);
  if (context === undefined) {
    throw new Error('usePipedream must be used within a PipedreamProvider');
  }
  return context;
};

interface PipedreamProviderProps {
  children: ReactNode;
}

export const PipedreamProvider: React.FC<PipedreamProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectClient, setConnectClient] = useState<any>(null);

  // Initialize Pipedream Connect SDK with tokenCallback
  const initializeConnect = useCallback(async () => {
    if (connectClient) return connectClient;

    try {
      // Initialize Connect client with tokenCallback (no publishable key needed)
      // The tokenCallback fetches short-lived Connect tokens from the backend
      const client = new PipedreamClient({
        projectEnvironment: 'production', // matches PIPEDREAM_ENV in .env
        externalUserId: user?.id,
        tokenCallback: async () => {
          // Fetch Connect token from backend
          const response = await fetch(`${import.meta.env.VITE_API_URL}/pipedream/connect-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ userId: user?.id })
          });

          if (!response.ok) {
            throw new Error('Failed to fetch Connect token');
          }

          const data = await response.json();
          return data.token; // Return just the token string
        }
      });

      setConnectClient(client);
      return client;
    } catch (err) {
      console.error('[Pipedream] Failed to initialize Connect SDK:', err);
      setError('Failed to initialize Pipedream Connect');
      return null;
    }
  }, [connectClient, user]);

  /**
   * Fetch all connected accounts for the current user
   */
  const fetchConnectedAccounts = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/pipedream/accounts/${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch connected accounts');
      }

      const { accounts } = await response.json();
      setConnectedAccounts(accounts);
      console.log(`[Pipedream] Fetched ${accounts.length} connected accounts`);
    } catch (err: any) {
      console.error('[Pipedream] Error fetching accounts:', err);
      setError(err.message || 'Failed to fetch connected accounts');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /**
   * Open Pipedream Connect modal for OAuth
   * @param appNameSlug - Optional specific app to connect (e.g., 'spotify', 'discord')
   */
  const openConnect = useCallback(async (appNameSlug?: string) => {
    if (!user) {
      setError('User must be authenticated');
      return;
    }

    console.log(`[Pipedream] Opening Connect modal for ${appNameSlug || 'any app'}`);
    setIsLoading(true);
    setError(null);

    try {
      // Initialize Connect SDK (tokenCallback is configured in initializeConnect)
      const client = await initializeConnect();
      if (!client) {
        throw new Error('Failed to initialize Connect client');
      }

      console.log('[Pipedream] Connect client initialized successfully');

      // Open Connect modal - SDK automatically fetches token via tokenCallback
      client.connectAccount({
        app: appNameSlug, // Optional: pre-select specific app
        onSuccess: async (account: any) => {
          console.log('[Pipedream] ✅ Account connected successfully!');
          console.log('[Pipedream] Account data:', JSON.stringify(account, null, 2));

          setIsLoading(true); // Keep loading while saving

          // Save connection to database manually (webhook isn't configured yet)
          try {
            console.log('[Pipedream] Saving connection to database...');

            const payload = {
              external_user_id: user.id,
              account: {
                id: account.id,
                external_id: account.external_id || account.id
              },
              app: {
                name_slug: appNameSlug || 'unknown',
                name: account.app_name || appNameSlug || 'Unknown'
              }
            };

            console.log('[Pipedream] Webhook payload:', JSON.stringify(payload, null, 2));

            const response = await fetch(`${import.meta.env.VITE_API_URL}/pipedream/webhooks/account-connected`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload)
            });

            const result = await response.json();
            console.log('[Pipedream] Webhook response:', result);

            if (!response.ok) {
              console.error('[Pipedream] ❌ Failed to save connection:', result);
              setError('Connected but failed to save to database');
            } else {
              console.log('[Pipedream] ✅ Connection saved to database successfully');
            }
          } catch (err) {
            console.error('[Pipedream] ❌ Error saving connection:', err);
            setError('Connected but failed to save');
          }

          // Refresh connected accounts
          console.log('[Pipedream] Refreshing connected accounts...');
          await fetchConnectedAccounts();
          setIsLoading(false);
        },
        onError: (error: any) => {
          console.error('[Pipedream] ❌ Connection error:', error);
          setError(error.message || 'Failed to connect account');
          setIsLoading(false);
        }
      });

      console.log('[Pipedream] Connect modal opened - waiting for user action...');
    } catch (err: any) {
      console.error('[Pipedream] ❌ Error opening Connect:', err);
      setError(err.message || 'Failed to open Pipedream Connect');
      setIsLoading(false);
    }
  }, [user, initializeConnect, fetchConnectedAccounts]);

  /**
   * Disconnect a platform account
   * @param platform - Platform name slug (e.g., 'spotify', 'discord')
   */
  const disconnectAccount = useCallback(async (platform: string) => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/pipedream/accounts/${user.id}/${platform}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to disconnect ${platform}`);
      }

      console.log(`[Pipedream] Disconnected ${platform}`);

      // Update connected accounts
      setConnectedAccounts(prev =>
        prev.filter(account => account.platform !== platform)
      );
    } catch (err: any) {
      console.error('[Pipedream] Error disconnecting account:', err);
      setError(err.message || `Failed to disconnect ${platform}`);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const value: PipedreamContextType = {
    connectedAccounts,
    isLoading,
    error,
    openConnect,
    fetchConnectedAccounts,
    disconnectAccount
  };

  return (
    <PipedreamContext.Provider value={value}>
      {children}
    </PipedreamContext.Provider>
  );
};

export default PipedreamContext;
