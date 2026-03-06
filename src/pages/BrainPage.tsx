/**
 * Twin's Brain Page
 *
 * Two sections:
 * 1. Discoveries - Patterns the twin has noticed about you
 * 2. Your Data   - What platforms shape your twin + connection status
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { authFetch } from '@/services/api/apiBase';
import {
  Sparkles,
  Link2,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Brain,
} from 'lucide-react';
import { cn, toSecondPerson } from '@/lib/utils';
import { SoulEvolutionTimeline } from '@/components/brain/SoulEvolutionTimeline';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';

interface Insight {
  id?: string;
  title?: string;
  content: string;
  category?: string;
  confidence?: string;
  createdAt?: string;
}

interface MemoryStats {
  totalMemories: number;
  byPlatform: Record<string, number>;
}

const EXPERT_META: Record<string, { label: string; color: string; bg: string }> = {
  personality_psychologist: { label: 'Personality', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  lifestyle_analyst: { label: 'Lifestyle', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  cultural_identity: { label: 'Cultural Identity', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  social_dynamics: { label: 'Social', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  motivation_analyst: { label: 'Motivation', color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  social_analyst: { label: 'Social', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  productivity_analyst: { label: 'Productivity', color: '#14b8a6', bg: 'rgba(20,184,166,0.08)' },
  music_psychologist: { label: 'Music', color: '#ec4899', bg: 'rgba(236,72,153,0.08)' },
  health_behaviorist: { label: 'Health', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  media_sociologist: { label: 'Media', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  digital_behaviorist: { label: 'Digital', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
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
  spotify: {
    label: 'Spotify',
    icon: '🎵',
    description: 'Music taste, listening patterns, mood'
  },
  google_calendar: {
    label: 'Google Calendar',
    icon: '📅',
    description: 'Schedule, events, time patterns'
  },
  youtube: {
    label: 'YouTube',
    icon: '▶️',
    description: 'Content preferences, interests'
  },
  discord: {
    label: 'Discord',
    icon: '💬',
    description: 'Community activity, communication style'
  },
  linkedin: {
    label: 'LinkedIn',
    icon: '💼',
    description: 'Career trajectory, professional skills'
  },
  whoop: {
    label: 'Whoop',
    icon: '❤️',
    description: 'Recovery, sleep, HRV, strain'
  },
};

const ORDERED_PLATFORMS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'whoop'];

// Demo insights shown when in demo mode
const DEMO_INSIGHTS: Insight[] = [
  {
    content: "Your music shifts dramatically between focused work hours and evenings — you seem to use sound as a deliberate tool for managing mental state.",
    category: "lifestyle"
  },
  {
    content: "You gravitate toward the same 3-4 artists repeatedly during high-stress weeks, suggesting music is a comfort mechanism for you.",
    category: "personality"
  },
  {
    content: "Your calendar shows a strong preference for morning work blocks — you protect these fiercely and rarely schedule calls before noon.",
    category: "behavior"
  },
  {
    content: "There's a recurring curiosity around creative and technical topics that suggests an unusual blend of left-brain and right-brain engagement.",
    category: "personality"
  },
];

const BrainPage: React.FC = () => {
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

    const fetchReflections = async () => {
      setReflectionsLoading(true);
      try {
        const res = await authFetch('/twin/reflections?limit=20');
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.reflections)) {
          setReflections(json.reflections);
        }
      } catch {
        // silently fail — reflections are additive, not critical
      } finally {
        setReflectionsLoading(false);
      }
    };

    fetchReflections();
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

  const textColor = 'var(--foreground)';
  const textSecondary = 'var(--text-secondary)';

  if (!isLoaded) {
    return (
      <PageLayout maxWidth="xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
        </div>
      </PageLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <PageLayout maxWidth="md">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <GlassPanel className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.2) 0%, rgba(69, 183, 209, 0.2) 100%)' }}
            >
              <Brain className="w-10 h-10" style={{ color: 'var(--foreground)' }} />
            </div>
            <h1 className="heading-serif mb-3" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', letterSpacing: '-0.05em', lineHeight: 1.1 }}>Your Twin's Brain</h1>
            <p className="mb-6" style={{ color: textSecondary }}>
              Sign in to see what patterns your twin has discovered about you.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="btn-cta-app flex items-center gap-2 mx-auto"
            >
              <Sparkles className="w-4 h-4" />
              Sign In to Explore
            </button>
          </GlassPanel>
        </div>
      </PageLayout>
    );
  }

  // Derive top discoveries from reflections: best reflection per expert domain
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
    <PageLayout maxWidth="xl">
      {/* Header */}
      <div className="py-12" style={{ marginBottom: '3rem' }}>
        <motion.div
          className="flex items-center gap-4 mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Brain className="w-8 h-8" style={{ color: textColor }} />
          <h1 className="heading-serif" style={{ color: textColor, fontSize: 'clamp(2rem, 4vw, 3rem)', fontFamily: 'var(--font-heading)', fontWeight: 400, letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Twin's Brain
          </h1>
          {totalMemories > 0 && (
            <span className="text-xs px-3 py-1 rounded-full ml-auto"
              style={{ background: 'var(--glass-surface-bg)', color: textSecondary }}>
              {totalMemories.toLocaleString('en-US')} memories
            </span>
          )}
        </motion.div>
        <motion.p
          className="text-sm ml-[44px]"
          style={{ color: textSecondary }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Patterns your twin has noticed, and the data that shapes it.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        {/* Discoveries — 2/3 width */}
        <div className="lg:col-span-2">
          <GlassPanel>
            <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
              <Sparkles className="w-4 h-4" style={{ color: '#10b981' }} />
              <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                Discoveries
              </h2>
            </div>

            {reflectionsLoading && (
              <div className="flex items-center justify-center py-12 gap-3" style={{ color: textSecondary }}>
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Twin is thinking…</span>
              </div>
            )}

            {!reflectionsLoading && topDiscoveries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm mb-1 font-medium" style={{ color: textSecondary }}>
                  No discoveries yet
                </p>
                <p className="text-xs mb-4" style={{ color: textSecondary }}>
                  Discoveries appear after 2-3 days of platform data. Connect a platform to start.
                </p>
                <button
                  onClick={() => navigate('/get-started')}
                  className="btn-cta-app flex items-center gap-2 mx-auto"
                >
                  <Link2 className="w-4 h-4" />
                  Connect platforms
                </button>
              </div>
            )}

            {!reflectionsLoading && topDiscoveries.length > 0 && (
              <div className="space-y-6">
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
                    <motion.div
                      key={cardKey}
                      className="glass-card rounded-2xl overflow-hidden cursor-pointer"
                      style={{ background: em?.bg ?? 'var(--glass-surface-bg)', border: `1px solid ${em?.color ?? 'var(--glass-surface-border)'}22` }}
                      onClick={() => setExpandedDiscovery(prev => prev === cardKey ? null : cardKey)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.05 }}
                    >
                      <div className="p-7 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {em && <p className="text-[11px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--accent-vibrant)', letterSpacing: '0.1em' }}>{em.label}</p>}
                          <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                            {isExpanded ? displayContent : preview}
                          </p>
                        </div>
                        {hasMore && (
                          <ChevronDown
                            className="flex-shrink-0 w-4 h-4 mt-0.5 transition-transform duration-200"
                            style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          />
                        )}
                      </div>
                      {isExpanded && !hasMore && null}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </GlassPanel>
        </div>

        {/* Your Data — 1/3 width */}
        <div className="lg:col-span-1">
          <GlassPanel>
            <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
              <Link2 className="w-4 h-4" style={{ color: textSecondary }} />
              <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                Your Data
              </h2>
            </div>

            <p className="text-xs mb-8" style={{ color: textSecondary }}>
              These platforms shape how your twin understands you.
            </p>

            {platformLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl animate-pulse"
                    style={{ background: 'var(--glass-surface-bg)' }}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {ORDERED_PLATFORMS.map((provider) => {
                  const meta = PLATFORM_META[provider];
                  const status = platformStatus?.[provider];
                  const isConnected = status?.connected && status?.isActive;
                  const isExpired = status?.tokenExpired;

                  return (
                    <div
                      key={provider}
                      className="flex items-start gap-3 p-6 rounded-2xl"
                      style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}
                    >
                      <span className="text-xl mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium" style={{ color: textColor }}>
                            {meta.label}
                          </p>
                          {isConnected && !isExpired ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          ) : isExpired ? (
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          ) : (
                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: 'var(--text-muted)' }}
                            />
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                          {meta.description}
                        </p>
                        {isConnected && status?.lastSync && (
                          <p className="text-xs mt-1 flex items-center gap-1"
                            style={{ color: textSecondary }}
                          >
                            <Clock className="w-3 h-3" />
                            {formatLastSync(status.lastSync)}
                          </p>
                        )}
                        {isExpired && (
                          <p className="text-xs mt-1 text-amber-500">Token expired — reconnect</p>
                        )}
                        {!isConnected && !isExpired && (
                          <p className="text-xs mt-1" style={{ color: textSecondary }}>Not connected</p>
                        )}
                        {memoryStats?.byPlatform[provider] != null && (
                          <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                            {memoryStats.byPlatform[provider]} {memoryStats.byPlatform[provider] === 1 ? 'memory' : 'memories'}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => navigate('/get-started')}
              className={cn(
                "w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-sm font-medium transition-all",
                "border border-current opacity-70 hover:opacity-100"
              )}
              style={{ color: textColor }}
            >
              <RefreshCw className="w-4 h-4" />
              Manage Connections
            </button>
          </GlassPanel>
        </div>

        {/* Upload Your Data — GDPR / platform data export ingestion */}
        <div className="lg:col-span-3" style={{ marginTop: '3rem', marginBottom: '3rem' }}>
          <GlassPanel>
            <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
              <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                Upload Your Data
              </h2>
            </div>
            {user?.id && <DataUploadPanel userId={user.id} />}
          </GlassPanel>
        </div>

        {/* Reflections — full width below two-column section */}
        {(reflections.length > 0 || reflectionsLoading) && (
          <div className="lg:col-span-3">
            <GlassPanel>
              <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
                <Sparkles className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                  What Your Twin Has Learned
                </h2>
                {reflections.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full ml-1"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                    {reflections.length} reflections
                  </span>
                )}
              </div>

              {reflectionsLoading && (
                <div className="flex items-center gap-2 py-4" style={{ color: textSecondary }}>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading reflections…</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {reflections.map((r, i) => {
                  const isExpanded = expandedReflection === r.id;
                  const displayContent2 = toSecondPerson(r.content);
                  const dotIdx = displayContent2.indexOf('. ');
                  const preview = dotIdx !== -1 && dotIdx < 120
                    ? displayContent2.slice(0, dotIdx + 1)
                    : displayContent2.slice(0, 120) + (displayContent2.length > 120 ? '…' : '');
                  const hasMore = preview !== displayContent2;
                  return (
                    <motion.div
                      key={r.id}
                      className="glass-card rounded-2xl overflow-hidden cursor-pointer"
                      style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.08)' }}
                      onClick={() => setExpandedReflection(prev => prev === r.id ? null : r.id)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                    >
                      <div className="p-6 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {r.expert && (
                            <p className="text-[11px] font-medium uppercase tracking-widest mb-1.5"
                              style={{ color: 'var(--accent-vibrant)', letterSpacing: '0.1em' }}>
                              {EXPERT_META[r.expert]?.label ?? r.expert}
                            </p>
                          )}
                          <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                            {isExpanded ? displayContent2 : preview}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {r.category && r.category !== r.expert && (
                              <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(139,92,246,0.08)', color: '#8b5cf6' }}>
                                {EXPERT_META[r.category]?.label ?? r.category}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: textSecondary }}>
                              importance {r.importance}/10
                            </span>
                          </div>
                        </div>
                        {hasMore && (
                          <ChevronDown
                            className="flex-shrink-0 w-4 h-4 mt-0.5 transition-transform duration-200"
                            style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </GlassPanel>
          </div>
        )}

        {/* Soul Evolution Timeline */}
        {snapshots.length >= 2 && (
          <div className="lg:col-span-3" style={{ marginTop: '3rem' }}>
            <GlassPanel>
              <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
                <Clock className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                  Soul Signature Evolution
                </h2>
                <span className="text-xs ml-auto" style={{ color: textSecondary }}>
                  {snapshots.length} snapshots
                </span>
              </div>
              <p className="text-xs mb-4" style={{ color: textSecondary }}>
                How your twin's understanding of you has grown over time.
              </p>
              <SoulEvolutionTimeline snapshots={snapshots} />
            </GlassPanel>
          </div>
        )}
      </div>
    </PageLayout>
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
