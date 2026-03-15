/**
 * Twin's Brain Page
 *
 * Two sections:
 * 1. Discoveries - Patterns the twin has noticed about you
 * 2. Your Data   - What platforms shape your twin + connection status
 *
 * Typography-driven dark design — no glass cards, no motion.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { authFetch } from '@/services/api/apiBase';
import {
  Link2,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { toSecondPerson } from '@/lib/utils';
import { SoulEvolutionTimeline } from '@/components/brain/SoulEvolutionTimeline';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import { DriftAlert } from '@/components/brain/DriftAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface Insight {
  id?: string;
  content: string;
  category?: string;
  createdAt?: string;
}

interface MemoryStats {
  totalMemories: number;
  byPlatform: Record<string, number>;
}

const EXPERT_META: Record<string, { label: string; color: string }> = {
  personality_psychologist: { label: 'Personality', color: '#a78bfa' },
  lifestyle_analyst: { label: 'Lifestyle', color: '#34d399' },
  cultural_identity: { label: 'Cultural Identity', color: '#fbbf24' },
  social_dynamics: { label: 'Social', color: '#60a5fa' },
  motivation_analyst: { label: 'Motivation', color: '#fb923c' },
  social_analyst: { label: 'Social', color: '#60a5fa' },
  productivity_analyst: { label: 'Productivity', color: '#2dd4bf' },
  music_psychologist: { label: 'Music', color: '#f472b6' },
  health_behaviorist: { label: 'Health', color: '#f87171' },
  media_sociologist: { label: 'Media', color: '#818cf8' },
  digital_behaviorist: { label: 'Digital', color: '#a78bfa' },
  code_architect: { label: 'Code', color: '#38bdf8' },
};

interface Reflection {
  id: string;
  content: string;
  importance: number;
  expert: string | null;
  category: string | null;
  createdAt: string;
}

interface BrainSnapshot {
  id: string;
  snapshot_date: string;
  node_count: number;
  avg_confidence: number;
  snapshot_type: string;
}

const PLATFORM_META: Record<string, { label: string; icon: string; description: string }> = {
  spotify: { label: 'Spotify', icon: '🎵', description: 'Music taste, listening patterns, mood' },
  google_calendar: { label: 'Google Calendar', icon: '📅', description: 'Schedule, events, time patterns' },
  youtube: { label: 'YouTube', icon: '▶️', description: 'Content preferences, interests' },
  discord: { label: 'Discord', icon: '💬', description: 'Community activity, communication style' },
  linkedin: { label: 'LinkedIn', icon: '💼', description: 'Career trajectory, professional skills' },
  whoop: { label: 'Whoop', icon: '❤️', description: 'Recovery, sleep, HRV, strain' },
};

const ORDERED_PLATFORMS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'whoop'];

const DEMO_INSIGHTS: Insight[] = [
  { content: "Your music shifts dramatically between focused work hours and evenings — you seem to use sound as a deliberate tool for managing mental state.", category: "lifestyle" },
  { content: "You gravitate toward the same 3-4 artists repeatedly during high-stress weeks, suggesting music is a comfort mechanism for you.", category: "personality" },
  { content: "Your calendar shows a strong preference for morning work blocks — you protect these fiercely and rarely schedule calls before noon.", category: "behavior" },
  { content: "There's a recurring curiosity around creative and technical topics that suggests an unusual blend of left-brain and right-brain engagement.", category: "personality" },
];

const BrainPage: React.FC = () => {
  useDocumentTitle("Twin's Brain");
  const { user, isSignedIn, isLoaded } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [reflectionsLoading, setReflectionsLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<BrainSnapshot[]>([]);
  const [expandedDiscovery, setExpandedDiscovery] = useState<string | null>(null);
  const [expandedReflection, setExpandedReflection] = useState<string | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);

  const { data: platformStatus, isLoading: platformLoading } = usePlatformStatus(
    isSignedIn ? user?.id : undefined
  );

  useEffect(() => {
    if (!isSignedIn || isDemoMode || !user?.id) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setReflectionsLoading(false);
    }, 5000);

    const fetchReflections = async () => {
      setReflectionsLoading(true);
      try {
        const res = await authFetch('/twin/reflections?limit=20');
        if (cancelled) return;
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.reflections)) {
          setReflections(json.reflections);
        }
      } catch {
        // silently fail
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setReflectionsLoading(false);
      }
    };

    fetchReflections();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [isSignedIn, isDemoMode, user?.id]);

  useEffect(() => {
    if (!isSignedIn || isDemoMode || !user?.id) return;

    authFetch('/twins-brain/snapshots?limit=30')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success && Array.isArray(json.snapshots)) {
          setSnapshots(json.snapshots);
        }
      })
      .catch(() => {});
  }, [isSignedIn, isDemoMode, user?.id]);

  useEffect(() => {
    if (!isSignedIn || isDemoMode || !user?.id) return;

    authFetch('/twin/memory-stats')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success) setMemoryStats({ totalMemories: json.totalMemories, byPlatform: json.byPlatform });
      })
      .catch(() => {});
  }, [isSignedIn, isDemoMode, user?.id]);

  if (!isLoaded) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
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
          Twin's Brain
        </h1>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
          Sign in and I'll show you what I've been noticing about you.
        </p>
        <button
          onClick={() => navigate('/auth')}
          className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: '#10b77f',
            color: '#0a0f0a',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Sign In to Explore
        </button>
      </div>
    );
  }

  // Derive top discoveries from reflections
  const topDiscoveries: Insight[] = isDemoMode
    ? DEMO_INSIGHTS
    : (() => {
        const seen = new Set<string>();
        const picks: Insight[] = [];
        for (const r of reflections) {
          const key = r.expert || 'unknown';
          if (!seen.has(key)) {
            seen.add(key);
            picks.push({ id: r.id, content: r.content, category: r.expert || undefined, createdAt: r.createdAt });
          }
          if (picks.length >= 5) break;
        }
        return picks;
      })();

  const totalMemories = memoryStats?.totalMemories ?? 0;

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Twin's Brain
        </h1>
        {totalMemories > 0 && (
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {totalMemories.toLocaleString('en-US')} memories
          </span>
        )}
      </div>
      <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        Patterns your twin has noticed, and the data that shapes it.
      </p>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-10" />

      {/* Personality drift alert */}
      <DriftAlert />

      {/* ===== Discoveries ===== */}
      <section className="mb-10">
        <span
          className="text-[11px] font-medium tracking-widest uppercase block mb-5"
          style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
        >
          Discoveries
        </span>

        {reflectionsLoading && (
          <div className="flex items-center gap-3 py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>Twin is thinking…</span>
          </div>
        )}

        {!reflectionsLoading && topDiscoveries.length === 0 && (
          <div className="py-8">
            <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
              I haven't noticed anything yet
            </p>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Discoveries show up after a couple of days of platform data — connect one to get me thinking.
            </p>
            <button
              onClick={() => navigate('/get-started')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                backgroundColor: '#10b77f',
                color: '#0a0f0a',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <Link2 className="w-4 h-4" />
              Connect platforms
            </button>
          </div>
        )}

        {!reflectionsLoading && topDiscoveries.length > 0 && (
          <div className="space-y-0">
            {topDiscoveries.map((insight, i) => {
              const expertKey = insight.category || '';
              const em = EXPERT_META[expertKey];
              const cardKey = insight.id || String(i);
              const isExpanded = expandedDiscovery === cardKey;
              const displayContent = toSecondPerson(insight.content);
              const dotIdx = displayContent.indexOf('. ');
              const preview = dotIdx !== -1 && dotIdx < 130
                ? displayContent.slice(0, dotIdx + 1)
                : displayContent.slice(0, 130) + (displayContent.length > 130 ? '…' : '');
              const hasMore = preview !== displayContent;
              return (
                <div
                  key={cardKey}
                  className="py-4 cursor-pointer transition-opacity hover:opacity-80"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                  onClick={() => setExpandedDiscovery(prev => prev === cardKey ? null : cardKey)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {em && (
                        <p
                          className="text-[11px] font-medium uppercase tracking-widest mb-1.5"
                          style={{ color: em.color, letterSpacing: '0.1em' }}
                        >
                          {em.label}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
                        {isExpanded ? displayContent : preview}
                      </p>
                    </div>
                    {hasMore && (
                      <ChevronDown
                        className="flex-shrink-0 w-4 h-4 mt-0.5 transition-transform duration-200"
                        style={{ color: 'rgba(255,255,255,0.2)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-10" />

      {/* ===== Your Data ===== */}
      <section className="mb-10">
        <span
          className="text-[11px] font-medium tracking-widest uppercase block mb-2"
          style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
        >
          Your Data
        </span>
        <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
          These platforms shape how your twin understands you.
        </p>

        {platformLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
        ) : (
          <div className="space-y-0">
            {ORDERED_PLATFORMS.map((provider) => {
              const meta = PLATFORM_META[provider];
              const status = platformStatus?.[provider];
              const isConnected = status?.connected && status?.isActive;
              const isExpired = status?.tokenExpired;

              return (
                <div
                  key={provider}
                  className="flex items-center justify-between py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{meta.icon}</span>
                    <div>
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                        {meta.label}
                      </span>
                      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {meta.description}
                      </p>
                      {isConnected && status?.lastSync && (
                        <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          <Clock className="w-3 h-3" />
                          {formatLastSync(status.lastSync)}
                        </p>
                      )}
                      {memoryStats?.byPlatform[provider] != null && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          {memoryStats.byPlatform[provider]} {memoryStats.byPlatform[provider] === 1 ? 'memory' : 'memories'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isConnected && !isExpired ? (
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10b77f' }} />
                    ) : isExpired ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                        <button
                          onClick={() => navigate('/get-started')}
                          className="text-[11px]"
                          style={{ color: '#f59e0b' }}
                        >
                          Reconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => navigate('/get-started')}
                        className="text-[11px]"
                        style={{ color: '#10b77f' }}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => navigate('/get-started')}
          className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm transition-opacity hover:opacity-70"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Manage Connections
        </button>
      </section>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-10" />

      {/* ===== Upload Your Data ===== */}
      <section className="mb-10">
        <span
          className="text-[11px] font-medium tracking-widest uppercase block mb-5"
          style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
        >
          Upload Your Data
        </span>
        {user?.id && <DataUploadPanel userId={user.id} />}
      </section>

      {/* ===== Reflections ===== */}
      {(reflections.length > 0 || reflectionsLoading) && (
        <section className="mb-10">
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-10" />
          <div className="flex items-center gap-2 mb-5">
            <span
              className="text-[11px] font-medium tracking-widest uppercase"
              style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
            >
              What Your Twin Has Learned
            </span>
            {reflections.length > 0 && (
              <span className="text-[11px] ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {reflections.length} reflections
              </span>
            )}
          </div>

          {reflectionsLoading && (
            <div className="flex items-center gap-2 py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading reflections…</span>
            </div>
          )}

          <div className="space-y-0">
            {reflections.map((r) => {
              const isExpanded = expandedReflection === r.id;
              const displayContent2 = toSecondPerson(r.content);
              const dotIdx = displayContent2.indexOf('. ');
              const preview = dotIdx !== -1 && dotIdx < 120
                ? displayContent2.slice(0, dotIdx + 1)
                : displayContent2.slice(0, 120) + (displayContent2.length > 120 ? '…' : '');
              const hasMore = preview !== displayContent2;
              return (
                <div
                  key={r.id}
                  className="py-4 cursor-pointer transition-opacity hover:opacity-80"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                  onClick={() => setExpandedReflection(prev => prev === r.id ? null : r.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {r.expert && (
                        <p
                          className="text-[11px] font-medium uppercase tracking-widest mb-1.5"
                          style={{ color: EXPERT_META[r.expert]?.color ?? 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
                        >
                          {EXPERT_META[r.expert]?.label ?? r.expert}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
                        {isExpanded ? displayContent2 : preview}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {r.category && r.category !== r.expert && (
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            {EXPERT_META[r.category]?.label ?? r.category}
                          </span>
                        )}
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          importance {r.importance}/10
                        </span>
                      </div>
                    </div>
                    {hasMore && (
                      <ChevronDown
                        className="flex-shrink-0 w-4 h-4 mt-0.5 transition-transform duration-200"
                        style={{ color: 'rgba(255,255,255,0.2)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Soul Evolution Timeline ===== */}
      {snapshots.length >= 2 && (
        <section className="mb-10">
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mb-10" />
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[11px] font-medium tracking-widest uppercase"
              style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
            >
              Soul Signature Evolution
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {snapshots.length} snapshots
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
            How your twin's understanding of you has grown over time.
          </p>
          <SoulEvolutionTimeline snapshots={snapshots} />
        </section>
      )}
    </div>
  );
};

function formatLastSync(lastSync: string): string {
  try {
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Synced recently';
    if (diffHours < 24) return `Synced ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Synced ${diffDays}d ago`;
  } catch {
    return 'Synced';
  }
}

export default BrainPage;
