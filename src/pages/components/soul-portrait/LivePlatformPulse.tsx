import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Music, Calendar, Heart } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { PlatformSummary, ConnectedPlatform } from './types';

const PLATFORM_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  spotify: { icon: Music, color: '#1DB954', label: 'Spotify' },
  calendar: { icon: Calendar, color: '#4285F4', label: 'Calendar' },
  whoop: { icon: Heart, color: '#FF4444', label: 'Whoop' },
  youtube: { icon: Activity, color: '#FF0000', label: 'YouTube' },
  twitch: { icon: Activity, color: '#9146FF', label: 'Twitch' },
};

interface Props {
  platformData: PlatformSummary | null;
  connectedPlatforms: ConnectedPlatform[];
}

export const LivePlatformPulse: React.FC<Props> = ({ platformData, connectedPlatforms }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (connectedPlatforms.length === 0) return null;

  const platformKeys = connectedPlatforms
    .map(p => p.platform.toLowerCase())
    .filter(p => PLATFORM_CONFIG[p]);

  if (platformKeys.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4" style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }} />
        <h3
          className="text-sm uppercase tracking-wider font-medium"
          style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
        >
          Live Data
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {platformKeys.map((platform, i) => {
          const config = PLATFORM_CONFIG[platform];
          if (!config) return null;

          const Icon = config.icon;
          const pData = platformData?.[platform];
          const connected = connectedPlatforms.find(p => p.platform.toLowerCase() === platform);

          return (
            <motion.div
              key={platform}
              className="p-4 rounded-xl"
              style={{
                backgroundColor: isDark ? 'rgba(45, 45, 41, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                border: isDark ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${config.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: config.color }} />
                </div>
                <div>
                  <span className="text-sm font-medium" style={{ color: isDark ? '#C1C0B6' : '#0c0a09' }}>
                    {config.label}
                  </span>
                  {connected?.last_sync_at && (
                    <p className="text-xs" style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
                      Synced {_timeAgo(connected.last_sync_at)}
                    </p>
                  )}
                </div>
              </div>

              {pData && pData.recentObservations.length > 0 ? (
                <div className="space-y-1.5">
                  {pData.recentObservations.slice(0, 2).map((obs, j) => (
                    <p
                      key={j}
                      className="text-xs leading-relaxed line-clamp-2"
                      style={{ color: isDark ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
                    >
                      {obs}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
                  Connected - data collecting
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

function _timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
