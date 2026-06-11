/**
 * PlatformConnectionsStep — Step 1: Lists all platform categories with
 * connected/disconnected tiles, Google Workspace, data upload, and verification.
 */

import React, { useEffect, useState } from 'react';
import { DataProvider } from '@/types/data-integration';
import { AVAILABLE_CONNECTORS } from '../../onboarding/components/connectorConfig';
import { PlatformTile } from '../../onboarding/components/PlatformTile';
import { Link2 } from 'lucide-react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import {
  usePlatformsSummary,
  byPlatform,
  type PlatformBreakdownEntry,
} from '@/hooks/usePlatformsSummary';
import SoulRichnessBar from '../../../components/onboarding/SoulRichnessBar';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import GoogleWorkspaceConnect from '../settings/GoogleWorkspaceConnect';
import { SectionLabel, Divider } from './SectionLabel';
import { MirrorSourceTiles } from './MirrorSourceTiles';

/**
 * Mirror sources (replan-2026-06-10 Track C): synthetic 'web' / 'desktop'
 * breakdown entries get dedicated first-class cards, NOT generic connected
 * tiles (they have no token to manage and no catalog entry to fall back on).
 */
const MIRROR_PLATFORMS = new Set(['web', 'desktop']);

interface PlatformConnectionsStepProps {
  userId: string | undefined;
  connectedServices: DataProvider[];
  connectingProvider: DataProvider | null;
  disconnectingProvider: DataProvider | null;
  discoveredSet: Set<string>;
  connectService: (provider: DataProvider) => void;
  disconnectService: (provider: DataProvider) => void;
  navigate: (path: string) => void;
}

/**
 * Soft informational copy for stale connections. Per the batch-3 spec
 * (state-unification), 'stale' must NEVER demand a reconnect — only
 * 'expired' (genuine auth failure) does, via the needsReconnect tile state.
 */
function staleAttentionCopy(entry: PlatformBreakdownEntry): string {
  if (entry.lastSyncAt) {
    const days = Math.floor((Date.now() - new Date(entry.lastSyncAt).getTime()) / (24 * 60 * 60 * 1000));
    if (days > 0) {
      return `No sync in ${days}d — your twin may be working from older data.`;
    }
  }
  return 'Has not synced recently — your twin may be working from older data.';
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
  connectingProvider,
  disconnectingProvider,
  discoveredSet,
  connectService,
  disconnectService,
  navigate,
}) => {
  // Canonical platform state (batch-3 state-unification): per-tile expired/stale
  // comes from the /platforms/summary breakdown — no local re-derivation of the
  // stale threshold, which previously drifted from the backend's classification.
  const { data: summary, isLoading: summaryLoading } = usePlatformsSummary();
  const platformEntries = byPlatform(summary);

  // Mirror entries drive the first-class extension/desktop cards; everything
  // else flows through the generic connected/unconnected tile lists.
  const webEntry = platformEntries['web'];
  const desktopEntry = platformEntries['desktop'];
  const oauthConnectedServices = connectedServices.filter(p => !MIRROR_PLATFORMS.has(p));

  // For the DISCOVERY sections (unconnected tiles) we still hide coming-soon
  // entries — and the browser extension, which now lives in the Always-On
  // Sources cards above instead of a generic tile. But the CONNECTED list
  // MUST show every row from the DB, even those marked comingSoon in the
  // catalog (e.g. slack, oura, notion) — otherwise platforms the user
  // actually connected silently disappear from /connect (audit-2026-05-12 H5).
  const availableConnectors = AVAILABLE_CONNECTORS.filter(
    c => !c.comingSoon && c.provider !== 'browser_extension'
  );
  const connectorByProvider = new Map(AVAILABLE_CONNECTORS.map(c => [c.provider, c]));

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
          note={c.note || null}
          onConnect={() => connectService(c.provider)}
        />
      ));

  return (
    <div className="space-y-8">
      {/* Self-sufficient since batch-3 step 6: reads the canonical platforms
          summary itself and renders the shared Soul Score number. */}
      <SoulRichnessBar />

      {/* Always-On Sources — extension + desktop mirrors as first-class cards
          (replan-2026-06-10 Track C: these see everything; treat them like
          the moat, not a buried "Connect" tile). */}
      <SectionLabel label="Always-On Sources" />
      <MirrorSourceTiles
        webEntry={webEntry}
        desktopEntry={desktopEntry}
        onInstallExtension={() => connectService('browser_extension')}
        onDownloadDesktop={() => navigate('/download')}
      />
      <Divider />

      {/* Connected Section — list every platform_connections row for the user,
          including providers marked comingSoon in the catalog (H5). Mirrors
          are excluded — they render in Always-On Sources above. */}
      {oauthConnectedServices.length > 0 && (
        <>
          <SectionLabel label="Connected" />
          <div className="space-y-2">
            {oauthConnectedServices.map(provider => {
              const c = connectorByProvider.get(provider);
              const entry = platformEntries[provider];
              // Reconnect ONLY on genuine auth failure; stale gets soft copy.
              const needsReconnect = entry?.state === 'expired';
              const attention = entry?.state === 'stale' ? staleAttentionCopy(entry) : null;
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
                  note={c?.note || null}
                  onConnect={() => connectService(provider)}
                  onManage={() => disconnectService(provider)}
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
        summary={summary}
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
      {professionalConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Professional" />
          <div className="space-y-2">
            {renderUnconnectedTiles(professionalConnectors)}
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
