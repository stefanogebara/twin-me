/**
 * DataVerification — Compact platform status pills
 *
 * Minimal inline display: icon + name + status dot.
 * No heavy glass cards — just a clean row of pills.
 */

import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { PlatformLogo } from '@/components/PlatformLogos';

interface DataVerificationProps {
  userId: string;
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

export const DataVerification: React.FC<DataVerificationProps> = ({ userId, connectedServices }) => {
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: platformStatuses,
    refetch: refetchPlatformStatus,
    isLoading,
  } = usePlatformStatus(userId, {
    enableRealtime: true,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (connectedServices.length > 0) {
      refetchPlatformStatus();
    }
  }, [connectedServices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchPlatformStatus();
    setTimeout(() => setRefreshing(false), 500);
  };

  const connectedPlatforms = Object.entries(platformStatuses).filter(
    ([, s]) => s?.connected
  );

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
          {connectedPlatforms.map(([platform, status]) => {
            const name = PLATFORM_NAMES[platform] || platform;
            const expired = status?.tokenExpired || status?.status === 'token_expired';

            return (
              <div
                key={platform}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  backgroundColor: expired ? 'rgba(220,38,38,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${expired ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <PlatformLogo platform={platform} size={14} />
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
                  <Check className="w-3 h-3" style={{ color: '#10b981' }} strokeWidth={2.5} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
