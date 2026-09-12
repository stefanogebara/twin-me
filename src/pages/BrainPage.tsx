/**
 * Memory Explorer
 *
 * A filterable, paginated view of the user's memory stream.
 *
 * In the register (2026-09-12): an upright page title with the count as its
 * grey line, the composition as one bar of kind-coloured marks, a field for
 * search, 32px choices for filters (a pressed choice is the field with an ink
 * line), and the memories as sections of rows under an ink rule.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { ChevronDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import { SoulEvolutionTimeline } from '@/components/brain/SoulEvolutionTimeline';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import MemoryFilters from '@/components/brain/MemoryFilters';
import FeaturedMemory from '@/components/brain/FeaturedMemory';
import MemoryFeed from '@/components/brain/MemoryFeed';
import { Page, PageHead, Section, Empty } from '@/components/register';
import {
  Memory,
  Composition,
  BrainSnapshot,
  TYPE_COLORS,
  TYPE_LABELS,
  PAGE_SIZE,
} from '@/components/brain/brainConstants';

/** An inline text action: ink, underlined, no box. */
const textLink: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'var(--rg-ink)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};

const COMPOSITION_ORDER = ['reflection', 'platform_data', 'fact', 'conversation', 'observation'] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const BrainPage: React.FC = () => {
  useDocumentTitle('Your Memories');
  const { user, isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();

  // Filter / sort state
  const [searchQuery, setSearchQuery] = useState('');
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
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Collapsible "More" section
  const [showMore, setShowMore] = useState(false);
  const [snapshots, setSnapshots] = useState<BrainSnapshot[]>([]);
  const [snapshotsError, setSnapshotsError] = useState(false);

  // Fetch memories from API
  const fetchMemories = useCallback(async (opts: {
    expert: string | null;
    type: string | null;
    sort: string;
    offset: number;
    search?: string;
    append?: boolean;
  }) => {
    if (!isSignedIn || !user?.id) return;

    const isAppend = opts.append ?? false;
    if (isAppend) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLoadError(false);
    }

    // audit-2026-06-10: failures must be visible — never fall through to the
    // "No memories found / Connect platforms" empty state on a fetch error.
    const reportFailure = () => {
      if (isAppend) {
        toast.error('Could not load more memories. Please try again.');
      } else {
        setLoadError(true);
      }
    };

    try {
      const params = new URLSearchParams();
      if (opts.type) params.set('type', opts.type);
      if (opts.expert) params.set('expert', opts.expert);
      if (opts.search?.trim()) params.set('q', opts.search.trim());
      params.set('sort', opts.sort);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(opts.offset));

      const res = await authFetch(`/memories?${params.toString()}`);
      if (!res.ok) {
        reportFailure();
        return;
      }

      const json = await res.json();
      if (!json.success) {
        reportFailure();
        return;
      }

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
      reportFailure();
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isSignedIn, user?.id]);

  // Fetch when filters or search change (debounce search by 300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setExpandedId(null);
      fetchMemories({ expert: activeExpert, type: activeType, sort, offset: 0, search: searchQuery });
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [activeExpert, activeType, sort, searchQuery, fetchMemories]);

  // Fetch snapshots for timeline (lazy)
  const fetchSnapshots = useCallback(async () => {
    setSnapshotsError(false);
    try {
      const res = await authFetch('/twins-brain/snapshots?limit=30');
      const json = res.ok ? await res.json() : null;
      if (json?.success && Array.isArray(json.snapshots)) {
        setSnapshots(json.snapshots);
      } else {
        setSnapshotsError(true);
      }
    } catch {
      setSnapshotsError(true);
    }
  }, []);

  useEffect(() => {
    if (!showMore || !isSignedIn || !user?.id || snapshots.length > 0) return;
    fetchSnapshots();
  }, [showMore, isSignedIn, user?.id, snapshots.length, fetchSnapshots]);

  const handleLoadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    fetchMemories({ expert: activeExpert, type: activeType, sort, offset: newOffset, search: searchQuery, append: true });
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
      <Page>
        <div className="flex items-center justify-center h-64">
          <div
            aria-label="Loading"
            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: 'var(--rg-ink-3)' }}
          />
        </div>
      </Page>
    );
  }

  if (!isSignedIn) {
    return (
      <Page>
        <PageHead
          title="Your memories"
          line="Sign in to explore the memories shaping your twin."
          action={
            <button type="button" onClick={() => navigate('/auth')} className="n-btn n-btn--primary">
              Sign in
            </button>
          }
        />
      </Page>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  const presentTypes = composition ? COMPOSITION_ORDER.filter(type => (composition[type] || 0) > 0) : [];

  return (
    <Page>
      {/* ===== Page title: the count is its grey line ===== */}
      <header className="rg-apphead" style={{ marginBottom: 24 }}>
        <h1 className="rg-apphead-title">Your memories</h1>
        <p className="rg-apphead-line" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {compositionTotal > 0
            ? `${compositionTotal.toLocaleString('en-US')} memories, and what kind they are.`
            : ' '}
        </p>
      </header>

      {/* Composition: one bar of kind-coloured marks, and a legend in ink */}
      {composition && compositionTotal > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div className="flex w-full overflow-hidden" style={{ height: 8, gap: 2, borderRadius: 2 }} aria-hidden="true">
            {presentTypes.map(type => {
              const pct = ((composition[type] || 0) / compositionTotal) * 100;
              return (
                <div
                  key={type}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: TYPE_COLORS[type] || '#8c8889',
                    minWidth: pct > 0 ? '2px' : 0,
                  }}
                />
              );
            })}
          </div>
          <ul
            className="flex flex-wrap"
            style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', columnGap: 16, rowGap: 4, color: 'var(--rg-ink-2)', fontWeight: 350, fontVariantNumeric: 'tabular-nums' }}
          >
            {presentTypes.map(type => (
              <li key={type} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLORS[type] || '#8c8889' }} />
                {Math.round(((composition[type] || 0) / compositionTotal) * 100)}% {TYPE_LABELS[type]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== Search: the field, no border ===== */}
      <div className="relative" style={{ marginBottom: 16 }}>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--rg-ink-2)' }} aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search memories"
          aria-label="Search memories"
          className="n-input w-full focus-visible:outline-2 focus-visible:outline-[var(--rg-ink)]"
          style={{ paddingLeft: 38 }}
        />
      </div>

      {/* ===== Filters ===== */}
      <MemoryFilters
        activeExpert={activeExpert}
        activeType={activeType}
        sort={sort}
        onExpertChange={setActiveExpert}
        onTypeChange={setActiveType}
        onSortChange={setSort}
      />

      {/* ===== Loading / Error / Empty / Memories ===== */}
      {loading ? (
        <Section title="Memories">
          <ul className="rg-list" aria-busy="true">
            {[1, 2, 3, 4, 5].map(i => (
              <li key={i} className="rg-row rg-row--plain">
                <span className="rg-row-text" style={{ gap: 8 }}>
                  <span className="block rounded-[4px] animate-pulse" style={{ height: 12, width: `${60 + (i * 7) % 30}%`, background: 'var(--rg-field)' }} />
                  <span className="block rounded-[4px] animate-pulse" style={{ height: 12, width: '40%', background: 'var(--rg-field)' }} />
                </span>
                <span />
              </li>
            ))}
          </ul>
        </Section>
      ) : loadError ? (
        <Section title="Memories">
          <ul className="rg-list">
            <li>
              <Empty>
                Couldn't load your memories. They are safe; try again in a moment.{' '}
                <button
                  type="button"
                  style={textLink}
                  onClick={() => fetchMemories({ expert: activeExpert, type: activeType, sort, offset: 0, search: searchQuery })}
                >
                  Try again
                </button>
              </Empty>
            </li>
          </ul>
        </Section>
      ) : memories.length === 0 ? (
        <Section title="Memories">
          <ul className="rg-list">
            <li>
              <Empty>
                {activeExpert || activeType
                  ? 'No memories match these filters.'
                  : 'No memories yet. Connect platforms to start building them.'}
                {!activeExpert && !activeType && (
                  <>
                    {' '}
                    <button type="button" style={textLink} onClick={() => navigate('/get-started')}>
                      Connect platforms
                    </button>
                  </>
                )}
              </Empty>
            </li>
          </ul>
        </Section>
      ) : (
        <>
          {featuredMemory && <FeaturedMemory memory={featuredMemory} />}

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

      {/* ===== Data sources and timeline, behind one row ===== */}
      <ul className="rg-list" style={{ marginTop: 'var(--rg-section)' }}>
        <li>
          <button
            type="button"
            onClick={() => setShowMore(prev => !prev)}
            className="rg-row rg-row--link rg-row--plain"
            aria-expanded={showMore}
          >
            <span className="rg-row-text">
              <span className="rg-row-title">Data sources and timeline</span>
              <span className="rg-row-line">Upload your data, and see how your twin has grown.</span>
            </span>
            <span className="rg-row-action">
              <ChevronDown
                className="rg-chevron"
                aria-hidden="true"
                style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform var(--rg-quick)' }}
              />
            </span>
          </button>
        </li>
      </ul>

      {showMore && (
        <div style={{ marginTop: 'var(--rg-section)' }}>
          {user?.id && (
            <Section title="Upload your data">
              <DataUploadPanel userId={user.id} />
            </Section>
          )}

          {snapshotsError && snapshots.length === 0 && (
            <p className="rg-empty" style={{ padding: '24px 0 0' }}>
              Couldn't load your soul signature timeline.{' '}
              <button type="button" onClick={fetchSnapshots} style={textLink}>
                Retry
              </button>
            </p>
          )}

          {snapshots.length >= 2 && (
            <Section
              title="How your twin has grown"
              line={`How its understanding of you has changed, over ${snapshots.length} snapshots.`}
            >
              <SoulEvolutionTimeline snapshots={snapshots} />
            </Section>
          )}
        </div>
      )}
    </Page>
  );
};

export default BrainPage;
