import React from 'react';
import { motion } from 'framer-motion';
import { Music, Calendar, Heart, Tv, Gamepad2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { PlatformSummary, ConnectedPlatform } from './types';

interface PlatformMeta {
  label: string;
  icon: React.ElementType;
  color: string;
  extractMetric: (observations: string[]) => string;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  spotify: {
    label: 'Spotify',
    icon: Music,
    color: '#1DB954',
    extractMetric: (obs) => {
      const first = obs[0] || '';
      // Attempt to pull artist name and genre from first observation
      const artistMatch = first.match(/(?:listening to|played|track by)\s+([A-Za-z\s]+)/i);
      if (artistMatch) return `Playing ${artistMatch[1].trim()}`;
      if (first.length > 0) return first.slice(0, 52) + (first.length > 52 ? '…' : '');
      return 'Music data synced';
    },
  },
  calendar: {
    label: 'Calendar',
    icon: Calendar,
    color: '#4285F4',
    extractMetric: (obs) => {
      const first = obs[0] || '';
      if (first.length > 0) return first.slice(0, 52) + (first.length > 52 ? '…' : '');
      return 'Schedule synced';
    },
  },
  whoop: {
    label: 'Whoop',
    icon: Heart,
    color: '#FF4444',
    extractMetric: (obs) => {
      const text = obs.join(' ');
      const recoveryMatch = text.match(/(\d+)%\s*recovery/i);
      const hrvMatch = text.match(/(\d+(?:\.\d+)?)\s*ms\s*HRV/i);
      const sleepMatch = text.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:of\s*)?sleep/i);
      const parts: string[] = [];
      if (recoveryMatch) parts.push(`${recoveryMatch[1]}% recovery`);
      if (hrvMatch) parts.push(`${hrvMatch[1]}ms HRV`);
      if (sleepMatch) parts.push(`${sleepMatch[1]}h sleep`);
      if (parts.length > 0) return parts.join(' · ');
      const first = obs[0] || '';
      return first.length > 0 ? first.slice(0, 52) + (first.length > 52 ? '…' : '') : 'Health data synced';
    },
  },
  youtube: {
    label: 'YouTube',
    icon: Tv,
    color: '#FF0000',
    extractMetric: (obs) => {
      const first = obs[0] || '';
      if (first.length > 0) return first.slice(0, 52) + (first.length > 52 ? '…' : '');
      return 'Content synced';
    },
  },
  twitch: {
    label: 'Twitch',
    icon: Gamepad2,
    color: '#9146FF',
    extractMetric: (obs) => {
      const first = obs[0] || '';
      if (first.length > 0) return first.slice(0, 52) + (first.length > 52 ? '…' : '');
      return 'Channels synced';
    },
  },
};

function timeAgoShort(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  platform: string;
  platformData: PlatformSummary | null;
  connectedPlatforms: ConnectedPlatform[];
  animationDelay?: number;
}

export const BentoPlatformTile: React.FC<Props> = ({
  platform,
  platformData,
  connectedPlatforms,
  animationDelay = 0,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const meta = PLATFORM_META[platform.toLowerCase()];
  if (!meta) return null;

  // Platform names may differ between UI key and DB key (e.g. 'calendar' vs 'google_calendar')
  const PLATFORM_DB_KEY: Record<string, string> = { calendar: 'google_calendar' };
  const dbKey = PLATFORM_DB_KEY[platform.toLowerCase()] ?? platform.toLowerCase();

  const connected = connectedPlatforms.find(p =>
    p.platform.toLowerCase() === platform.toLowerCase() ||
    p.platform.toLowerCase() === dbKey
  );
  if (!connected) return null;

  const pData = platformData?.[platform.toLowerCase()] ?? platformData?.[dbKey];
  const metric = pData?.recentObservations && pData.recentObservations.length > 0
    ? meta.extractMetric(pData.recentObservations)
    : null;

  const syncLabel = connected.last_sync_at ? timeAgoShort(connected.last_sync_at) : null;
  const Icon = meta.icon;

  return (
    <motion.div
      className="rounded-2xl p-4 h-full"
      style={{
        backgroundColor: isDark ? 'rgba(30, 30, 26, 0.7)' : 'rgba(255, 255, 255, 0.8)',
        border: isDark ? '1px solid rgba(193, 192, 182, 0.07)' : '1px solid rgba(0, 0, 0, 0.05)',
        borderLeft: `3px solid ${meta.color}`,
        boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(0, 0, 0, 0.04)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: animationDelay, ease: 'easeOut' }}
    >
      {/* Platform header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${meta.color}1A` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
          </div>
          <span
            className="text-xs font-semibold"
            style={{ color: isDark ? '#C1C0B6' : '#1a1714' }}
          >
            {meta.label}
          </span>
        </div>
        {syncLabel && (
          <span
            className="text-xs"
            style={{ color: isDark ? 'rgba(193, 192, 182, 0.3)' : '#c4bfba' }}
          >
            {syncLabel}
          </span>
        )}
      </div>

      {/* Metric line */}
      <p
        className="text-xs leading-relaxed"
        style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#6b635e' }}
      >
        {metric ?? 'Data collecting…'}
      </p>

      {/* Live dot */}
      <div className="flex items-center gap-1.5 mt-3">
        <span
          className="w-1.5 h-1.5 rounded-full inline-block"
          style={{ backgroundColor: meta.color, boxShadow: `0 0 4px ${meta.color}80` }}
        />
        <span
          className="text-xs"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.3)' : '#c4bfba' }}
        >
          Connected
        </span>
      </div>
    </motion.div>
  );
};
