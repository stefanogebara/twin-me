import { useNavigate } from 'react-router-dom';
import { Loader2, MessageCircle, User, Plug } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDashboardContext, useDashboardHeatmap } from '@/hooks/useDashboardContext';
import { useProactiveInsights } from '@/hooks/useProactiveInsights';
import { DashboardGreeting } from './components/dashboard-v2/DashboardGreeting';
import { BetaOnboardingChecklist } from './components/dashboard-v2/BetaOnboardingChecklist';
import { HeroInsight } from './components/dashboard-v2/HeroInsight';
import { InsightsFeed } from './components/dashboard-v2/InsightsFeed';
import { TwinStats } from './components/dashboard-v2/TwinStats';
import { SoulSummaryCard } from './components/dashboard-v2/SoulSummaryCard';
import { ExpiredTokenBanner } from './components/dashboard-v2/ExpiredTokenBanner';
import { useWebPush } from '@/hooks/useWebPush';

const QUICK_ACTIONS = [
  { label: 'Chat with twin', icon: MessageCircle, path: '/talk-to-twin' },
  { label: 'Your identity', icon: User, path: '/identity' },
  { label: 'Connected platforms', icon: Plug, path: '/connect' },
];

export function DashboardV2() {
  useDocumentTitle('Dashboard');
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useDashboardContext();
  const { data: heatmapData } = useDashboardHeatmap();
  const { insights, markEngaged } = useProactiveInsights();

  // Register web push on first dashboard load (after auth)
  useWebPush(true);

  if (isLoading) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="animate-spin w-5 h-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Something went wrong
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm px-4 py-2 rounded-[100px] transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97]"
            style={{
              border: '1px solid var(--border)',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const connectedCount = data.platforms?.filter((p) => p.status !== 'disconnected').length ?? 0;

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pb-24 space-y-10">
      <DashboardGreeting
        firstName={data.greeting.firstName}
        timeLabel={data.greeting.timeLabel}
        insightCount={data.greeting.insightCount}
        streak={data.greeting.streak}
      />

      <ExpiredTokenBanner />

      <SoulSummaryCard />

      {data.heroInsight && (
        <HeroInsight
          body={data.heroInsight.body}
          source={data.heroInsight.source}
          insightId={data.heroInsight.insightId}
        />
      )}

      <InsightsFeed
        insights={insights}
        heroInsightId={data.heroInsight?.insightId}
        onEngage={markEngaged}
      />

      <TwinStats
        readiness={data.twinStats.readiness}
        memoryCount={data.twinStats.memoryCount}
        memoriesThisWeek={data.twinStats.memoriesThisWeek}
        streak={data.twinStats.streak}
        heatmap={heatmapData ?? data.heatmap ?? []}
      />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {QUICK_ACTIONS.map(({ label, icon: Icon, path }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[46px] text-sm font-medium transition-all duration-150 hover:opacity-80 active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(42px)',
              color: 'var(--text-secondary)',
            }}
          >
            <Icon className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            {label}
          </button>
        ))}
      </div>

      {connectedCount < 2 && <BetaOnboardingChecklist />}
    </div>
  );
}

export default DashboardV2;
