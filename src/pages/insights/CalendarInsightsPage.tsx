/**
 * Calendar Insights Page
 *
 * "Your time" - the twin's reflection on what your schedule says about your
 * priorities and rhythms, then today, what's coming up, and the shape of
 * your week. The register's page kit: sections of rows, charts in a list item.
 */

import React from 'react';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Page, Section, List } from '@/components/register';
import { TwinReflection, StatCard } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { UpcomingEventsSection } from './components/UpcomingEventsSection';
import { WeeklyHeatmap } from './components/WeeklyHeatmap';
import { TodayTimeline } from './components/TodayTimeline';
import { CalendarEmptyState } from './components/CalendarEmptyState';
import { CalendarSkeleton } from './components/CalendarSkeleton';
import { RefreshingIndicator } from './components/RefreshingIndicator';
import { InsightsGenerationError } from './components/InsightsGenerationError';
import { InsightsError, MixBar, PatternsSection, HistorySection, PendingReflection } from './components/InsightsKit';
import { eventHue } from './components/calendarHues';
import { Clock, CalendarDays } from 'lucide-react';
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

const TITLE = 'Your time';

const CalendarInsightsPage: React.FC = () => {
  useDocumentTitle('Calendar Insights');

  const navigate = useNavigate();

  const { insights, loading, generating, isRefreshing, error, generationError, refresh } =
    usePlatformInsights<InsightsResponse>('calendar', 'Please sign in to see your time patterns');

  // Keep previous insights rendered during a refresh (audit-2026-06-10);
  // the skeleton is only for the no-data cold start.
  if ((loading || generating) && !insights) {
    return <CalendarSkeleton />;
  }

  // Generation failed with nothing to show — inline retry, not a connect CTA.
  if (generationError && !insights) {
    return <InsightsGenerationError title={TITLE} message={generationError} onRetry={refresh} retrying={isRefreshing} />;
  }

  if (error) {
    return (
      <InsightsError title={TITLE} message={error} actionLabel="Connect Calendar" onAction={() => navigate('/get-started')} />
    );
  }

  const hasEvents = Boolean(insights?.todayEvents?.length || insights?.upcomingEvents?.length);
  const hasHeatmap = Boolean(insights?.weeklyHeatmap && insights.weeklyHeatmap.length > 0);
  const stats = insights?.scheduleStats;

  return (
    <Page>
      <InsightsPageHeader
        title={TITLE}
        line="How you structure your days"
        onBack={() => navigate('/identity')}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />

      <RefreshingIndicator visible={isRefreshing} />

      {/* Primary Reflection */}
      {insights?.reflection?.text ? (
        <TwinReflection
          reflection={insights.reflection.text}
          timestamp={insights.reflection.generatedAt}
          confidence={insights.reflection.confidence}
          isNew={true}
        >
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection evidence={insights.evidence} crossPlatformContext={insights.crossPlatformContext} />
          )}
        </TwinReflection>
      ) : hasEvents ? (
        <PendingReflection what="schedule" />
      ) : null}

      {insights?.todayEvents && insights.todayEvents.length > 0 && (
        <TodayTimeline events={insights.todayEvents} />
      )}

      {insights?.upcomingEvents && insights.upcomingEvents.length > 0 && (
        <UpcomingEventsSection events={insights.upcomingEvents} />
      )}

      {/* Event type distribution, as parts of one whole. The hue comes from
          the event type (calendarHues), not the API's Google colours. */}
      {insights?.eventTypeDistribution && insights.eventTypeDistribution.length > 0 && (
        <Section title="How you spend your time" line="Share of your events by kind.">
          <List>
            <li className="ri-block">
              <MixBar
                parts={insights.eventTypeDistribution.map((item) => ({
                  key: item.type,
                  label: `${item.type} ${item.percentage}%`,
                  share: item.percentage,
                  color: eventHue(item.type),
                }))}
              />
            </li>
          </List>
        </Section>
      )}

      {/* The week: busy hours, then the busiest day and peak hours */}
      {(hasHeatmap || stats?.busiestDay || stats?.preferredMeetingTime) && (
        <Section title="Your week" line="When your days fill up.">
          <List>
            {hasHeatmap && <WeeklyHeatmap heatmap={insights!.weeklyHeatmap!} />}
            {stats?.busiestDay && (
              <StatCard label="Busiest day" value={stats.busiestDay} icon={<CalendarDays />} />
            )}
            {stats?.preferredMeetingTime && (
              <StatCard label="Peak hours" value={stats.preferredMeetingTime} icon={<Clock />} />
            )}
          </List>
        </Section>
      )}

      <PatternsSection patterns={insights?.patterns} />
      <HistorySection history={insights?.history} />

      {/* Empty State */}
      {!insights?.reflection?.text && !hasEvents && (
        <CalendarEmptyState
          onConnect={() => navigate('/get-started')}
          notConnected={insights?.notConnected === true}
        />
      )}
    </Page>
  );
};

export default CalendarInsightsPage;
