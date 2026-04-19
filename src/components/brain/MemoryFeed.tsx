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

interface MemoryFeedProps {
  memories: Memory[];
  hasFeatured: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const MemoryFeed: React.FC<MemoryFeedProps> = ({
  memories,
  hasFeatured,
  expandedId,
  onToggleExpand,
  hasMore,
  loadingMore,
  onLoadMore,
}) => {
  return (
    <>
      <div className="mb-6">
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
          {hasFeatured ? 'All Memories' : 'Memories'}
        </span>

        <div>
          {memories.map((memory, idx) => {
            const expert = (memory.metadata?.expert as string) || null;
            const expertColor = expert ? (EXPERT_COLORS[expert] || '#86807b') : null;
            const expertLabel = expert ? (EXPERT_LABELS[expert] || expert) : null;
            const typeColor = TYPE_COLORS[memory.memory_type] || '#6B7280';
            const platformLabel = getPlatformLabel(memory.metadata);
            const rawContent = toSecondPerson(memory.content);
            const displayContent = rawContent
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .replace(/\*([^*]+)\*/g, '$1')
              .replace(/_{2}([^_]+)_{2}/g, '$1')
              .replace(/_([^_]+)_/g, '$1');
            const isExpanded = expandedId === memory.id;
            const isLast = idx === memories.length - 1;

            return (
              <div
                key={memory.id}
                className="cursor-pointer transition-colors"
                style={{
                  borderBottom: isLast ? 'none' : '1px solid var(--sidebar)',
                  background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
                onClick={() => onToggleExpand(memory.id)}
                onMouseEnter={(e) => {
                  if (!isExpanded) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {/* Collapsed row */}
                <div
                  className="flex items-center gap-3"
                  style={{ padding: '10px 4px', minHeight: '40px' }}
                >
                  <span
                    className="flex-shrink-0 rounded-full"
                    style={{
                      width: '5px',
                      height: '5px',
                      backgroundColor: typeColor,
                      marginTop: '1px',
                    }}
                  />
                  <span
                    className="flex-1 min-w-0 text-sm truncate"
                    style={{
                      color: '#fdfcfb',
                      lineHeight: '20px',
                    }}
                  >
                    {displayContent}
                  </span>
                  <span
                    className="flex-shrink-0 text-[11px]"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    {memory.importance_score}/10
                  </span>
                  <span
                    className="flex-shrink-0 text-[11px]"
                    style={{
                      color: 'rgba(255,255,255,0.2)',
                      minWidth: '48px',
                      textAlign: 'right',
                    }}
                  >
                    {relativeTime(memory.created_at)}
                  </span>
                </div>

                {/* Expanded content (accordion) */}
                {isExpanded && (
                  <div style={{ padding: '0 4px 14px 18px' }}>
                    <p
                      className="text-sm leading-relaxed mb-3"
                      style={{ color: 'rgba(255,255,255,0.8)' }}
                    >
                      {displayContent}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {expertLabel && (
                        <span
                          className="text-[11px] font-medium uppercase"
                          style={{ color: expertColor || '#86807b', letterSpacing: '0.08em' }}
                        >
                          {expertLabel}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-1"
                        style={{ color: '#86807b' }}
                      >
                        <span
                          className="rounded-full inline-block"
                          style={{ width: '5px', height: '5px', backgroundColor: typeColor }}
                        />
                        <span className="text-[11px]">
                          {TYPE_LABELS[memory.memory_type] || memory.memory_type}
                        </span>
                      </span>
                      {platformLabel && (
                        <span className="text-[11px]" style={{ color: '#86807b' }}>
                          from {platformLabel}
                        </span>
                      )}
                      {memory.retrieval_count > 0 && (
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          accessed {memory.retrieval_count}x
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center mb-8">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{
              border: '1px solid var(--border)',
              color: '#86807b',
              background: 'transparent',
              borderRadius: '100px',
            }}
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
                />
                Loading...
              </span>
            ) : (
              'Load more memories'
            )}
          </button>
        </div>
      )}
    </>
  );
};

export default MemoryFeed;
