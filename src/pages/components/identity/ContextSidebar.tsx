/**
 * ContextSidebar — Right panel for split-panel identity layout
 * =============================================================
 * Individual glass cards stacked on the gradient, not one big container.
 * Card 1: Soul Score ring + contributor grid
 * Card 2: Tabbed content (Soul / Insights / Activity)
 * Card 3: Chat CTA
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, ArrowRight, Clock, Zap, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import SoulScore from './SoulScore';
import InsightCards from './InsightCards';
import SidebarTabs, { type SidebarTab } from './SidebarTabs';

const glassStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.15)',
};

interface ContextSidebarProps {
  className?: string;
}

interface SoulLayersLite {
  rhythms?: { chronotype?: string };
}

const ContextSidebar: React.FC<ContextSidebarProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('soul');
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    connectedProviders,
    isLoading: platformsLoading,
    error: platformsError,
    refetch: refetchPlatforms,
  } = usePlatformStatus(user?.id);
  const activeCount = connectedProviders.length;

  // audit-2026-06-10: InsightCards was rendered with zero data props, so the
  // Insights tab permanently showed placeholder stats ('0 memories',
  // '0 platforms', 'Connect Spotify', 'Unknown') styled as live data. Wire the
  // real sources. Query keys deliberately match SoulScore (['memories',
  // 'summary']), PersonalityAxes (['personality', 'ica-axes']), IdentityPage
  // (['soul-signature-layers']) and Settings/TwinIntelligence (['twin',
  // 'fidelity']) so reads are deduped against fetches already on /identity.
  const { data: memorySummary, isLoading: memoryLoading, refetch: refetchMemorySummary } = useQuery<{ total: number } | null>({
    queryKey: ['memories', 'summary'],
    queryFn: async () => {
      const res = await authFetch('/memories?limit=1');
      if (!res.ok) return null;
      const json = await res.json();
      return { total: json.total ?? 0 } as { total: number };
    },
    staleTime: 15 * 60 * 1000,
    enabled: !!user,
  });

  const { data: axes = [], isLoading: axesLoading } = useQuery<{ label: string; description: string }[]>({
    queryKey: ['personality', 'ica-axes'],
    queryFn: async () => {
      const res = await authFetch('/tribe/ica-axes');
      if (!res.ok) return [];
      const json = await res.json();
      const allAxes = json.data?.axes || json.data || [];
      return allAxes.filter((a: { label?: string }) => a.label && !a.label.startsWith('Axis '));
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
    enabled: !!user,
  });

  const { data: fidelity, isLoading: fidelityLoading } = useQuery<{ fidelity_score: number } | null>({
    queryKey: ['twin', 'fidelity'],
    queryFn: async () => {
      const res = await authFetch('/twin/fidelity');
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? null;
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
    enabled: !!user,
  });

  const { data: soulData } = useQuery<{
    success: boolean;
    data: (SoulLayersLite & { layers?: SoulLayersLite }) | null;
  }>({
    queryKey: ['soul-signature-layers'],
    queryFn: async () => {
      const res = await authFetch('/soul-signature/layers');
      if (!res.ok) throw new Error('Failed to load soul signature');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  });

  const soulLayers = soulData?.data?.layers ?? soulData?.data ?? null;
  const chronotype = soulLayers?.rhythms?.chronotype ?? null;
  const joinedAt = user?.createdAt || user?.created_at || null;
  const insightsLoading = memoryLoading || axesLoading || fidelityLoading || platformsLoading;
  // memorySummary resolves to null when the fetch failed (shared fetcher
  // semantics with SoulScore) — never render that as a real '0 memories'.
  const insightsFailed = memorySummary == null || !!platformsError;

  const retryInsights = () => {
    if (memorySummary == null) refetchMemorySummary();
    if (platformsError) refetchPlatforms();
  };

  const { data: activityData } = useQuery<{ memories?: { content: string; memory_type: string; created_at: string }[] }>({
    queryKey: ['sidebar-activity'],
    queryFn: async () => {
      const res = await authFetch('/memories?type=reflection,platform_data&limit=6&sort=newest');
      if (!res.ok) return { memories: [] };
      const json = await res.json();
      return { memories: json.data ?? [] };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Card 1: Soul Score ────────────────────────────────── */}
      <div
        className="rounded-[20px] px-5 py-5 transition-all duration-300 hover:-translate-y-0.5"
        style={glassStyle}
      >
        <SoulScore compact />
      </div>

      {/* ── Card 2: Tabbed Content ────────────────────────────── */}
      <div
        className="rounded-[20px] px-5 py-5 transition-all duration-300 hover:-translate-y-0.5"
        style={glassStyle}
      >
        <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-4 min-h-[120px]">
          {activeTab === 'soul' && (
            <motion.div
              key="soul"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p
                className="text-xs text-center py-3"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
              >
                {activeCount >= 3
                  ? `Your twin is learning from ${activeCount} active source${activeCount !== 1 ? 's' : ''}`
                  : 'Connect more platforms to deepen your soul signature'}
              </p>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {insightsLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>
                    Loading your insights...
                  </span>
                </div>
              ) : insightsFailed ? (
                <div className="flex flex-col items-center gap-2.5 py-5">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(239,68,68,0.7)' }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}>
                      Could not load your insight stats
                    </span>
                  </div>
                  <button
                    onClick={retryInsights}
                    className="text-xs px-3 py-1.5 rounded-[100px] transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <InsightCards
                  axes={axes}
                  memoryCount={memorySummary.total}
                  platformCount={activeCount}
                  fidelityScore={fidelity?.fidelity_score ?? null}
                  joinedAt={joinedAt}
                  chronotype={chronotype}
                  className="[&>div]:flex-col [&>div]:overflow-visible [&>div]:gap-3"
                />
              )}
            </motion.div>
          )}

          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-2"
            >
              <h3
                className="text-[11px] font-medium tracking-[0.12em] uppercase"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
              >
                Recent Activity
              </h3>
              {activityData?.memories && activityData.memories.length > 0 ? (
                activityData.memories.slice(0, 6).map((mem, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2 rounded-[12px] transition-all duration-150 hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    <div className="mt-0.5">
                      {mem.memory_type === 'reflection' ? (
                        <Zap className="w-3.5 h-3.5" style={{ color: 'rgba(245,245,244,0.45)' }} />
                      ) : (
                        <Clock className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
                        {mem.content}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}>
                        {new Date(mem.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}>
                  Activity will appear as your twin learns more about you
                </p>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Card 3: Chat CTA ──────────────────────────────────── */}
      <button
        onClick={() => navigate('/talk-to-twin')}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-85 active:scale-[0.98]"
        style={{
          background: 'var(--accent-vibrant)',
          color: '#0a0909',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <MessageCircle className="w-4 h-4" />
        Chat with your Twin
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default ContextSidebar;
