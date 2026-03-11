import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDashboardContext } from '@/hooks/useDashboardContext';
import { DashboardGreeting } from './components/dashboard-v2/DashboardGreeting';
import { HeroInsight } from './components/dashboard-v2/HeroInsight';
import { TwinStats } from './components/dashboard-v2/TwinStats';
import { NextUpEvents } from './components/dashboard-v2/NextUpEvents';
import { PlatformsList } from './components/dashboard-v2/PlatformsList';
import { ChatPrompt } from './components/dashboard-v2/ChatPrompt';

export function DashboardV2() {
  useDocumentTitle('Dashboard');
  const { data, isLoading, isError, refetch } = useDashboardContext();

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--text-muted)' }} />
        </div>
      </PageLayout>
    );
  }

  if (isError || !data) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Something went wrong
          </p>
          <button
            onClick={() => refetch()}
            className="text-sm px-4 py-2 rounded-full border-none cursor-pointer"
            style={{ background: '#252222', color: 'var(--foreground)' }}
          >
            Retry
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <motion.div
        className="max-w-[720px] mx-auto px-6 pb-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <DashboardGreeting
          firstName={data.greeting.firstName}
          timeLabel={data.greeting.timeLabel}
          insightCount={data.greeting.insightCount}
          streak={data.greeting.streak}
        />

        {data.heroInsight && (
          <HeroInsight
            body={data.heroInsight.body}
            source={data.heroInsight.source}
            insightId={data.heroInsight.insightId}
          />
        )}

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
      </motion.div>
    </PageLayout>
  );
}

export default DashboardV2;
