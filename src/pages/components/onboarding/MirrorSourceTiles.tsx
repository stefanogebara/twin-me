/**
 * MirrorSourceTiles — the always-on mirror source (browser extension) as one
 * row of the page kit, replan-2026-06-10 Track C. Render it inside a List.
 *
 * The mirror has no platform_connections row: the summary endpoint
 * synthesizes a 'web' breakdown entry (source: 'mirror') from recent data
 * presence. Connected, it shows freshness + yield instead of a Manage menu —
 * there is no token to manage; the extension is removed from the browser.
 */

import React from 'react';
import { Monitor } from 'lucide-react';
import type { PlatformBreakdownEntry } from '@/hooks/usePlatformsSummary';
import { AVAILABLE_CONNECTORS } from '../../onboarding/components/connectorConfig';
import { Row } from '@/components/register';

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

interface MirrorSourceTilesProps {
  /** Synthetic 'web' breakdown entry from /platforms/summary, if present. */
  webEntry: PlatformBreakdownEntry | undefined;
  /** Opens the Chrome Web Store listing (connectService('browser_extension')). */
  onInstallExtension: () => void;
}

// Phase 1 (2026-08-10): the Desktop App tile is gone — desktop is no longer
// the bet. Existing 'desktop' platform rows keep their data; the extension is
// the one always-on mirror we invite users to install.
export const MirrorSourceTiles: React.FC<MirrorSourceTilesProps> = ({
  webEntry,
  onInstallExtension,
}) => {
  const extensionConfig = AVAILABLE_CONNECTORS.find(c => c.provider === 'browser_extension');

  const pages = webEntry?.observations7d ?? 0;

  return (
    <Row
      icon={extensionConfig?.icon ?? <Monitor />}
      title="Browser extension"
      line={webEntry
        ? <><span className="rs-ok">Active</span> · {pages} {pages === 1 ? 'page' : 'pages'} this week, last {relativeTime(webEntry.lastSyncAt)}</>
        : extensionConfig?.description ?? 'The pages you read, and for how long'}
      action={webEntry ? undefined : (
        <button type="button" onClick={onInstallExtension} className="n-btn n-btn--ghost">Connect</button>
      )}
    />
  );
};

export default MirrorSourceTiles;
