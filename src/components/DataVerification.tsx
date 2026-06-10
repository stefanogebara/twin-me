/**
 * DataVerification — Compact platform status pills
 *
 * Minimal inline display: icon + name + status dot.
 * No heavy glass cards — just a clean row of pills.
 */

import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import { PlatformLogo } from '@/components/PlatformLogos';

interface DataVerificationProps {
  /** Ignored — /platforms/summary is JWT-scoped. Optional for call-site compatibility. */
  userId?: string;
  connectedServices: string[];
}

const PLATFORM_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  google_calendar: 'Calendar',
  google_gmail: 'Gmail',
  gmail: 'Gmail',
  youtube: 'YouTube',
  discord: 'Discord',
  reddit: 'Reddit',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  whoop: 'Whoop',
  twitch: 'Twitch',
  outlook: 'Outlook',
  strava: 'Strava',
  oura: 'Oura',
  fitbit: 'Fitbit',
  garmin: 'Garmin',
  browser_extension: 'Browser',
};

export const DataVerification: React.FC<DataVerificationProps> = ({ connectedServices }) => {
  const [refreshing, setRefreshing] = useState(false);

  const { data: summary, refetch, isLoading } = usePlatformsSummary();

  useEffect(() => {
    if (connectedServices.length > 0) {
      refetch();
    }
  }, [connectedServices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Any breakdown entry counts as connected (canonical batch-3 semantics).
  const connectedPlatforms = summary?.breakdown ?? [];

  if (connectedPlatforms.length === 0 && !isLoading) return null;

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[11px] tracking-[0.08em] uppercase"
          style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          Platform Status
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 rounded-md transition-opacity hover:opacity-60"
          style={{ color: 'rgba(255,255,255,0.20)' }}
          aria-label="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Platform pills — flex wrap */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Checking...</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {connectedPlatforms.map((entry) => {
            const name = PLATFORM_NAMES[entry.platform] || entry.platform;
            // Only a genuine auth failure gets the red treatment; 'stale'
            // (no recent sync) just dims the check — never a reconnect demand.
            const expired = entry.state === 'expired';
            const stale = entry.state === 'stale';
            const lastSync = entry.lastSyncAt
              ? new Date(entry.lastSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null;

            return (
              <div
                key={entry.platform}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                title={lastSync ? `Last synced ${lastSync}` : 'Not synced yet'}
                style={{
                  backgroundColor: expired ? 'rgba(220,38,38,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${expired ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <PlatformLogo platform={entry.platform} size={14} />
                <span
                  className="text-[12px]"
                  style={{
                    color: expired ? 'rgba(220,38,38,0.8)' : 'rgba(255,255,255,0.50)',
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                  }}
                >
                  {name}
                </span>
                {expired ? (
                  <AlertCircle className="w-3 h-3" style={{ color: 'rgba(220,38,38,0.6)' }} />
                ) : (
                  <Check
                    className="w-3 h-3"
                    style={{ color: stale ? 'rgba(255,255,255,0.30)' : '#10b981' }}
                    strokeWidth={2.5}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
