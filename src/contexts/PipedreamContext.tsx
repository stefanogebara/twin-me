/**
 * PipedreamContext - Pipedream Connect Integration (Stub)
 *
 * Pipedream SDK is not currently in use. This provides a no-op context
 * so that PipedreamProvider in App.tsx doesn't break anything.
 * Re-enable when Pipedream integration is needed.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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
  const [connectedAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const openConnect = useCallback(async (_appNameSlug?: string) => {
    console.warn('[Pipedream] SDK not installed - openConnect is a no-op');
  }, []);

  const fetchConnectedAccounts = useCallback(async () => {
    // No-op
  }, []);

  const disconnectAccount = useCallback(async (_platform: string) => {
    // No-op
  }, []);

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
