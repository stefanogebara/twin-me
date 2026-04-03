/**
 * ExpiredTokenBanner — Shows when platform tokens need reconnection.
 * Displays a compact glass card with the expired platforms and a reconnect CTA.
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';

const PLATFORM_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  google_calendar: 'Google Calendar',
  youtube: 'YouTube',
  google_gmail: 'Gmail',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  reddit: 'Reddit',
  twitch: 'Twitch',
  whoop: 'WHOOP',
  strava: 'Strava',
};

export function ExpiredTokenBanner() {
  const navigate = useNavigate();
  const { data: platformStatus } = usePlatformStatus();

  const expired = Object.entries(platformStatus || {})
    .filter(([, v]) => v.connected && (v.tokenExpired || v.status === 'expired' || v.status === 'token_expired'))
    .map(([k]) => PLATFORM_NAMES[k] || k);

  if (expired.length === 0) return null;

  const names = expired.length <= 2
    ? expired.join(' and ')
    : `${expired.slice(0, -1).join(', ')}, and ${expired[expired.length - 1]}`;

  return (
    <div
      className="flex items-center gap-3 mb-6 px-4 py-3 rounded-[16px]"
      style={{
        backgroundColor: 'rgba(251,191,36,0.06)',
        border: '1px solid rgba(251,191,36,0.15)',
      }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#FBBF24' }} />
      <p className="flex-1 text-sm" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}>
        {names} {expired.length === 1 ? 'needs' : 'need'} reconnecting to keep your twin up to date.
      </p>
      <button
        onClick={() => navigate('/get-started')}
        className="text-xs font-medium px-3 py-1.5 rounded-full flex-shrink-0 transition-opacity hover:opacity-80"
        style={{
          backgroundColor: 'rgba(251,191,36,0.15)',
          color: '#FBBF24',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Reconnect
      </button>
    </div>
  );
}
