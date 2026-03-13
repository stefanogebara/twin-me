import React from 'react';
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

  const connectedCount = connectedPlatforms.length;

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
    <div
      className="rounded-lg p-5 h-full flex flex-col justify-between"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <p
        className="text-[11px] font-medium tracking-widest uppercase mb-4"
        style={{ color: '#10b77f' }}
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
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
