import { useNavigate } from 'react-router-dom';
import { MessageCircle, User, Plug, BookOpen } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDashboardContext } from '@/hooks/useDashboardContext';
import { useProactiveInsights } from '@/hooks/useProactiveInsights';
import { DashboardGreeting } from './components/dashboard-v2/DashboardGreeting';
import { BetaOnboardingChecklist } from './components/dashboard-v2/BetaOnboardingChecklist';
import { HeroInsight } from './components/dashboard-v2/HeroInsight';
import { InsightsFeed } from './components/dashboard-v2/InsightsFeed';
import { SoulSummaryCard } from './components/dashboard-v2/SoulSummaryCard';
import { WeeklySynthesisCard } from './components/dashboard-v2/WeeklySynthesisCard';
import { DepartmentWidget } from './components/dashboard-v2/DepartmentWidget';
import { ExpiredTokenBanner } from './components/dashboard-v2/ExpiredTokenBanner';
import MorningBriefingCard from '@/components/chat/MorningBriefingCard';
import { EmailTriageCard } from '@/components/EmailTriageCard';
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
  const { insights, markEngaged, submitFeedback, feedbackPendingId } = useProactiveInsights();

  // Register web push on first dashboard load (after auth)
  useWebPush(true);

  if (isLoading) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 pb-24 space-y-10">
        {/* Greeting skeleton */}
        <div className="pt-6 space-y-2">
          <div className="h-3 w-28 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="h-8 w-56 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>
        {/* Summary card skeleton */}
        <div className="rounded-[20px] px-5 py-5 space-y-3 animate-pulse" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="h-4 w-full rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="h-4 w-4/5 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
        </div>
        {/* Insight feed skeleton */}
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-[20px] px-5 py-4 space-y-2 animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-3 w-16 rounded" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-4 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
        ))}
        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-8 w-16 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-3 w-12 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            </div>
          ))}
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

  // Capability statement — replaces vanity stats block
  const memoryCount = data.twinStats.memoryCount;
  const formattedMemoryCount =
    memoryCount > 9999
      ? `${(memoryCount / 1000).toFixed(1).replace(/\.0$/, '')}K`
      : memoryCount.toLocaleString('en-US');
  const capabilityStatement = memoryCount > 0 && connectedCount > 0
    ? `Based on ${formattedMemoryCount} memories across ${connectedCount} ${connectedCount === 1 ? 'platform' : 'platforms'}, your twin can spot patterns in how your music, work, and recovery interact. Ask it anything.`
    : null;

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-24 space-y-10">
      <DashboardGreeting
        firstName={data.greeting.firstName}
        timeLabel={data.greeting.timeLabel}
        insightCount={data.greeting.insightCount}
        streak={data.greeting.streak}
      />

      <ExpiredTokenBanner />

      {/* 1. Morning Briefing — dominant, full-width hero */}
      <div className="-mx-1 sm:-mx-2">
        <MorningBriefingCard />
      </div>

      {/* 1b. Weekly Synthesis — your week read back to you */}
      <WeeklySynthesisCard />

      {/* 2. What Your Twin Noticed — proactive insights */}
      {data.heroInsight && (
        <HeroInsight
          body={data.heroInsight.body}
          source={data.heroInsight.source}
          insightId={data.heroInsight.insightId}
          sources={data.heroInsight.sources}
        />
      )}

      <EmailTriageCard />

      <InsightsFeed
        insights={insights}
        heroInsightId={data.heroInsight?.insightId}
        onEngage={markEngaged}
        onFeedback={submitFeedback}
        feedbackPendingId={feedbackPendingId}
      />

      {/* 3. Soul Signature — condensed blurb */}
      <SoulSummaryCard />

      {/* 4. Capability statement (replaces vanity stats) */}
      {capabilityStatement && (
        <div
          className="rounded-[20px] px-5 py-4 backdrop-blur-[42px]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <p
            className="text-[14px] leading-relaxed"
            style={{
              color: 'rgba(245,245,244,0.75)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            {capabilityStatement}
          </p>
        </div>
      )}

      {/* 5. Everything else — moved down */}
      <DepartmentWidget />

      {/* Wiki discovery CTA — shown once user has enough memories */}
      {data.twinStats.memoryCount >= 10 && (
        <button
          type="button"
          onClick={() => navigate('/wiki')}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-[46px] text-left transition-all duration-150 hover:opacity-80 active:scale-[0.99]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(42px)',
          }}
        >
          <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', sans-serif" }}>
              Your Knowledge Base
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
              Compiled insights about who you are
            </p>
          </div>
        </button>
      )}

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
