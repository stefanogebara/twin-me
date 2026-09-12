import React from 'react';
import { ChevronDown } from 'lucide-react';
import { toSecondPerson } from '@/lib/utils';
import { Section } from '@/components/register';
import {
  Memory,
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

/**
 * The memory feed, in the register: a section of rows under the ink rule.
 * Each row is the memory (one line, clipped) over one grey line (its kind,
 * importance and age, the kind as a coloured dot); pressing it opens the full
 * text and its sources underneath. Was 11px #86807b meta (3.74:1) and a
 * tracked-caps "MEMORIES" label.
 */
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
    <Section title={hasFeatured ? 'All memories' : 'Memories'}>
      <ul className="rg-list">
        {memories.map((memory) => {
          const expert = (memory.metadata?.expert as string) || null;
          const expertLabel = expert ? (EXPERT_LABELS[expert] || expert) : null;
          const typeColor = TYPE_COLORS[memory.memory_type] || '#8c8889';
          const typeLabel = TYPE_LABELS[memory.memory_type] || memory.memory_type;
          const platformLabel = getPlatformLabel(memory.metadata);
          const rawContent = toSecondPerson(memory.content);
          const displayContent = rawContent
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_{2}([^_]+)_{2}/g, '$1')
            .replace(/_([^_]+)_/g, '$1');
          const isExpanded = expandedId === memory.id;

          return (
            <li key={memory.id}>
              <button
                type="button"
                className="rg-row rg-row--link rg-row--plain"
                aria-expanded={isExpanded}
                onClick={() => onToggleExpand(memory.id)}
                style={isExpanded ? { borderBottomColor: 'transparent' } : undefined}
              >
                <span className="rg-row-text">
                  {/* One clipped line; the whole memory once pressed open. */}
                  <span
                    className="rg-row-title"
                    style={isExpanded ? undefined : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {displayContent}
                  </span>
                  <span className="rg-row-line inline-flex items-center gap-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {/* Collapsed row: the dot is the kind's colour, named in the text beside it */}
                    <span
                      aria-hidden="true"
                      className="flex-shrink-0 rounded-full"
                      style={{ width: '8px', height: '8px', backgroundColor: typeColor }}
                    />
                    <span className="rg-row-line--clip">
                      {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}, {memory.importance_score}/10, {relativeTime(memory.created_at)}
                    </span>
                  </span>
                </span>
                <span className="rg-row-action">
                  <ChevronDown
                    className="rg-chevron"
                    aria-hidden="true"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--rg-quick)' }}
                  />
                </span>
              </button>

              {/* Expanded: where it came from */}
              {isExpanded && (
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  style={{ padding: '0 12px 20px', marginTop: -8, borderBottom: '1px solid var(--rg-rule)', color: 'var(--rg-ink-2)', fontWeight: 350 }}
                >
                  {expertLabel && <span>{expertLabel}</span>}
                  {platformLabel && <span>From {platformLabel}</span>}
                  {memory.retrieval_count > 0 && (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      Used {memory.retrieval_count} time{memory.retrieval_count === 1 ? '' : 's'}
                    </span>
                  )}
                  {!expertLabel && !platformLabel && memory.retrieval_count === 0 && <span>No source recorded</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center" style={{ marginTop: 24 }}>
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="n-btn n-btn--ghost">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Loading
              </span>
            ) : (
              'Load more memories'
            )}
          </button>
        </div>
      )}
    </Section>
  );
};

export default MemoryFeed;
