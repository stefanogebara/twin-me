/**
 * WikiNodeDetailPanel -- Interactive detail panel shown when a graph node is clicked.
 *
 * Fetches the 5 most relevant memories for the clicked entity/domain/platform via
 * /api/mem0/search, and offers a CTA to continue the conversation with the twin.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { DOMAIN_CONFIG, PLATFORM_CONFIG, ENTITY_CATEGORY_CONFIG } from './graphConstants';
import type { SelectedNode, DomainNode, EntityNode, PlatformNode } from './graphTypes';

interface MemoryHit {
  memory: string;
  type?: string;
  timestamp?: string;
  metadata?: Record<string, unknown> | null;
}

interface SearchResponse {
  success: boolean;
  memories?: MemoryHit[];
  count?: number;
  query?: string;
}

interface Props {
  selectedNode: NonNullable<SelectedNode>;
  onClose: () => void;
}

function getTimeAgo(ts?: string): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getAccent(node: NonNullable<SelectedNode>): string {
  if (node.type === 'domain') {
    return DOMAIN_CONFIG[(node as DomainNode).domain]?.color ?? '#c9b99a';
  }
  if (node.type === 'platform') {
    return PLATFORM_CONFIG[(node as PlatformNode).platformId]?.color ?? '#888';
  }
  return ENTITY_CATEGORY_CONFIG[(node as EntityNode).category]?.color ?? '#888';
}

function getTagline(node: NonNullable<SelectedNode>): string | null {
  if (node.type === 'entity') {
    const e = node as EntityNode;
    const count = e.domains?.length ?? 0;
    if (count === 0) return null;
    return `Surfaces across ${count} domain${count === 1 ? '' : 's'} in your knowledge graph, linking patterns from different areas of your life.`;
  }
  if (node.type === 'domain') {
    const d = node as DomainNode;
    return d.crossrefCount > 0
      ? `${d.crossrefCount} cross-reference${d.crossrefCount === 1 ? '' : 's'} connect this domain to the rest of your identity.`
      : null;
  }
  if (node.type === 'platform') {
    const p = node as PlatformNode;
    const label = PLATFORM_CONFIG[p.platformId]?.label ?? p.platformId;
    return `Signals from ${label} feed into the reflection engine and shape how your twin understands you.`;
  }
  return null;
}

function getSourceChip(mem: MemoryHit): string | null {
  const platform = (mem.metadata && typeof mem.metadata === 'object' && 'platform' in mem.metadata)
    ? String((mem.metadata as Record<string, unknown>).platform)
    : null;
  if (platform) {
    return PLATFORM_CONFIG[platform]?.label ?? platform;
  }
  if (mem.type && mem.type !== 'fact') {
    return mem.type.replace(/_/g, ' ');
  }
  return null;
}

const WikiNodeDetailPanel: React.FC<Props> = ({ selectedNode, onClose }) => {
  const navigate = useNavigate();
  const [memories, setMemories] = useState<MemoryHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = getAccent(selectedNode);
  const tagline = getTagline(selectedNode);
  const title = selectedNode.label;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      setMemories([]);
      try {
        const q = encodeURIComponent(title);
        const res = await authFetch(`/api/mem0/search?query=${q}&limit=5`);
        if (!res.ok) {
          throw new Error(`Search failed (${res.status})`);
        }
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) {
          setMemories(Array.isArray(data.memories) ? data.memories : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load memories');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [title]);

  const handleAskTwin = () => {
    const prompt = encodeURIComponent(`Tell me about ${title} -- what does it say about me?`);
    navigate(`/talk-to-twin?prompt=${prompt}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="h-full overflow-y-auto relative"
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        borderLeft: '1px solid var(--glass-surface-border)',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close detail panel"
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'var(--text-secondary)',
        }}
      >
        <X size={14} />
      </button>

      <div className="p-6 pt-8">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: accent }} />
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {selectedNode.type}
          </span>
        </div>

        <h2
          className="font-normal italic tracking-tight mb-3"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: '26px',
            lineHeight: '1.15',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>

        {tagline && (
          <p
            className="text-[13px] leading-relaxed mb-6"
            style={{ color: 'var(--text-narrative-secondary)' }}
          >
            {tagline}
          </p>
        )}

        {/* Ask-twin CTA */}
        <button
          onClick={handleAskTwin}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-[100px] mb-6 transition-opacity hover:opacity-90"
          style={{ background: '#F5F5F4', color: '#110f0f' }}
        >
          <span className="text-[13px] font-medium">Ask your twin about this</span>
          <ArrowRight size={14} />
        </button>

        {/* Related memories */}
        <h3
          className="text-[11px] font-medium mb-3 uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Related memories
        </h3>

        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-14 rounded-[12px] animate-pulse"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Couldn't load memories: {error}
          </p>
        )}

        {!isLoading && !error && memories.length === 0 && (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            No related memories yet. Your twin will keep noticing.
          </p>
        )}

        {!isLoading && !error && memories.length > 0 && (
          <div className="space-y-2">
            {memories.map((mem, idx) => {
              const source = getSourceChip(mem);
              const when = getTimeAgo(mem.timestamp);
              return (
                <motion.div
                  key={`${idx}-${mem.timestamp ?? ''}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                  className="rounded-[12px] px-3 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <p
                    className="text-[12.5px] leading-snug"
                    style={{
                      color: 'var(--text-narrative)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {mem.memory}
                  </p>
                  {(source || when) && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {source && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {source}
                        </span>
                      )}
                      {when && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {when}
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default WikiNodeDetailPanel;
