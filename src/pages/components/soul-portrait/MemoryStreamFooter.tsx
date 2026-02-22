import React from 'react';
import { Database, MessageSquare, Cpu, Eye } from 'lucide-react';
import type { MemoryStats } from './types';

interface Props {
  stats: MemoryStats;
  firstMemoryAt: string | null;
}

export const MemoryStreamFooter: React.FC<Props> = ({ stats, firstMemoryAt }) => {
  const twinAge = firstMemoryAt
    ? Math.max(1, Math.floor((Date.now() - new Date(firstMemoryAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const items = [
    { icon: Database, label: 'Memories', value: stats.total.toLocaleString() },
    { icon: Cpu, label: 'Reflections', value: (stats.byType?.reflection || 0).toLocaleString() },
    { icon: MessageSquare, label: 'Conversations', value: (stats.byType?.conversation || 0).toLocaleString() },
    { icon: Eye, label: 'Observations', value: ((stats.byType?.observation || 0) + (stats.byType?.platform_data || 0)).toLocaleString() },
  ];

  if (stats.total === 0 && !twinAge) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 rounded-xl"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        border: '1px solid rgba(0, 0, 0, 0.03)',
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" style={{ color: '#a8a29e' }} />
            <span className="text-xs" style={{ color: '#78716c' }}>
              {value} {label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>

      {twinAge && (
        <span className="text-xs" style={{ color: '#a8a29e' }}>
          Twin age: {twinAge} {twinAge === 1 ? 'day' : 'days'}
        </span>
      )}
    </div>
  );
};
