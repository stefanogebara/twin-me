/**
 * ContextSidebar — identity's closing sections
 * =============================================
 * Once a right-hand column of glass cards; in the register /identity is one
 * 820px column, so these are its last sections:
 *   Soul score (the ring and the six contributors, as rows)
 *   Your twin  (Soul / Insights / Activity choices over rows, and the chat link)
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Zap } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import { Section, List, Row, Empty } from '@/components/register';
import SoulScore from './SoulScore';
import InsightCards from './InsightCards';
import SidebarTabs, { type SidebarTab } from './SidebarTabs';

interface ContextSidebarProps {
  className?: string;
}

interface SoulLayersLite {
  rhythms?: { chronotype?: string };
}

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

const ContextSidebar: React.FC<ContextSidebarProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('soul');
  const { user } = useAuth();

  // batch3 state-unification: canonical /platforms/summary hook. Display
  // convention from the spec — the primary count is summary.active (expired/
  // stale platforms are not "active sources" the twin is learning from).
  const {
    data: platformsSummary,
    isLoading: platformsLoading,
    error: platformsError,
    refetch: refetchPlatforms,
  } = usePlatformsSummary();
  const activeCount = platformsSummary?.active ?? 0;

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
    <>
      <SoulScore compact className={className} />

      <Section
        title="Your twin"
        action={<Link to="/talk-to-twin" className="n-btn n-btn--ghost">Chat with your twin</Link>}
      >
        <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'soul' && (
          <List>
            <Row
              title={activeCount >= 3
                ? `Learning from ${activeCount} active source${activeCount !== 1 ? 's' : ''}`
                : 'Connect more platforms to deepen your soul signature'}
            />
          </List>
        )}

        {activeTab === 'insights' && (
          insightsLoading ? (
            <List><li><Empty>Loading your insights.</Empty></li></List>
          ) : insightsFailed ? (
            <List>
              <li>
                <Empty>
                  Could not load your insight stats.{' '}
                  <button type="button" style={textLink} onClick={retryInsights}>Try again</button>
                </Empty>
              </li>
            </List>
          ) : (
            <InsightCards
              axes={axes}
              memoryCount={memorySummary.total}
              platformCount={activeCount}
              fidelityScore={fidelity?.fidelity_score ?? null}
              joinedAt={joinedAt}
              chronotype={chronotype}
            />
          )
        )}

        {activeTab === 'activity' && (
          <List label="Recent activity">
            {activityData?.memories && activityData.memories.length > 0 ? (
              activityData.memories.slice(0, 6).map((mem, i) => (
                <Row
                  key={i}
                  icon={mem.memory_type === 'reflection' ? <Zap aria-hidden="true" /> : <Clock aria-hidden="true" />}
                  title={new Date(mem.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  line={mem.content}
                  clip
                />
              ))
            ) : (
              <li><Empty>Activity will appear as your twin learns more about you.</Empty></li>
            )}
          </List>
        )}
      </Section>
    </>
  );
};

export default ContextSidebar;
