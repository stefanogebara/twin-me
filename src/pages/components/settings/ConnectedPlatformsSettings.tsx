import React from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogos';
import GoogleWorkspaceConnect from './GoogleWorkspaceConnect';

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

// Google services (Gmail, Calendar, Drive, etc.) are handled by GoogleWorkspaceConnect above
const connectorConfig: ConnectorConfig[] = [
  { id: 'spotify', name: 'Spotify', description: 'Music preferences and listening patterns', isOAuth: true },
  { id: 'youtube', name: 'YouTube', description: 'Content preferences and watch history', isOAuth: true },
  { id: 'discord', name: 'Discord', description: 'Community activity and communication style', isOAuth: true },
  { id: 'linkedin', name: 'LinkedIn', description: 'Career trajectory and professional skills', isOAuth: true },
  { id: 'github', name: 'GitHub', description: 'Coding activity and open source contributions', isOAuth: true },
  { id: 'reddit', name: 'Reddit', description: 'Community interests and discussion patterns', isOAuth: true },
  { id: 'twitch', name: 'Twitch', description: 'Gaming identity and streaming preferences', isOAuth: true },
  { id: 'whoop', name: 'Whoop', description: 'Recovery, strain, sleep, and HRV patterns', isOAuth: true },
];

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
    <div>
      {/* Google Workspace — bundled connect card */}
      <GoogleWorkspaceConnect
        connectorStatus={connectorStatus as Record<string, any>}
        isDemoMode={isDemoMode}
        navigate={navigate}
      />

      {/* Refresh button — right-aligned, subtle */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
          style={{ color: 'rgba(255,255,255,0.25)' }}
          aria-label="Refresh platform connection status"
          title="Refresh status"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#ef4444' }}>
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {isLoading && !isDemoMode ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      ) : (
        <div className="space-y-0">
          {connectorConfig.map((connector) => {
            const connectionInfo = connectorStatus[connector.id];
            const isConnected = isDemoMode ? true : connectionInfo?.connected;
            const isExpired = isDemoMode ? false : (connectionInfo?.tokenExpired || connectionInfo?.status === 'expired');
            const isActiveConnection = isConnected && !isExpired;

            return (
              <div
                key={connector.id}
                className="flex items-center justify-between py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="flex items-center gap-3">
                  <PlatformLogo platform={connector.id} size={18} />
                  <div>
                    <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                      {connector.name}
                    </span>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {connector.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isActiveConnection ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                      {!isDemoMode && connector.isOAuth && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Disconnect ${connector.name}?`)) {
                              handleDisconnectService(connector.id);
                            }
                          }}
                          disabled={disconnectingService === connector.id}
                          className="text-[11px] transition-opacity hover:opacity-60"
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                        >
                          {disconnectingService === connector.id ? '...' : 'Disconnect'}
                        </button>
                      )}
                      {isDemoMode && (
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Demo</span>
                      )}
                    </>
                  ) : isExpired ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" style={{ color: '#C9B99A' }} />
                      <button
                        onClick={() => navigate('/get-started')}
                        className="text-[11px]"
                        style={{ color: '#C9B99A' }}
                      >
                        Reconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
                      {!isDemoMode && (
                        <button
                          onClick={() => navigate('/get-started')}
                          className="text-[11px]"
                          style={{ color: '#10b77f' }}
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
    </div>
  );
};

export default ConnectedPlatformsSettings;
