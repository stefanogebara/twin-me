import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDashboardContext, useDashboardHeatmap } from '@/hooks/useDashboardContext';
import { useProactiveInsights } from '@/hooks/useProactiveInsights';
import { DashboardGreeting } from './components/dashboard-v2/DashboardGreeting';
import { WelcomeGuide } from './components/dashboard-v2/WelcomeGuide';
import { HeroInsight } from './components/dashboard-v2/HeroInsight';
import { InsightsFeed } from './components/dashboard-v2/InsightsFeed';
import { DepartmentWidget } from './components/dashboard-v2/DepartmentWidget';
import { TwinStats } from './components/dashboard-v2/TwinStats';
import { ExpiredTokenBanner } from './components/dashboard-v2/ExpiredTokenBanner';
import { useWebPush } from '@/hooks/useWebPush';

const WELCOME_DISMISSED_KEY = 'twinme_welcome_dismissed';

export function DashboardV2() {
  useDocumentTitle('Dashboard');
  const { data, isLoading, isError, refetch } = useDashboardContext();
  const { data: heatmapData } = useDashboardHeatmap();
  const { insights, markEngaged } = useProactiveInsights();

  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem(WELCOME_DISMISSED_KEY);
  });

  // Auto-dismiss welcome guide after first render and mark in localStorage
  useEffect(() => {
    if (showWelcome && data) {
      const timer = setTimeout(() => {
        localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
        setShowWelcome(false);
      }, 30_000); // auto-dismiss after 30s if user doesn't interact
      return () => clearTimeout(timer);
    }
  }, [showWelcome, data]);

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

  const handleDismissWelcome = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    setShowWelcome(false);
  };

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 pb-24 space-y-10">
      <DashboardGreeting
        firstName={data.greeting.firstName}
        timeLabel={data.greeting.timeLabel}
        insightCount={data.greeting.insightCount}
        streak={data.greeting.streak}
      />

      <ExpiredTokenBanner />

      {showWelcome && (
        <WelcomeGuide firstName={data.greeting.firstName} onDismiss={handleDismissWelcome} />
      )}

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

      <DepartmentWidget />

      <TwinStats
        readiness={data.twinStats.readiness}
        memoryCount={data.twinStats.memoryCount}
        memoriesThisWeek={data.twinStats.memoriesThisWeek}
        streak={data.twinStats.streak}
        heatmap={heatmapData ?? data.heatmap ?? []}
      />
    </div>
  );
}

export default DashboardV2;
