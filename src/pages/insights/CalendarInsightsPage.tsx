/**
 * Calendar Insights Page
 *
 * "Time Patterns" - Conversational reflections from your twin
 * about what your schedule reveals about your priorities and rhythms.
 *
 * NO meeting counts. NO time stats. Just observations about time.
 */

import React from 'react';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { TwinReflection, PatternObservation, StatCard } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { UpcomingEventsSection } from './components/UpcomingEventsSection';
import { WeeklyHeatmap } from './components/WeeklyHeatmap';
import { TodayTimeline } from './components/TodayTimeline';
import { CalendarEmptyState } from './components/CalendarEmptyState';
import { CalendarSkeleton } from './components/CalendarSkeleton';
import { RefreshingIndicator } from './components/RefreshingIndicator';
import { InsightsGenerationError } from './components/InsightsGenerationError';
import { Calendar, AlertCircle, Clock, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Reflection {
  id: string | null;
  text: string;
  generatedAt: string;
  expiresAt: string | null;
  confidence: 'high' | 'medium' | 'low';
  themes: string[];
}

interface Pattern {
  id: string;
  text: string;
  occurrences: 'often' | 'sometimes' | 'noticed';
}

interface HistoryItem {
  id: string;
  text: string;
  generatedAt: string;
}

interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

interface UpcomingEvent {
  title: string;
  time: string;
  type?: 'meeting' | 'focus' | 'personal' | 'presentation' | 'workout' | 'interview' | 'learning' | 'other';
  attendees?: number;
  date?: string;
  dayLabel?: string;
}

interface TodayEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: string;
  attendees: number;
  isRecurring?: boolean;
}

interface EventTypeDistribution {
  type: string;
  percentage: number;
  color: string;
}

interface WeeklyHeatmapDay {
  day: string;
  slots: Array<{ slot: string; intensity: number }>;
}

interface ScheduleStats {
  meetingHours?: number;
  focusBlocks?: number;
  busiestDay?: string;
  preferredMeetingTime?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext;
  upcomingEvents?: UpcomingEvent[];
  todayEvents?: TodayEvent[];
  eventTypes?: string[];
  eventTypeDistribution?: EventTypeDistribution[];
  weeklyHeatmap?: WeeklyHeatmapDay[];
  scheduleStats?: ScheduleStats;
  // True when the user hasn't connected the platform — the backend then returns
  // `reflection` as a plain string placeholder, not a Reflection object (audit-2026-06-10).
  notConnected?: boolean;
  error?: string;
}

