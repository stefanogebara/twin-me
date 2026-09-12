/**
 * ExpiredTokenBanner — Shows when platform tokens need reconnection.
 * One row of the page kit: the expired platforms and a reconnect action.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import { RETIRED_PLATFORMS } from '@/lib/retiredPlatforms';
import { List, Row } from '@/components/register';

const PLATFORM_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  google_calendar: 'Google Calendar',
  youtube: 'YouTube',
  google_gmail: 'Gmail',
  discord: 'Discord',
  github: 'GitHub',
  whoop: 'WHOOP',
};

// userId prop is ignored — the /platforms/summary endpoint is JWT-scoped.
// Kept optional so existing call sites keep compiling during the batch-3
// state-unification migration (audit-2026-06-10).
export function ExpiredTokenBanner(_props: { userId?: string } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const onConnectPage = location.pathname === '/connect' || location.pathname === '/get-started';
  const { data: summary } = usePlatformsSummary();

  // Canonical semantics: only state === 'expired' (genuine auth failure) earns
  // a reconnect demand. 'stale' (no recent sync) never triggers this banner.
  // Retired platforms (Track C portfolio cut) never demand a reconnect —
  // there is no live stack left to reconnect to.
  const expired = (summary?.breakdown ?? [])
    .filter((entry) => entry.state === 'expired' && !RETIRED_PLATFORMS.has(entry.platform))
    .map((entry) => PLATFORM_NAMES[entry.platform] || entry.platform);

  if (expired.length === 0) return null;

  const names = expired.length <= 2
    ? expired.join(' and ')
    : `${expired.slice(0, -1).join(', ')}, and ${expired[expired.length - 1]}`;

  return (
    <div style={{ marginBottom: 'var(--rg-section-phone)' }}>
      <List label="Needs reconnecting">
        <Row
          icon={<AlertTriangle />}
          title={`${names} ${expired.length === 1 ? 'needs' : 'need'} reconnecting`}
          line="To keep your twin up to date"
          action={!onConnectPage ? (
            <button type="button" onClick={() => navigate('/connect')} className="n-btn n-btn--ghost">
              Reconnect
            </button>
          ) : undefined}
        />
      </List>
    </div>
  );
}
