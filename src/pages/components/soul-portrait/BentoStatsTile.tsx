import React from 'react';
import { motion } from 'framer-motion';
import { Database, Layers, Zap } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { MemoryStats, ConnectedPlatform } from './types';

interface Props {
  stats: MemoryStats;
  firstMemoryAt: string | null;
  connectedPlatforms: ConnectedPlatform[];
}

export const BentoStatsTile: React.FC<Props> = ({ stats, firstMemoryAt, connectedPlatforms }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const twinAge = firstMemoryAt
    ? Math.max(1, Math.floor((Date.now() - new Date(firstMemoryAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const connectedCount = connectedPlatforms.filter(p => p.status === 'active' || p.last_sync_at).length;

  const statItems = [
    {
      icon: Zap,
      value: twinAge ? `${twinAge}d` : '—',
      label: 'Twin age',
      color: '#F39C12',
    },
    {
      icon: Database,
      value: stats.total >= 1000 ? `${(stats.total / 1000).toFixed(1)}k` : stats.total.toString(),
      label: 'Memories',
      color: '#9B59B6',
    },
    {
      icon: Layers,
      value: connectedCount.toString(),
      label: 'Sources',
      color: '#3498DB',
    },
  ];

  return (
    <motion.div
      className="rounded-2xl p-5 h-full flex flex-col justify-between"
      style={{
        backgroundColor: isDark ? 'rgba(30, 30, 26, 0.7)' : 'rgba(255, 255, 255, 0.8)',
        border: isDark ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.3)' : '0 4px 20px rgba(0, 0, 0, 0.04)',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
    >
      <p
        className="text-xs uppercase tracking-widest font-medium mb-4"
        style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}
      >
        Twin Stats
      </p>

      <div className="space-y-4 flex-1">
        {statItems.map(({ icon: Icon, value, label, color }) => (
          <div key={label} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}18` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <p
                className="text-lg font-semibold leading-none mb-0.5"
                style={{ color: isDark ? '#E8E6D9' : '#1a1714' }}
              >
                {value}
              </p>
              <p
                className="text-xs"
                style={{ color: isDark ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}
              >
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