const CalendarInsightsPage: React.FC = () => {
  useDocumentTitle('Calendar Insights');

  const navigate = useNavigate();

  const { insights, loading, generating, isRefreshing, error, generationError, refresh } =
    usePlatformInsights<InsightsResponse>('calendar', 'Please sign in to see your time patterns');

  const colors = {
    text: 'var(--foreground)',
    textSecondary: 'rgba(255,255,255,0.4)',
    calendarBlue: '#4285F4',
    calendarBg: 'rgba(66, 133, 244, 0.1)'
  };

  // Keep previous insights rendered during a refresh (audit-2026-06-10);
  // the skeleton is only for the no-data cold start.
  if ((loading || generating) && !insights) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <CalendarSkeleton />
      </div>
    );
  }

  // Generation failed with nothing to show — inline retry, not a connect CTA.
  if (generationError && !insights) {
    return <InsightsGenerationError message={generationError} onRetry={refresh} retrying={isRefreshing} />;
  }

  if (error) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle
            className="w-12 h-12"
            style={{ color: colors.textSecondary }}
          />
          <p style={{ color: colors.textSecondary }}>{error}</p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg font-medium transition-colors"
            style={{ color: '#10b77f', border: '1px solid rgba(16,183,127,0.3)' }}
          >
            Connect Calendar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      <InsightsPageHeader
        title="Time Patterns"
        subtitle="How you structure your days"
        icon={<Calendar className="w-6 h-6" style={{ color: colors.calendarBlue }} />}
        iconColor={colors.calendarBlue}
        iconBgColor={colors.calendarBg}
        textColor={colors.text}
        textSecondaryColor={colors.textSecondary}
        onBack={() => navigate('/dashboard')}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <RefreshingIndicator visible={isRefreshing} />

      {insights?.todayEvents && insights.todayEvents.length > 0 && (
        <TodayTimeline
          events={insights.todayEvents}
          colors={colors}
        />
      )}

      {insights?.upcomingEvents && insights.upcomingEvents.length > 0 && (
        <UpcomingEventsSection
          events={insights.upcomingEvents}
          colors={colors}
        />
      )}

      {/* Event Type Distribution */}
      {insights?.eventTypeDistribution && insights.eventTypeDistribution.length > 0 && (
        <div
          className="p-4 rounded-lg mb-6"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <h3
            className="text-[11px] font-medium tracking-widest uppercase mb-4"
            style={{ color: '#10b77f' }}
          >
            How You Spend Your Time
          </h3>
          <div className="space-y-3">
            {insights.eventTypeDistribution.map((item) => (
              <div key={item.type} className="flex items-center gap-3">
                <span className="text-sm w-24" style={{ color: colors.text }}>
                  {item.type}
                </span>
                <div
                  className="flex-1 h-5 rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--glass-surface-bg)' }}
                >
                  <div
                    className="h-full rounded-lg transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <span
                  className="text-sm font-medium w-12 text-right"
                  style={{ color: colors.textSecondary }}
                >
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights?.weeklyHeatmap && insights.weeklyHeatmap.length > 0 && (
        <WeeklyHeatmap
          heatmap={insights.weeklyHeatmap}
          colors={colors}
        />
      )}

      {/* Schedule Stats */}
      {insights?.scheduleStats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {insights.scheduleStats.busiestDay && (
            <StatCard
              label="Busiest Day"
              value={insights.scheduleStats.busiestDay}
              icon={<CalendarDays className="w-4 h-4" />}
              accentColor={colors.calendarBlue}
            />
          )}
          {insights.scheduleStats.preferredMeetingTime && (
            <StatCard
              label="Peak Hours"
              value={insights.scheduleStats.preferredMeetingTime}
              icon={<Clock className="w-4 h-4" />}
              accentColor={colors.calendarBlue}
            />
          )}
        </div>
      )}

      {/* Primary Reflection */}
      {insights?.reflection?.text ? (
        <div className="mb-8">
          <TwinReflection
            reflection={insights.reflection.text}
            timestamp={insights.reflection.generatedAt}
            confidence={insights.reflection.confidence}
            isNew={true}
          />
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection
              evidence={insights.evidence}
              crossPlatformContext={insights.crossPlatformContext}
              className="mt-4"
            />
          )}
        </div>
      ) : (insights?.todayEvents?.length || insights?.upcomingEvents?.length) ? (
        <div
          className="mb-8 p-4 rounded-lg"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <p
            className="text-[11px] font-medium tracking-widest uppercase mb-2"
            style={{ color: '#10b77f' }}
          >
            Twin's Observation
          </p>
          <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            Your twin is processing observations about your schedule. Check back soon for personalized insights about how you structure your time.
          </p>
        </div>
      ) : null}

      {/* Pattern Observations */}
      {insights?.patterns && insights.patterns.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-[11px] font-medium tracking-widest uppercase mb-4"
            style={{ color: '#10b77f' }}
          >
            Patterns I've Noticed
          </h3>
          <div className="space-y-3">
            {insights.patterns.map(pattern => (
              <PatternObservation
                key={pattern.id}
                text={pattern.text}
                occurrences={pattern.occurrences}
              />
            ))}
          </div>
        </div>
      )}

      {/* Historical Reflections */}
      {insights?.history && insights.history.length > 0 && (
        <div>
          <h3
            className="text-[11px] font-medium tracking-widest uppercase mb-4"
            style={{ color: '#10b77f' }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <div
                key={past.id}
                className="p-4 rounded-lg"
                style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: colors.textSecondary }}
                >
                  {past.text}
                </p>
                <p
                  className="text-xs mt-2"
                  style={{ color: colors.textSecondary }}
                >
                  {new Date(past.generatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!insights?.reflection?.text && !insights?.todayEvents?.length && !insights?.upcomingEvents?.length && (
        <CalendarEmptyState
          colors={colors}
          onConnect={() => navigate('/get-started')}
          notConnected={insights?.notConnected === true}
        />
      )}
    </div>
  );
};

export default CalendarInsightsPage;
