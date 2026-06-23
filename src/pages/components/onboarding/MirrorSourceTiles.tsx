/**
 * MirrorSourceTiles — first-class cards for the always-on mirror sources
 * (browser extension + desktop app), replan-2026-06-10 Track C.
 *
 * Neither mirror has a platform_connections row: the summary endpoint
 * synthesizes 'web' / 'desktop' breakdown entries (source: 'mirror') from
 * recent data presence. Connected mirrors show freshness + yield instead of
 * a Manage/Disconnect menu — there is no token to manage; the extension is
 * removed from the browser and the desktop app is uninstalled.
 */

import React from 'react';
import { Check, Monitor } from 'lucide-react';
import type { PlatformBreakdownEntry } from '@/hooks/usePlatformsSummary';
import { AVAILABLE_CONNECTORS } from '../../onboarding/components/connectorConfig';

const FONT = "'Geist', 'Inter', system-ui, sans-serif";

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'recently';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface MirrorTileProps {
  name: string;
  icon: React.ReactNode;
  color: string;
  connected: boolean;
  /** Connected: freshness + yield line. Disconnected: pitch copy. */
  description: string;
  ctaLabel: string;
  onCta: () => void;
}

const MirrorTile: React.FC<MirrorTileProps> = ({
  name,
  icon,
  color,
  connected,
  description,
  ctaLabel,
  onCta,
}) => (
  <div
    className="flex items-center gap-4 px-5 py-4 rounded-[20px] transition-colors duration-150"
    style={{
      background: connected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(42px)',
      WebkitBackdropFilter: 'blur(42px)',
      border: `1px solid ${connected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
      boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
    }}
  >
    <div
      className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        color: connected ? color : 'rgba(255, 255, 255, 0.55)',
      }}
    >
      {icon}
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span
          className="text-[14px] font-medium truncate"
          style={{ color: '#F5F5F4', fontFamily: FONT }}
        >
          {name}
        </span>
        {connected && (
          <Check
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: '#10b981' }}
            strokeWidth={2.5}
          />
        )}
      </div>
      <span
        className="text-[12px] leading-relaxed line-clamp-2 block mt-0.5"
        style={{ color: connected ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.50)', fontFamily: FONT }}
      >
        {description}
      </span>
    </div>

    {connected ? (
      <span
        className="text-[12px] font-medium px-4 py-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: 'rgba(16,185,129,0.10)',
          color: '#10b981',
          border: '1px solid rgba(16,185,129,0.18)',
          fontFamily: FONT,
        }}
      >
        Active
      </span>
    ) : (
      <button
        onClick={onCta}
        className="text-[12px] font-medium px-4 py-1.5 rounded-full flex-shrink-0 transition-all duration-150 hover:opacity-90"
        style={{ backgroundColor: '#F5F5F4', color: '#110f0f', fontFamily: FONT }}
      >
        {ctaLabel}
      </button>
    )}
  </div>
);

interface MirrorSourceTilesProps {
  /** Synthetic 'web' breakdown entry from /platforms/summary, if present. */
  webEntry: PlatformBreakdownEntry | undefined;
  /** Synthetic 'desktop' breakdown entry from /platforms/summary, if present. */
  desktopEntry: PlatformBreakdownEntry | undefined;
  /** Opens the Chrome Web Store listing (connectService('browser_extension')). */
  onInstallExtension: () => void;
  /** Navigates to the existing /download route. */
  onDownloadDesktop: () => void;
}

export const MirrorSourceTiles: React.FC<MirrorSourceTilesProps> = ({
  webEntry,
  desktopEntry,
  onInstallExtension,
  onDownloadDesktop,
}) => {
  const extensionConfig = AVAILABLE_CONNECTORS.find(c => c.provider === 'browser_extension');

  const pages = webEntry?.observations7d ?? 0;
  const webDescription = webEntry
    ? `${pages} ${pages === 1 ? 'page' : 'pages'} observed this week · last activity ${relativeTime(webEntry.lastSyncAt)}`
    : extensionConfig?.description ??
      'Track everything you browse — pages visited, reading time, content topics, search queries, and engagement patterns';

  const desktopDescription = desktopEntry
    ? `Mirroring your desktop activity · last activity ${relativeTime(desktopEntry.lastSyncAt)}`
    : 'Mirror your real work — the apps you use, windows you focus, and meetings you join feed your twin automatically';

  return (
    <div className="space-y-2">
      <MirrorTile
        name="Browser Extension"
        icon={extensionConfig?.icon ?? <Monitor className="w-6 h-6" />}
        color={extensionConfig?.color ?? 'var(--accent-vibrant)'}
        connected={!!webEntry}
        description={webDescription}
        ctaLabel="Connect"
        onCta={onInstallExtension}
      />
      <MirrorTile
        name="Desktop App"
        icon={<Monitor className="w-6 h-6" />}
        color="var(--accent-vibrant)"
        connected={!!desktopEntry}
        description={desktopDescription}
        ctaLabel="Download"
        onCta={onDownloadDesktop}
      />
    </div>
  );
};

export default MirrorSourceTiles;
