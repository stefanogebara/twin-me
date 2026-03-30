import React from 'react';
import { DataProvider } from '@/types/data-integration';
import { ConnectorConfig } from './connectorConfig';
import { ConnectorCard } from './ConnectorCard';

interface PlatformCategorySectionProps {
  categoryName: string;
  categorySubtext: string;
  categoryColor: string;
  connectors: ConnectorConfig[];
  connectedServices: DataProvider[];
  isDemoMode: boolean;
  demoConnectedProviders: string[];
  platformStatusData: Record<string, { tokenExpired?: boolean; status?: string }>;
  connectingProvider: DataProvider | null;
  disconnectingProvider: DataProvider | null;
  theme: string;
  colors: {
    textPrimary: string;
    textSecondary: string;
    muted: string;
  };
  animationDelay: number;
  dotDelay: number;
  onConnect: (provider: DataProvider) => void;
  onDisconnect: (provider: DataProvider) => void;
  discoveredPlatforms?: Set<string>;
}

export const PlatformCategorySection: React.FC<PlatformCategorySectionProps> = ({
  categoryName,
  categorySubtext,
  categoryColor,
  connectors,
  connectedServices,
  isDemoMode,
  demoConnectedProviders,
  platformStatusData,
  connectingProvider,
  disconnectingProvider,
  theme,
  colors,
  onConnect,
  onDisconnect,
  discoveredPlatforms,
}) => {
  if (connectors.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: categoryColor }}
        />
        <h3
          className="text-lg"
          style={{
            color: colors.textPrimary,
            fontFamily: 'var(--font-heading)',
            fontWeight: 400
          }}
        >
          {categoryName}
        </h3>
        <span
          className="text-xs"
          style={{ color: colors.muted, fontFamily: "'Inter', sans-serif" }}
        >
          {categorySubtext}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {connectors.map(connector => {
          const isConnected = isDemoMode
            ? demoConnectedProviders.includes(connector.provider as string)
            : connectedServices.includes(connector.provider);
          const providerStatus = platformStatusData[connector.provider];
          const needsReconnect = isDemoMode ? false : (providerStatus?.tokenExpired || providerStatus?.status === 'token_expired');

          return (
            <ConnectorCard
              key={connector.provider}
              connector={connector}
              isConnected={isConnected}
              needsReconnect={!!needsReconnect}
              connectingProvider={connectingProvider}
              disconnectingProvider={disconnectingProvider}
              theme={theme}
              colors={colors}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              isDiscovered={discoveredPlatforms?.has(connector.provider)}
            />
          );
        })}
      </div>
    </div>
  );
};
