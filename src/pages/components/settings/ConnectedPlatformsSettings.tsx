import React from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';

interface ConnectedPlatformsSettingsProps {
  isDemoMode: boolean;
  connectorStatus: Record<string, any>;
  isLoading: boolean;
  error: string | null;
  disconnectingService: string | null;
  refetch: () => void;
  navigate: (path: string) => void;
  handleDisconnectService: (provider: string) => void;
}

const connectorConfig = [
  { id: 'spotify', name: 'Spotify', description: 'Music preferences and listening patterns' },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Schedule and event patterns' },
  { id: 'whoop', name: 'Whoop', description: 'Health, recovery, and strain data' }
];

// Glass card style matching the design system
const cardStyle = {
  background: 'rgba(255, 255, 255, 0.18)',
  backdropFilter: 'blur(10px) saturate(140%)',
  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
  borderRadius: '2rem',
  border: '1px solid rgba(255, 255, 255, 0.45)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
};

const ConnectedPlatformsSettings: React.FC<ConnectedPlatformsSettingsProps> = ({
  isDemoMode,
  connectorStatus,
  isLoading,
  error,
  disconnectingService,
  refetch,
  navigate,
  handleDisconnectService,
}) => {
  return (
    <section className="p-5" style={cardStyle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Clay3DIcon name="globe" size={20} />
          <h2 className="heading-serif text-base">
            Connected Platforms
          </h2>
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            color: '#10B981',
            border: '1px solid rgba(16, 185, 129, 0.15)'
          }}>
            <Lock className="w-3 h-3" />
            OAuth
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg transition-all hover:scale-105"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: '#1F1C18' }} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {isLoading && !isDemoMode ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1F1C18' }} />
        </div>
      ) : (
        <div className="space-y-2">
          {connectorConfig.map((connector) => {
            const connectionInfo = connectorStatus[connector.id];
            const isConnected = isDemoMode ? true : connectionInfo?.connected;
            const isExpired = isDemoMode ? false : (connectionInfo?.tokenExpired || connectionInfo?.status === 'expired');
            const isActiveConnection = isConnected && !isExpired;

            return (
              <div
                key={connector.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  border: '1px solid rgba(0, 0, 0, 0.04)'
                }}
              >
                <div>
                  <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 500, color: '#1F1C18' }}>
                    {connector.name}
                  </h3>
                  <p className="text-xs" style={{ color: '#8A857D' }}>
                    {connector.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isActiveConnection ? (
                    <>
                      <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
                      {!isDemoMode && (
                        <button
                          onClick={() => handleDisconnectService(connector.id)}
                          disabled={disconnectingService === connector.id}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                        >
                          {disconnectingService === connector.id ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                      )}
                      {isDemoMode && (
                        <span className="text-xs px-2 py-1 rounded-lg" style={{ color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                          Demo
                        </span>
                      )}
                    </>
                  ) : isExpired ? (
                    <>
                      <AlertCircle className="w-4 h-4" style={{ color: '#f59e0b' }} />
                      <button
                        onClick={() => navigate('/get-started')}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
                      >
                        Reconnect
                      </button>
                    </>
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: '#d6d3d1' }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ConnectedPlatformsSettings;
