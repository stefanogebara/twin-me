/**
 * PlatformConnectionsStep — Step 1, in the page kit: the soul score, then what
 * is connected, then what is left to connect (the extension, Google Workspace
 * and every platform category as one list), then the historical upload.
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
import { MirrorSourceTiles } from './MirrorSourceTiles';
import { RETIRED_PLATFORMS } from '@/lib/retiredPlatforms';
import { Section, List } from '@/components/register';

/**
 * Mirror sources (replan-2026-06-10 Track C): synthetic 'web' / 'desktop'
 * breakdown entries get a dedicated first-class row, NOT generic connected
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
      return `No sync in ${days} ${days === 1 ? 'day' : 'days'}`;
    }
  }
  return 'Not synced lately';
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
  discoveredSet,
  connectService,
  disconnectService,
  navigate,
}) => {
  // Canonical platform state (batch-3 state-unification): per-tile expired/stale
  // comes from the /platforms/summary breakdown — no local re-derivation of the
  // stale threshold, which previously drifted from the backend's classification.
  const { data: summary } = usePlatformsSummary();
  const platformEntries = byPlatform(summary);

  // The mirror entry drives the extension row; everything else flows through
  // the generic connected/unconnected tile lists.
  const webEntry = platformEntries['web'];
  // Retired platforms (Track C portfolio cut) render NOTHING here — their
  // connection rows still exist in the DB but are no longer polled; Settings
  // is the only surface that still surfaces them (as "No longer supported").
  const oauthConnectedServices = connectedServices.filter(
    p => !MIRROR_PLATFORMS.has(p) && !RETIRED_PLATFORMS.has(p)
  );

  // Google Workspace sits with the connected rows once any Google service is
  // live (bundled scopes; only 'expired' counts as not connected).
  const isAnyGoogleConnected = !!summary?.breakdown.some(
    (entry) => entry.platform.startsWith('google_') && entry.state !== 'expired'
  );

  // For the DISCOVERY list (unconnected tiles) we still hide coming-soon
  // entries — and the browser extension, which has its own row. But the
  // CONNECTED list MUST show every row from the DB, even those marked
  // comingSoon in the catalog (e.g. slack, oura, notion) — otherwise platforms
  // the user actually connected silently disappear from /connect
  // (audit-2026-05-12 H5). unlisted = demoted platforms (Discord, Outlook):
  // connected rows still render via connectorByProvider below, but no
  // discovery tile invites new connections (replan-2026-06-10 Track C).
  const availableConnectors = AVAILABLE_CONNECTORS.filter(
    c => !c.comingSoon && !c.unlisted && c.provider !== 'browser_extension'
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

  // Every category, in the old section order, as one list of what is left.
  const unconnected = ['entertainment', 'health', 'social', 'professional'].flatMap(category =>
    sort(availableConnectors.filter(c => c.category === category))
      .filter(c => !connectedServices.includes(c.provider))
  );

  const hasConnected = !!webEntry || isAnyGoogleConnected || oauthConnectedServices.length > 0;

  return (
    <div>
      {/* Self-sufficient since batch-3 step 6: reads the canonical platforms
          summary itself and renders the shared Soul Score number. */}
      <Section>
        <SoulRichnessBar />
      </Section>

      {/* Connected — list every platform_connections row for the user,
          including providers marked comingSoon in the catalog (H5). */}
      {hasConnected && (
        <Section title="Connected" line="Always on, and what you have linked.">
          <List label="Connected" className="pb-stack">
            {webEntry && (
              <MirrorSourceTiles
                webEntry={webEntry}
                onInstallExtension={() => connectService('browser_extension')}
              />
            )}
            {isAnyGoogleConnected && <GoogleWorkspaceConnect summary={summary} navigate={navigate} />}
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
                description: 'Connected',
                icon: <Link2 className="w-6 h-6" />,
                color: 'var(--rg-ink-2)',
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
          </List>
        </Section>
      )}

      {/* What is left: the extension and Google Workspace first, then every
          category's unconnected platforms. */}
      <Section title="More to connect" line="Your data stays yours. We never train on it or sell it.">
        <List label="More to connect" className="pb-stack">
          {!webEntry && (
            <MirrorSourceTiles
              webEntry={webEntry}
              onInstallExtension={() => connectService('browser_extension')}
            />
          )}
          {!isAnyGoogleConnected && <GoogleWorkspaceConnect summary={summary} navigate={navigate} />}
          {unconnected.map(c => (
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
          ))}
        </List>
      </Section>

      {/* Upload historical data */}
      {userId && (
        <Section title="Upload your history" line="The years the platforms cannot send.">
          <DataUploadPanel userId={userId} />
        </Section>
      )}
    </div>
  );
};
