/**
 * Memory Explorer
 *
 * A filterable, paginated view of the user's memory stream.
 * Smart filters by expert domain and memory type, rich glass cards,
 * composition bar, and collapsible data sources section.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { authFetch } from '@/services/api/apiBase';
import { ChevronDown } from 'lucide-react';
import { toSecondPerson } from '@/lib/utils';
import { SoulEvolutionTimeline } from '@/components/brain/SoulEvolutionTimeline';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import { DriftAlert } from '@/components/brain/DriftAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

interface Memory {
  id: string;
  content: string;
  memory_type: string;
  importance_score: number;
  retrieval_count: number;
  created_at: string;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface Composition {
  reflection: number;
  platform_data: number;
  fact: number;
  conversation: number;
  observation: number;
}

interface BrainSnapshot {
  id: string;
  snapshot_date: string;
  node_count: number;
  avg_confidence: number;
  snapshot_type: string;
}

const EXPERT_FILTERS = [
  { key: null, label: 'All' },
  { key: 'personality_psychologist', label: 'Personality' },
  { key: 'lifestyle_analyst', label: 'Lifestyle' },
  { key: 'cultural_identity', label: 'Cultural' },
  { key: 'social_dynamics', label: 'Social' },
  { key: 'motivation_analyst', label: 'Motivation' },
] as const;

const TYPE_FILTERS = [
  { key: null, label: 'All Types', color: 'rgba(255,255,255,0.5)' },
  { key: 'reflection', label: 'Reflections', color: '#F59E0B' },
  { key: 'platform_data', label: 'Platform Data', color: '#10B981' },
  { key: 'fact', label: 'Facts', color: '#8B5CF6' },
  { key: 'conversation', label: 'Conversations', color: '#3B82F6' },
] as const;

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'importance', label: 'Most Important' },
  { key: 'accessed', label: 'Most Accessed' },
] as const;

const EXPERT_COLORS: Record<string, string> = {
  personality_psychologist: '#a78bfa',
  lifestyle_analyst: '#34d399',
  cultural_identity: '#fbbf24',
  social_dynamics: '#60a5fa',
  motivation_analyst: '#fb923c',
};

const EXPERT_LABELS: Record<string, string> = {
  personality_psychologist: 'Personality',
  lifestyle_analyst: 'Lifestyle',
  cultural_identity: 'Cultural',
  social_dynamics: 'Social',
  motivation_analyst: 'Motivation',
};

const TYPE_COLORS: Record<string, string> = {
  reflection: '#F59E0B',
  platform_data: '#10B981',
  fact: '#8B5CF6',
  conversation: '#3B82F6',
  observation: '#6B7280',
};

const TYPE_LABELS: Record<string, string> = {
  reflection: 'reflections',
  platform_data: 'platform data',
  fact: 'facts',
  conversation: 'conversations',
  observation: 'observations',
};

const DEMO_MEMORIES: Memory[] = [
  {
    id: 'demo-1',
    content: 'Your music shifts dramatically between focused work hours and evenings — you seem to use sound as a deliberate tool for managing mental state. During deep work, you default to ambient or lo-fi instrumentals, while evenings shift toward emotionally rich vocal tracks.',
    memory_type: 'reflection',
    importance_score: 9,
    retrieval_count: 12,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 3600000).toISOString(),
    metadata: { expert: 'lifestyle_analyst' },
  },
  {
    id: 'demo-2',
    content: 'Listened to "Bohemian Rhapsody" by Queen, "Stairway to Heaven" by Led Zeppelin, and "Hotel California" by Eagles during evening session.',
    memory_type: 'platform_data',
    importance_score: 4,
    retrieval_count: 2,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    last_accessed_at: null,
    metadata: { source: 'spotify', platform: 'spotify' },
  },
  {
    id: 'demo-3',
    content: 'You gravitate toward the same 3-4 artists repeatedly during high-stress weeks, suggesting music is a comfort mechanism for you. This pattern is consistent across the last 3 months of listening data.',
    memory_type: 'reflection',
    importance_score: 8,
    retrieval_count: 7,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 86400000).toISOString(),
    metadata: { expert: 'personality_psychologist' },
  },
  {
    id: 'demo-4',
    content: 'Prefers working in the morning, typically starts deep work between 8-9 AM. Calendar blocks are consistently longer on Tuesdays and Thursdays.',
    memory_type: 'fact',
    importance_score: 6,
    retrieval_count: 15,
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    metadata: { expert: 'lifestyle_analyst' },
  },
  {
    id: 'demo-5',
    content: 'There\'s a recurring curiosity around creative and technical topics that suggests an unusual blend of left-brain and right-brain engagement. You switch between analytical deep-dives and creative exploration within the same day.',
    memory_type: 'reflection',
    importance_score: 9,
    retrieval_count: 4,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    metadata: { expert: 'motivation_analyst' },
  },
  {
    id: 'demo-6',
    content: 'Asked about favorite way to unwind after a long day. Mentioned cooking while listening to podcasts.',
    memory_type: 'conversation',
    importance_score: 5,
    retrieval_count: 1,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    last_accessed_at: null,
    metadata: {},
  },
];

const DEMO_COMPOSITION: Composition = {
  reflection: 52,
  platform_data: 40,
  fact: 4,
  conversation: 4,
  observation: 0,
};

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function truncateContent(text: string, maxLen = 180): { preview: string; hasMore: boolean } {
  if (text.length <= maxLen) return { preview: text, hasMore: false };
  // Try to break at a sentence boundary
  const dotIdx = text.indexOf('. ', 80);
  if (dotIdx !== -1 && dotIdx <= maxLen) {
    return { preview: text.slice(0, dotIdx + 1), hasMore: true };
  }
  // Break at word boundary
  const breakAt = text.lastIndexOf(' ', maxLen);
  return { preview: text.slice(0, breakAt > 80 ? breakAt : maxLen) + '...', hasMore: true };
}

function getPlatformLabel(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const source = (metadata.source || metadata.platform) as string | undefined;
  if (!source) return null;
  const labels: Record<string, string> = {
    spotify: 'Spotify',
    google_calendar: 'Google Calendar',
    youtube: 'YouTube',
    discord: 'Discord',
    linkedin: 'LinkedIn',
    whoop: 'Whoop',
    github: 'GitHub',
    reddit: 'Reddit',
    twitch: 'Twitch',
    gmail: 'Gmail',
    browser_extension: 'Browser',
  };
  return labels[source] || source;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const BrainPage: React.FC = () => {
  useDocumentTitle('Your Memories');
  const { user, isSignedIn, isLoaded } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  // Filter / sort state
  const [activeExpert, setActiveExpert] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [sort, setSort] = useState<'newest' | 'importance' | 'accessed'>('newest');

  // Data state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [composition, setComposition] = useState<Composition | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Collapsible "More" section
  const [showMore, setShowMore] = useState(false);
  const [snapshots, setSnapshots] = useState<BrainSnapshot[]>([]);

  // Fetch memories from API
  const fetchMemories = useCallback(async (opts: {
    expert: string | null;
    type: string | null;
    sort: string;
    offset: number;
    append?: boolean;
  }) => {
    if (isDemoMode) {
      setMemories(DEMO_MEMORIES);
      setComposition(DEMO_COMPOSITION);
      setTotal(DEMO_MEMORIES.length);
      return;
    }

    if (!isSignedIn || !user?.id) return;

    const isAppend = opts.append ?? false;
    if (isAppend) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (opts.type) params.set('type', opts.type);
      if (opts.expert) params.set('expert', opts.expert);
      params.set('sort', opts.sort);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(opts.offset));

      const res = await authFetch(`/memories?${params.toString()}`);
      if (!res.ok) return;

      const json = await res.json();
      if (!json.success) return;

      if (isAppend) {
        setMemories(prev => [...prev, ...(json.memories || [])]);
      } else {
        setMemories(json.memories || []);
      }
      setTotal(json.total || 0);
      setOffset(opts.offset);
      if (json.composition) {
        setComposition(json.composition);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isSignedIn, isDemoMode, user?.id]);

  // Fetch when filters change
  useEffect(() => {
    setOffset(0);
    setExpandedId(null);
    fetchMemories({ expert: activeExpert, type: activeType, sort, offset: 0 });
  }, [activeExpert, activeType, sort, fetchMemories]);

  // Fetch snapshots for timeline (lazy, only when "More" section opened)
  useEffect(() => {
    if (!showMore || !isSignedIn || isDemoMode || !user?.id || snapshots.length > 0) return;

    authFetch('/twins-brain/snapshots?limit=30')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success && Array.isArray(json.snapshots)) {
          setSnapshots(json.snapshots);
        }
      })
      .catch(() => {});
  }, [showMore, isSignedIn, isDemoMode, user?.id, snapshots.length]);

  const handleLoadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    fetchMemories({ expert: activeExpert, type: activeType, sort, offset: newOffset, append: true });
  };

  const hasMore = memories.length < total;

  // Composition bar data
  const compositionTotal = composition
    ? Object.values(composition).reduce((a, b) => a + b, 0)
    : 0;

  /* ---------------------------------------------------------------- */
  /*  Render guards                                                    */
  /* ---------------------------------------------------------------- */

  if (!isLoaded) {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-16">
        <div className="flex items-center justify-center h-64">
          <div
            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-16">
        <h1
          className="mb-2"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Your Memories
        </h1>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
          Sign in to explore the memories shaping your twin.
        </p>
        <button
          onClick={() => navigate('/auth')}
          className="px-5 py-2.5 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#252222', color: '#fdfcfb', fontFamily: "'Inter', sans-serif" }}
        >
          Sign In to Explore
        </button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div className="max-w-[720px] mx-auto px-6 py-16" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <h1
        className="mb-1"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Your Memories
      </h1>
      <p className="text-[13px] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {compositionTotal > 0
          ? `${compositionTotal.toLocaleString()} memories shaping your twin`
          : 'Memories shaping your twin'}
      </p>

      {/* Composition Bar */}
      {composition && compositionTotal > 0 && (
        <div className="mb-8">
          {/* Bar */}
          <div className="flex w-full h-1 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {(['reflection', 'platform_data', 'fact', 'conversation', 'observation'] as const).map(type => {
              const count = composition[type] || 0;
              if (count === 0) return null;
              const pct = (count / compositionTotal) * 100;
              return (
                <div
                  key={type}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: TYPE_COLORS[type] || '#6B7280',
                    minWidth: pct > 0 ? '2px' : 0,
                  }}
                />
              );
            })}
          </div>
          {/* Labels */}
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {(['reflection', 'platform_data', 'fact', 'conversation'] as const)
              .filter(type => (composition[type] || 0) > 0)
              .map(type => {
                const count = composition[type] || 0;
                const pct = Math.round((count / compositionTotal) * 100);
                return `${pct}% ${TYPE_LABELS[type]}`;
              })
              .join(' \u00B7 ')}
          </p>
        </div>
      )}

      {/* Drift Alert */}
      <DriftAlert />

      {/* ===== Filter Chips ===== */}
      <div className="mb-6 space-y-3">
        {/* Row 1: Expert domains */}
        <div className="flex flex-wrap gap-2">
          {EXPERT_FILTERS.map(({ key, label }) => {
            const isActive = activeExpert === key;
            return (
              <button
                key={label}
                onClick={() => setActiveExpert(key)}
                className="rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer transition-all"
                style={{
                  background: isActive ? 'rgba(255,132,0,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isActive ? '1px solid rgba(255,132,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: isActive ? '#ff8400' : 'rgba(255,255,255,0.5)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Row 2: Memory types */}
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map(({ key, label, color }) => {
            const isActive = activeType === key;
            return (
              <button
                key={label}
                onClick={() => setActiveType(key)}
                className="rounded-full px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all inline-flex items-center gap-1.5"
                style={{
                  background: isActive ? 'rgba(255,132,0,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isActive ? '1px solid rgba(255,132,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: isActive ? '#ff8400' : 'rgba(255,255,255,0.5)',
                }}
              >
                {key && (
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                {label}
              </button>
            );
          })}
        </div>

        {/* Row 3: Sort */}
        <div className="flex justify-end gap-1">
          {SORT_OPTIONS.map(({ key, label }) => {
            const isActive = sort === key;
            return (
              <button
                key={key}
                onClick={() => setSort(key as typeof sort)}
                className="px-2.5 py-1 text-[11px] font-medium transition-colors rounded"
                style={{
                  color: isActive ? 'var(--foreground)' : 'rgba(255,255,255,0.3)',
                  background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Memory Feed ===== */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          />
        </div>
      ) : memories.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            No memories found
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {activeExpert || activeType
              ? 'Try adjusting your filters.'
              : 'Connect platforms to start building memories.'}
          </p>
          {!activeExpert && !activeType && (
            <button
              onClick={() => navigate('/get-started')}
              className="mt-4 px-5 py-2 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#252222', color: '#fdfcfb' }}
            >
              Connect Platforms
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {memories.map(memory => {
            const expert = (memory.metadata?.expert as string) || null;
            const expertColor = expert ? (EXPERT_COLORS[expert] || 'rgba(255,255,255,0.4)') : null;
            const expertLabel = expert ? (EXPERT_LABELS[expert] || expert) : null;
            const typeColor = TYPE_COLORS[memory.memory_type] || '#6B7280';
            const platformLabel = getPlatformLabel(memory.metadata);
            const displayContent = toSecondPerson(memory.content);
            const isExpanded = expandedId === memory.id;
            const { preview, hasMore: canExpand } = truncateContent(displayContent);

            return (
              <div
                key={memory.id}
                className="cursor-pointer transition-all"
                style={{
                  background: 'var(--glass-surface-bg)',
                  backdropFilter: 'blur(42px)',
                  WebkitBackdropFilter: 'blur(42px)',
                  border: '1px solid var(--glass-surface-border)',
                  borderRadius: '20px',
                  padding: '16px 20px',
                }}
                onClick={() => setExpandedId(prev => prev === memory.id ? null : memory.id)}
              >
                {/* Top row: expert badge + type dot + importance */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {expertLabel && (
                      <span
                        className="text-[11px] font-medium uppercase tracking-widest"
                        style={{ color: expertColor || 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
                      >
                        {expertLabel}
                      </span>
                    )}
                    {!expertLabel && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ backgroundColor: typeColor }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-widest"
                          style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
                        >
                          {TYPE_LABELS[memory.memory_type] || memory.memory_type}
                        </span>
                      </span>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {memory.importance_score}/10
                  </span>
                </div>

                {/* Content */}
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--foreground)' }}
                >
                  {isExpanded ? displayContent : preview}
                </p>
                {canExpand && (
                  <ChevronDown
                    className="w-3.5 h-3.5 mt-1 transition-transform duration-200"
                    style={{
                      color: 'rgba(255,255,255,0.2)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                )}

                {/* Bottom row: platform + time + retrieval count */}
                <div className="flex items-center gap-3 mt-3">
                  {platformLabel && (
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      from {platformLabel}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {relativeTime(memory.created_at)}
                  </span>
                  {memory.retrieval_count > 0 && (
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      accessed {memory.retrieval_count}x
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-full text-sm mt-4 transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)',
            background: 'transparent',
          }}
        >
          {loadingMore ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
              />
              Loading...
            </span>
          ) : (
            'Load more memories'
          )}
        </button>
      )}

      {/* ===== Collapsible "More" section ===== */}
      <div className="mt-12" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setShowMore(prev => !prev)}
          className="w-full flex items-center justify-between py-4 transition-opacity hover:opacity-70"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <span className="text-xs font-medium">Show data sources & timeline</span>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200"
            style={{ transform: showMore ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>

        {showMore && (
          <div className="pb-8 space-y-10">
            {/* Data Upload */}
            {user?.id && (
              <section>
                <span
                  className="text-[11px] font-medium tracking-widest uppercase block mb-4"
                  style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
                >
                  Upload Your Data
                </span>
                <DataUploadPanel userId={user.id} />
              </section>
            )}

            {/* Soul Evolution Timeline */}
            {snapshots.length >= 2 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[11px] font-medium tracking-widest uppercase"
                    style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
                  >
                    Soul Signature Evolution
                  </span>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {snapshots.length} snapshots
                  </span>
                </div>
                <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  How your twin's understanding of you has grown over time.
                </p>
                <SoulEvolutionTimeline snapshots={snapshots} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrainPage;
