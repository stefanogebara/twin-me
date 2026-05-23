/**
 * PlatformConnectionsStep — Step 1: Lists all platform categories with
 * connected/disconnected tiles, Google Workspace, data upload, and verification.
 */

import React, { useEffect, useState } from 'react';
import { DataProvider } from '@/types/data-integration';
import { PlatformStatusData } from './onboardingTypes';
import { AVAILABLE_CONNECTORS } from '../../onboarding/components/connectorConfig';
import { PlatformTile } from '../../onboarding/components/PlatformTile';
import { Link2 } from 'lucide-react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import SoulRichnessBar from '../../../components/onboarding/SoulRichnessBar';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import GoogleWorkspaceConnect from '../settings/GoogleWorkspaceConnect';
import { SectionLabel, Divider } from './SectionLabel';

interface PlatformConnectionsStepProps {
  userId: string | undefined;
  connectedServices: DataProvider[];
  activeConnections: DataProvider[];
  platformStatusData: PlatformStatusData;
  loadingPlatformStatus?: boolean;
  connectingProvider: DataProvider | null;
  disconnectingProvider: DataProvider | null;
  discoveredSet: Set<string>;
  connectService: (provider: DataProvider) => void;
  disconnectService: (provider: DataProvider) => void;
  navigate: (path: string) => void;
}

function sortConnectors(
  connectors: typeof AVAILABLE_CONNECTORS,
  connectedServices: DataProvider[],
  discoveredSet: Set<string>,
) {
  return [...connectors].sort((a, b) => {
    const aConnected = connectedServices.includes(a.provider);
    const bConnected = connectedServices.includes(b.provider);
    if (aConnected && !bConnected) return -1;
    if (!aConnected && bConnected) return 1;
    const aDiscovered = discoveredSet.has(a.provider);
    const bDiscovered = discoveredSet.has(b.provider);
    if (aDiscovered && !bDiscovered) return -1;
    if (!aDiscovered && bDiscovered) return 1;
    return 0;
  });
}

