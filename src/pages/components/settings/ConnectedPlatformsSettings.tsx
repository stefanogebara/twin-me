import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogos';
import GoogleWorkspaceConnect from './GoogleWorkspaceConnect';
import { byPlatform, type PlatformsSummary } from '@/hooks/usePlatformsSummary';
import { RETIRED_PLATFORMS } from '@/lib/retiredPlatforms';
import { PLATFORM_DISPLAY_NAMES } from '@/lib/platformNames';

interface ConnectedPlatformsSettingsProps {
  summary: PlatformsSummary | undefined;
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

// Google services (Gmail, Calendar) are handled by GoogleWorkspaceConnect above.
// replan-2026-06-10 Track C: LinkedIn/Reddit/Twitch removed (OAuth stacks
// retired — existing connections render in the retired section below).
const connectorConfig: ConnectorConfig[] = [
  { id: 'spotify', name: 'Spotify', description: 'Music preferences and listening patterns', isOAuth: true },
  { id: 'youtube', name: 'YouTube', description: 'Content preferences and watch history', isOAuth: true },
  { id: 'github', name: 'GitHub', description: 'Coding activity and open source contributions', isOAuth: true },
  { id: 'whoop', name: 'Whoop', description: 'Recovery, strain, sleep, and HRV patterns', isOAuth: true },
];

// Demoted platforms (Discord, Outlook) shown ONLY when the user already has
// a connection — they keep working and can be disconnected, but we never
// invite new connections (a Connect button here would dead-end on
// /get-started, where their tiles no longer exist — the settings-dead-connect
// bug class from audit-2026-06-10). replan-2026-06-10 Track C demote.
const connectedOnlyConfig: ConnectorConfig[] = [
  { id: 'discord', name: 'Discord', description: 'Community activity and communication style', isOAuth: true },
  { id: 'microsoft_outlook', name: 'Outlook', description: 'Email patterns and calendar events', isOAuth: true },
];

const ConnectedPlatformsSettings: React.FC<ConnectedPlatformsSettingsProps> = ({
  summary,
  isLoading,
  error,
  disconnectingService,
  refetch,
  navigate,
  handleDisconnectService,
}) => {
  const platformMap = byPlatform(summary);

  // Inline two-step confirm for destructive disconnects (replaces native
  // window.confirm, which is unstyleable and inconsistent with the rest of
  // Settings — audit-2026-06-10). First click arms the row; a second click
  // (or the 'Confirm?' label) actually disconnects. Clicking elsewhere or
  // arming a different row resets the previous one.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const requestDisconnect = (id: string) => {
    if (confirmingId === id) {
      setConfirmingId(null);
      handleDisconnectService(id);
    } else {
      setConfirmingId(id);
    }
  };

  // Demoted rows appear only for users who already connected them.
  const visibleConnectors = [
    ...connectorConfig,
    ...connectedOnlyConfig.filter((c) => !!platformMap[c.id]),
  ];

  // Retired platforms (Track C portfolio cut) with a leftover connection row:
  // no Connect/Reconnect affordance — just an honest label and a Disconnect.
  const retiredConnected = Object.keys(platformMap)
    .filter((p) => RETIRED_PLATFORMS.has(p))
    .sort();

  return (
    <div>
      {/* Google Workspace — bundled connect card */}
      <GoogleWorkspaceConnect
        summary={summary}
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

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      ) : (
        <div className="space-y-0">
          {visibleConnectors.map((connector) => {
            // Batch-3 convention: a breakdown entry = connected; only
            // state==='expired' (genuine auth failure) demands a reconnect.
            // Stale (no recent sync) still renders as connected.
            const entry = platformMap[connector.id];
            const isExpired = entry?.state === 'expired';
            const isActiveConnection = !!entry && !isExpired;

            return (
              <div
                key={connector.id}
                className="flex items-center justify-between gap-3 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <PlatformLogo platform={connector.id} size={18} />
                  <div className="min-w-0">
                    <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                      {connector.name}
                    </span>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {connector.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isActiveConnection ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                      {connector.isOAuth && (
                        <button
                          onClick={() => requestDisconnect(connector.id)}
                          disabled={disconnectingService === connector.id}
                          className="text-[11px] min-h-[44px] px-2 transition-opacity hover:opacity-60"
                          style={{
                            color:
                              confirmingId === connector.id
                                ? '#ef4444'
                                : 'rgba(255,255,255,0.3)',
                          }}
                        >
                          {disconnectingService === connector.id
                            ? '...'
                            : confirmingId === connector.id
                            ? 'Confirm?'
                            : 'Disconnect'}
                        </button>
                      )}
                    </>
                  ) : isExpired ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" style={{ color: '#C9B99A' }} />
                      <button
                        onClick={() => navigate('/get-started')}
                        className="text-[11px] min-h-[44px] px-2"
                        style={{ color: '#C9B99A' }}
                      >
                        Reconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
                      <button
                        onClick={() => navigate('/get-started')}
                        className="text-[11px]"
                        style={{ color: '#10b77f' }}
                      >
                        Connect
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {retiredConnected.map((platform) => (
            <div
              key={platform}
              className="flex items-center justify-between gap-3 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1" style={{ opacity: 0.55 }}>
                <PlatformLogo platform={platform} size={18} />
                <div className="min-w-0">
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                    {PLATFORM_DISPLAY_NAMES[platform] ||
                      platform.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
                  </span>
                  <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    No longer supported — your past data stays in your twin
                  </p>
                </div>
              </div>
              <button
                onClick={() => requestDisconnect(platform)}
                disabled={disconnectingService === platform}
                className="text-[11px] min-h-[44px] px-2 transition-opacity hover:opacity-60 flex-shrink-0"
                style={{
                  color:
                    confirmingId === platform ? '#ef4444' : 'rgba(255,255,255,0.3)',
                }}
              >
                {disconnectingService === platform
                  ? '...'
                  : confirmingId === platform
                  ? 'Confirm?'
                  : 'Disconnect'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConnectedPlatformsSettings;
