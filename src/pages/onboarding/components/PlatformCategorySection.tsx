import React from 'react';
import { motion } from 'framer-motion';
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
  animationDelay,
  dotDelay,
  onConnect,
  onDisconnect,
}) => {
  if (connectors.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: animationDelay, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="flex items-center gap-2 mb-4">
        <motion.div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: categoryColor }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: dotDelay, ease: [0.4, 0, 0.2, 1] }}
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
          style={{ color: colors.muted, fontFamily: 'var(--font-body)' }}
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
            />
          );
        })}
      </div>
    </motion.div>
  );
};
