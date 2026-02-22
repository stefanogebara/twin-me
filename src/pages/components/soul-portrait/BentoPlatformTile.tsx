import React from 'react';
import { motion } from 'framer-motion';
import { Music, Calendar, Tv } from 'lucide-react';
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
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        borderLeft: `3px solid ${meta.color}`,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
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
            style={{ color: '#1F1C18' }}
          >
            {meta.label}
          </span>
        </div>
        {syncLabel && (
          <span
            className="text-xs"
            style={{ color: '#c4bfba' }}
          >
            {syncLabel}
          </span>
        )}
      </div>

      {/* Metric line */}
      <p
        className="text-xs leading-relaxed"
        style={{ color: '#6b635e' }}
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
          style={{ color: '#c4bfba' }}
        >
          Connected
        </span>
      </div>
    </motion.div>
  );
};
