import React from 'react';
import { motion } from 'framer-motion';
import { Database, Layers, Zap } from 'lucide-react';
import type { MemoryStats, ConnectedPlatform } from './types';

interface Props {
  stats: MemoryStats;
  firstMemoryAt: string | null;
  connectedPlatforms: ConnectedPlatform[];
}

export const BentoStatsTile: React.FC<Props> = ({ stats, firstMemoryAt, connectedPlatforms }) => {
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
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
    >
      <p
        className="text-xs uppercase tracking-widest font-medium mb-4"
        style={{ color: 'var(--text-secondary)' }}
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
                style={{ color: 'var(--foreground)' }}
              >
                {value}
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
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
