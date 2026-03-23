/**
 * Memory Explorer
 *
 * A filterable, paginated view of the user's memory stream.
 * Dashboard-style layout: featured memory card, compact feed rows,
 * smart filters, composition bar, and collapsible data sources section.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { authFetch } from '@/services/api/apiBase';
import { ChevronDown } from 'lucide-react';
import { SoulEvolutionTimeline } from '@/components/brain/SoulEvolutionTimeline';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import { DriftAlert } from '@/components/brain/DriftAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import MemoryFilters from '@/components/brain/MemoryFilters';
import FeaturedMemory from '@/components/brain/FeaturedMemory';
import MemoryFeed from '@/components/brain/MemoryFeed';
import {
  Memory,
  Composition,
  BrainSnapshot,
  TYPE_COLORS,
  TYPE_LABELS,
  DEMO_MEMORIES,
  DEMO_COMPOSITION,
  PAGE_SIZE,
} from '@/components/brain/brainConstants';

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

  // Fetch snapshots for timeline (lazy)
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

  // Find the featured memory (highest importance >= 8)
  const featuredMemory = useMemo(() => {
    if (memories.length === 0) return null;
    const candidates = memories.filter(m => m.importance_score >= 8);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, m) =>
      m.importance_score > best.importance_score ? m : best
    , candidates[0]);
  }, [memories]);

  // Feed memories = all except the featured one
  const feedMemories = useMemo(() => {
    if (!featuredMemory) return memories;
    return memories.filter(m => m.id !== featuredMemory.id);
  }, [memories, featuredMemory]);

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
            fontSize: '32px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Your Memories
        </h1>
        <p className="text-sm mb-8" style={{ color: '#86807b', fontFamily: "'Inter', sans-serif" }}>
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

      {/* Drift Alert — always at top */}
      <DriftAlert />

      {/* ===== Section 1: Page Header ===== */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '32px',
              fontWeight: 400,
              color: '#fdfcfb',
              letterSpacing: '-0.02em',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Your Memories
          </h1>
          <span className="text-xs" style={{ color: '#86807b' }}>
            {compositionTotal > 0
              ? `${compositionTotal.toLocaleString()} memories`
              : '\u00A0'}
          </span>
        </div>

        {/* Composition bar */}
        {composition && compositionTotal > 0 && (
          <>
            <div
              className="flex w-full overflow-hidden mb-2"
              style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.04)' }}
            >
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
          </>
        )}
      </div>

      {/* ===== Section 2: Filter Chips ===== */}
      <MemoryFilters
        activeExpert={activeExpert}
        activeType={activeType}
        sort={sort}
        onExpertChange={setActiveExpert}
        onTypeChange={setActiveType}
        onSortChange={setSort}
      />

      {/* ===== Loading / Empty ===== */}
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
        <>
          {/* ===== Section 3: Featured Memory ===== */}
          {featuredMemory && <FeaturedMemory memory={featuredMemory} />}

          {/* ===== Section 4: Memory Feed ===== */}
          <MemoryFeed
            memories={feedMemories}
            hasFeatured={!!featuredMemory}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        </>
      )}

      {/* ===== Collapsible "More" section ===== */}
      <div className="mt-12" style={{ borderTop: '1px solid var(--border-glass)' }}>
        <button
          onClick={() => setShowMore(prev => !prev)}
          className="w-full flex items-center justify-between py-4 transition-opacity hover:opacity-70"
          style={{ color: '#86807b', background: 'transparent', border: 'none' }}
        >
          <span className="text-xs font-medium">Show data sources & timeline</span>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200"
            style={{ transform: showMore ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>

        {showMore && (
          <div className="pb-8 space-y-10">
            {user?.id && (
              <section>
                <span
                  className="block mb-4"
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    color: '#86807b',
                  }}
                >
                  Upload Your Data
                </span>
                <DataUploadPanel userId={user.id} />
              </section>
            )}

            {snapshots.length >= 2 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.15em',
                      color: '#86807b',
                    }}
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
