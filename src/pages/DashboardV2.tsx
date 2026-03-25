import { Loader2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDashboardContext } from '@/hooks/useDashboardContext';
import { useProactiveInsights } from '@/hooks/useProactiveInsights';
import { DashboardGreeting } from './components/dashboard-v2/DashboardGreeting';
import { WelcomeGuide } from './components/dashboard-v2/WelcomeGuide';
import { HeroInsight } from './components/dashboard-v2/HeroInsight';
import { InsightsFeed } from './components/dashboard-v2/InsightsFeed';
import { TwinStats } from './components/dashboard-v2/TwinStats';
import { NextUpEvents } from './components/dashboard-v2/NextUpEvents';
import { PlatformsList } from './components/dashboard-v2/PlatformsList';
import { ChatPrompt } from './components/dashboard-v2/ChatPrompt';
import { DailyTimeline } from './components/dashboard-v2/DailyTimeline';
import { MessagingPrompt } from './components/dashboard-v2/MessagingPrompt';
import { WhatsAppCard } from './components/dashboard-v2/WhatsAppCard';
import { useWebPush } from '@/hooks/useWebPush';

export function DashboardV2() {
  useDocumentTitle('Dashboard');
  const { data, isLoading, isError, refetch } = useDashboardContext();
  const { insights, markEngaged } = useProactiveInsights();

  // Register web push on first dashboard load (after auth)
  useWebPush(true);

  if (isLoading) {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-16">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="animate-spin w-5 h-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-16">
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

  return (
    <div className="max-w-[720px] mx-auto px-6 pb-24">
      <DashboardGreeting
        firstName={data.greeting.firstName}
        timeLabel={data.greeting.timeLabel}
        insightCount={data.greeting.insightCount}
        streak={data.greeting.streak}
      />

      <WelcomeGuide firstName={data.greeting.firstName} />

      {data.heroInsight && (
        <HeroInsight
          body={data.heroInsight.body}
          source={data.heroInsight.source}
          insightId={data.heroInsight.insightId}
        />
      )}

      <WhatsAppCard />

      <MessagingPrompt />

      <InsightsFeed
        insights={insights}
        heroInsightId={data.heroInsight?.insightId}
        onEngage={markEngaged}
      />

      <DailyTimeline />

      <TwinStats
        readiness={data.twinStats.readiness}
        memoryCount={data.twinStats.memoryCount}
        memoriesThisWeek={data.twinStats.memoriesThisWeek}
        streak={data.twinStats.streak}
        heatmap={data.heatmap}
      />

      <NextUpEvents events={data.nextEvents} />

      <PlatformsList platforms={data.platforms} />

      <ChatPrompt />
    </div>
  );
}

export default DashboardV2;
