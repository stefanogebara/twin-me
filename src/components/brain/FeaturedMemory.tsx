import React from 'react';
import { toSecondPerson } from '@/lib/utils';
import {
  Memory,
  EXPERT_COLORS,
  EXPERT_LABELS,
  TYPE_COLORS,
  TYPE_LABELS,
  relativeTime,
  getPlatformLabel,
} from './brainConstants';

interface FeaturedMemoryProps {
  memory: Memory;
}

const FeaturedMemory: React.FC<FeaturedMemoryProps> = ({ memory }) => {
  const expert = (memory.metadata?.expert as string) || null;
  const expertColor = expert ? (EXPERT_COLORS[expert] || '#86807b') : null;
  const expertLabel = expert ? (EXPERT_LABELS[expert] || expert) : null;
  const typeColor = TYPE_COLORS[memory.memory_type] || '#6B7280';

  return (
    <div className="mb-8">
      <span
        className="block mb-3"
        style={{
          fontSize: '11px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: '#86807b',
        }}
      >
        Most Important
      </span>
      <div
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '20px',
        }}
      >
        {/* Top row: type/expert + importance */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {expertLabel ? (
              <span
                className="text-[11px] font-medium uppercase"
                style={{ color: expertColor || '#86807b', letterSpacing: '0.1em' }}
              >
                {expertLabel}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="rounded-full inline-block"
                  style={{ width: '6px', height: '6px', backgroundColor: typeColor }}
                />
                <span
                  className="text-[11px] font-medium uppercase"
                  style={{ color: '#86807b', letterSpacing: '0.1em' }}
                >
                  {TYPE_LABELS[memory.memory_type] || memory.memory_type}
                </span>
              </span>
            )}
          </div>
          <span
            className="text-[11px] font-medium"
            style={{ color: 'var(--accent-vibrant)' }}
          >
            {memory.importance_score}/10
          </span>
        </div>

        {/* Full content */}
        <p
          className="text-sm leading-relaxed mb-3"
          style={{ color: '#fdfcfb' }}
        >
          {toSecondPerson(memory.content)}
        </p>

        {/* Bottom: source + time */}
        <div className="flex items-center gap-3">
          {getPlatformLabel(memory.metadata) && (
            <span className="text-[11px]" style={{ color: '#86807b' }}>
              from {getPlatformLabel(memory.metadata)}
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {relativeTime(memory.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FeaturedMemory;