export const PlatformConnectionsStep: React.FC<PlatformConnectionsStepProps> = ({
  userId,
  connectedServices,
  activeConnections,
  platformStatusData,
  loadingPlatformStatus = false,
  connectingProvider,
  disconnectingProvider,
  discoveredSet,
  connectService,
  disconnectService,
  navigate,
}) => {
  // For the DISCOVERY sections (unconnected tiles) we still hide coming-soon
  // entries. But the CONNECTED list MUST show every row from the DB, even
  // those marked comingSoon in the catalog (e.g. github, reddit, whoop, twitch)
  // — otherwise platforms the user actually connected silently disappear from
  // /connect (audit-2026-05-12 H5).
  const availableConnectors = AVAILABLE_CONNECTORS.filter(c => !c.comingSoon);
  const connectorByProvider = new Map(AVAILABLE_CONNECTORS.map(c => [c.provider, c]));
  // STALE_DAYS keeps the threshold in lockstep with /api/platforms/summary.
  const STALE_DAYS = 7;
  const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
  const computeAttention = (provider: string): string | null => {
    const status = platformStatusData[provider];
    if (!status) return null;
    if (status.tokenExpired) return null; // surfaced via needsReconnect already
    if (status.status === 'partial' || status.status === 'error') {
      return 'Last sync was partial — some data may be missing.';
    }
    if (status.lastSync) {
      const lastSyncMs = new Date(status.lastSync).getTime();
      const ageMs = Date.now() - lastSyncMs;
      if (ageMs > STALE_MS) {
        const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        return `No sync in ${days}d — try reconnecting if data feels stale.`;
      }
    }
    return null;
  };

  // Personalized pitch hooks — fetched once per mount. Silent fallback on failure.
  const [pitchHooks, setPitchHooks] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!userId) return;

    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API_URL}/connect/pitch-hooks`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.hooks) setPitchHooks(d.hooks); })
      .catch(() => { /* non-fatal */ });
  }, [userId]);
  const sort = (list: typeof AVAILABLE_CONNECTORS) => sortConnectors(list, connectedServices, discoveredSet);

  const entertainmentConnectors = sort(availableConnectors.filter(c => c.category === 'entertainment'));
  const healthConnectors = sort(availableConnectors.filter(c => c.category === 'health'));
  const socialConnectors = sort(availableConnectors.filter(c => c.category === 'social'));
  const professionalConnectors = sort(availableConnectors.filter(c => c.category === 'professional'));
  const browsingConnectors = sort(availableConnectors.filter(c => c.category === 'browsing'));

  const renderUnconnectedTiles = (connectors: typeof AVAILABLE_CONNECTORS) =>
    sort(connectors)
      .filter(c => !connectedServices.includes(c.provider))
      .map(c => (
        <PlatformTile
          key={c.provider}
          name={c.name}
          description={c.description}
          icon={c.icon}
          color={c.color}
          connected={false}
          comingSoon={c.comingSoon}
          syncing={connectingProvider === c.provider}
          pitchHook={pitchHooks[c.provider] || null}
          onConnect={() => connectService(c.provider)}
        />
      ));

  return (
    <div className="space-y-8">
      <SoulRichnessBar isLoading={loadingPlatformStatus} connectedPlatforms={activeConnections.filter(p => {
        const status = platformStatusData[p];
        return !status?.tokenExpired && status?.status !== 'token_expired';
      })} />

      {/* Connected Section — list every platform_connections row for the user,
          including providers marked comingSoon in the catalog (H5). */}
      {connectedServices.length > 0 && (
        <>
          <SectionLabel label="Connected" />
          <div className="space-y-2">
            {connectedServices.map(provider => {
              const c = connectorByProvider.get(provider);
              const status = platformStatusData[provider];
              const needsReconnect = status?.tokenExpired || status?.status === 'token_expired';
              const attention = computeAttention(provider);
              // Fallback presentation for platforms missing from the catalog —
              // shouldn't normally happen, but keeps connected rows visible.
              const display = c ?? {
                name: provider.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
                description: 'Connected via OAuth.',
                icon: <Link2 className="w-6 h-6" />,
                color: 'rgba(255,255,255,0.45)',
              };
              return (
                <PlatformTile
                  key={provider}
                  name={display.name}
                  description={display.description}
                  icon={display.icon}
                  color={display.color}
                  connected={true}
                  needsReconnect={needsReconnect}
                  syncing={connectingProvider === provider}
                  attention={attention}
                  onConnect={() => connectService(provider as typeof activeConnections[number])}
                  onManage={() => disconnectService(provider as typeof activeConnections[number])}
                />
              );
            })}
          </div>
          <Divider />
        </>
      )}

      {/* Google Workspace */}
      <SectionLabel label="Google Workspace" />
      <p
        className="text-[13px] -mt-2 mb-4 leading-relaxed"
        style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Access emails, calendar, Drive files, Docs, and Sheets — your twin reads and understands your work
      </p>
      <GoogleWorkspaceConnect
        connectorStatus={platformStatusData}
        navigate={navigate}
      />
      <p
        className="text-[11px] mt-3"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Your data stays yours. We never train AI on your personal data or sell it.
      </p>

      {/* Entertainment */}
      {entertainmentConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Entertainment" />
          <div className="space-y-2">
            {renderUnconnectedTiles(entertainmentConnectors)}
          </div>
        </>
      )}

      {/* Health & Fitness */}
      {healthConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Health & Fitness" />
          <div className="space-y-2">
            {renderUnconnectedTiles(healthConnectors)}
          </div>
        </>
      )}

      {/* Social & Community */}
      {socialConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Social & Community" />
          <div className="space-y-2">
            {renderUnconnectedTiles(socialConnectors)}
          </div>
        </>
      )}

      {/* Professional */}
      {[...professionalConnectors, ...browsingConnectors].some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Professional" />
          <div className="space-y-2">
            {renderUnconnectedTiles([...professionalConnectors, ...browsingConnectors])}
          </div>
        </>
      )}

      {/* Upload historical data */}
      {userId && (
        <>
          <Divider />
          <SectionLabel label="Upload Historical Data" />
          <DataUploadPanel userId={userId} />
        </>
      )}
    </div>
  );
};
