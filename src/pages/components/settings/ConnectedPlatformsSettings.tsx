import React, { useState } from 'react';
import { Loader2, AlertCircle, Link2 } from 'lucide-react';
import { PlatformLogo, getPlatformLogo } from '@/components/PlatformLogos';
import GoogleWorkspaceConnect from './GoogleWorkspaceConnect';
import { byPlatform, type PlatformsSummary } from '@/hooks/usePlatformsSummary';
import { RETIRED_PLATFORMS } from '@/lib/retiredPlatforms';
import { PLATFORM_DISPLAY_NAMES } from '@/lib/platformNames';
import { List, Row } from '@/components/register';

interface ConnectedPlatformsSettingsProps {
  summary: PlatformsSummary | undefined;
  isLoading: boolean;
  error: string | null;
  disconnectingService: string | null;
  /** The refresh lives in the section heading's action (Settings owns it). */
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
  { id: 'spotify', name: 'Spotify', description: 'What you listen to, and when', isOAuth: true },
  { id: 'youtube', name: 'YouTube', description: 'What you watch', isOAuth: true },
  { id: 'github', name: 'GitHub', description: 'What you build, and when', isOAuth: true },
  { id: 'whoop', name: 'Whoop', description: 'Sleep, recovery and strain', isOAuth: true },
];

// Demoted platforms (Discord, Outlook) shown ONLY when the user already has
// a connection — they keep working and can be disconnected, but we never
// invite new connections (a Connect button here would dead-end on
// /get-started, where their tiles no longer exist — the settings-dead-connect
// bug class from audit-2026-06-10). replan-2026-06-10 Track C demote.
const connectedOnlyConfig: ConnectorConfig[] = [
  { id: 'discord', name: 'Discord', description: 'Your communities and how you talk', isOAuth: true },
  { id: 'microsoft_outlook', name: 'Outlook', description: 'Email and calendar', isOAuth: true },
];

const ConnectedPlatformsSettings: React.FC<ConnectedPlatformsSettingsProps> = ({
  summary,
  isLoading,
  error,
  disconnectingService,
  navigate,
  handleDisconnectService,
}) => {
  const platformMap = byPlatform(summary);

  // Inline two-step confirm for destructive disconnects (replaces native
  // window.confirm, which is unstyleable and inconsistent with the rest of
  // Settings — audit-2026-06-10). First click arms the row; a second click
  // (or the 'Confirm' label) actually disconnects. Clicking elsewhere or
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

  // A platform without a logo (Outlook) gets a plain link glyph, not an empty square.
  const logo = (id: string) =>
    getPlatformLogo(id) ? <PlatformLogo platform={id} size={16} /> : <Link2 />;

  const disconnectButton = (id: string) => (
    <button
      type="button"
      onClick={() => requestDisconnect(id)}
      disabled={disconnectingService === id}
      className={`n-btn n-btn--ghost${confirmingId === id ? ' rs-danger' : ''}`}
    >
      {disconnectingService === id ? 'Disconnecting' : confirmingId === id ? 'Confirm' : 'Disconnect'}
    </button>
  );

  return (
    <List label="Connected platforms" className="pb-stack">
      {/* Google Workspace — one row for the bundled connection */}
      <GoogleWorkspaceConnect summary={summary} navigate={navigate} />

      {error && (
        <li className="rs-note rs-bad" role="alert">
          <AlertCircle aria-hidden="true" />
          {error}
        </li>
      )}

      {isLoading ? (
        <li className="rs-note">
          <Loader2 className="animate-spin" aria-hidden="true" />
          Checking your platforms
        </li>
      ) : (
        <>
          {visibleConnectors.map((connector) => {
            // Batch-3 convention: a breakdown entry = connected; only
            // state==='expired' (genuine auth failure) demands a reconnect.
            // Stale (no recent sync) still renders as connected.
            const entry = platformMap[connector.id];
            const isExpired = entry?.state === 'expired';
            const isActiveConnection = !!entry && !isExpired;

            return (
              <Row
                key={connector.id}
                icon={logo(connector.id)}
                title={connector.name}
                line={isActiveConnection
                  ? <span className="rs-ok">Connected</span>
                  : isExpired
                    ? <span className="rs-strong">Needs reconnecting</span>
                    : connector.description}
                action={isActiveConnection ? (
                  connector.isOAuth ? disconnectButton(connector.id) : undefined
                ) : isExpired ? (
                  <button type="button" onClick={() => navigate('/get-started')} className="n-btn n-btn--ghost">
                    Reconnect
                  </button>
                ) : (
                  <button type="button" onClick={() => navigate('/get-started')} className="n-btn n-btn--ghost">
                    Connect
                  </button>
                )}
              />
            );
          })}

          {retiredConnected.map((platform) => (
            <Row
              key={platform}
              icon={logo(platform)}
              title={PLATFORM_DISPLAY_NAMES[platform] ||
                platform.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
              line="No longer supported. Past data stays."
              action={disconnectButton(platform)}
            />
          ))}
        </>
      )}
    </List>
  );
};

export default ConnectedPlatformsSettings;
