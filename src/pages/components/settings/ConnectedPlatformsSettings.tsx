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
import { PlatformLogo } from '@/components/PlatformLogos';

interface ConnectedPlatformsSettingsProps {
  isDemoMode: boolean;
  connectorStatus: Record<string, unknown>;
  isLoading: boolean;
  error: string | null;
  disconnectingService: string | null;
  refetch: () => void;
  navigate: (path: string) => void;
  handleDisconnectService: (provider: string) => void;
}

interface ConnectorConfig {
  id: string;
  name: string;
  description: string;
  isOAuth: boolean;
}

const connectorConfig: ConnectorConfig[] = [
  { id: 'spotify', name: 'Spotify', description: 'Music preferences and listening patterns', isOAuth: true },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Schedule and event patterns', isOAuth: true },
  { id: 'youtube', name: 'YouTube', description: 'Content preferences and watch history', isOAuth: true },
  { id: 'google_gmail', name: 'Gmail', description: 'Communication patterns from email metadata', isOAuth: true },
  { id: 'discord', name: 'Discord', description: 'Community activity and communication style', isOAuth: true },
  { id: 'linkedin', name: 'LinkedIn', description: 'Career trajectory and professional skills', isOAuth: true },
  { id: 'github', name: 'GitHub', description: 'Coding activity and open source contributions', isOAuth: true },
  { id: 'reddit', name: 'Reddit', description: 'Community interests and discussion patterns', isOAuth: true },
  { id: 'twitch', name: 'Twitch', description: 'Gaming identity and streaming preferences', isOAuth: true },
  { id: 'whoop', name: 'Whoop', description: 'Recovery, strain, sleep, and HRV patterns', isOAuth: true },
];

// Glass card class from design system
const cardClassName = 'glass-card';

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
    <section className={`p-5 ${cardClassName}`}>
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
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
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
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--foreground)' }} />
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
                  backgroundColor: 'var(--glass-surface-bg)',
                  border: '1px solid var(--glass-surface-border)'
                }}
              >
                <div className="flex items-center gap-2">
                  <PlatformLogo platform={connector.id} size={22} />
                  <div>
                    <h3 className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, color: 'var(--foreground)' }}>
                      {connector.name}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {connector.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActiveConnection ? (
                    <>
                      <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
                      {!isDemoMode && connector.isOAuth && (
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
                    <>
                      <XCircle className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      {!isDemoMode && (
                        <button
                          onClick={() => navigate('/get-started')}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: 'var(--accent-vibrant, #ff8400)', backgroundColor: 'rgba(255, 132, 0, 0.1)' }}
                        >
                          Connect
                        </button>
                      )}
                    </>
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
