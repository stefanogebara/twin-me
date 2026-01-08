/**
 * Calendar Insights Page
 *
 * "Time Patterns" - Conversational reflections from your twin
 * about what your schedule reveals about your priorities and rhythms.
 *
 * NO meeting counts. NO time stats. Just observations about time.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation, DataHighlight, StatCard, EventCard } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Calendar, RefreshCw, Sparkles, ArrowLeft, AlertCircle, Clock, CalendarDays, Users, Target, Presentation, Dumbbell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DEMO_CALENDAR_DATA } from '@/services/demoDataService';

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
  type?: 'meeting' | 'focus' | 'personal' | 'presentation' | 'workout' | 'interview' | 'other';
  attendees?: number;
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
  // New: Specific data for visual display
  upcomingEvents?: UpcomingEvent[];
  todayEvents?: TodayEvent[];
  eventTypes?: string[];
  eventTypeDistribution?: EventTypeDistribution[];
  weeklyHeatmap?: WeeklyHeatmapDay[];
  scheduleStats?: ScheduleStats;
  error?: string;
}

const CalendarInsightsPage: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Theme colors
  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    calendarBlue: '#4285F4',
    calendarBg: theme === 'dark' ? 'rgba(66, 133, 244, 0.15)' : 'rgba(66, 133, 244, 0.1)'
  };

  // Generate demo insights data
  const getDemoInsights = (): InsightsResponse => {
    const calendarData = DEMO_CALENDAR_DATA;
    return {
      success: true,
      reflection: {
        id: 'demo-reflection-1',
        text: `Your calendar tells the story of a balanced professional. You average ${calendarData.patterns.avgMeetingsPerDay} meetings per day, with ${calendarData.patterns.busiestDay} being your busiest. Your twin notices you protect ${calendarData.patterns.focusTimePercentage}% of your time for focused work - a sign you value deep thinking over constant collaboration. Your preferred meeting window is ${calendarData.patterns.preferredMeetingTime}.`,
        generatedAt: new Date().toISOString(),
        expiresAt: null,
        confidence: 'high',
        themes: ['productivity', 'balance', 'patterns'],
      },
      patterns: [
        {
          id: 'pattern-1',
          text: `You tend to schedule important meetings in the ${calendarData.patterns.preferredMeetingTime.includes('am') ? 'morning when energy is highest' : 'afternoon after you\'ve had focus time'}.`,
          occurrences: 'often',
        },
        {
          id: 'pattern-2',
          text: `Your busiest day is ${calendarData.patterns.busiestDay} - consider protecting some time on this day for recovery.`,
          occurrences: 'sometimes',
        },
        {
          id: 'pattern-3',
          text: `You block ${calendarData.patterns.focusTimePercentage}% of your time for focused work. This is ${calendarData.patterns.focusTimePercentage >= 40 ? 'above average - great for deep work!' : 'something to consider increasing for productivity.'}`,
          occurrences: 'noticed',
        },
      ],
      history: [
        {
          id: 'history-1',
          text: 'Your meeting load has been consistent this month. You seem to have found a sustainable rhythm.',
          generatedAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      evidence: [
        {
          id: 'evidence-1',
          observation: `${calendarData.patterns.avgMeetingsPerDay} meetings per day average`,
          dataPoints: [`${calendarData.patterns.focusTimePercentage}% focus time`, `${calendarData.patterns.busiestDay} is busiest`],
          confidence: 'high',
        },
      ],
      upcomingEvents: calendarData.todayEvents.map(event => ({
        title: event.title,
        time: `${event.startTime} - ${event.endTime}`,
        type: event.type as 'meeting' | 'focus' | 'personal' | 'presentation' | 'workout' | 'other',
        attendees: event.attendees,
      })),
      todayEvents: calendarData.todayEvents,
      eventTypes: ['Meetings', 'Deep Work', 'Presentations', 'Personal'],
      eventTypeDistribution: calendarData.eventTypeDistribution,
      weeklyHeatmap: calendarData.weeklyHeatmap,
      scheduleStats: {
        meetingHours: Math.round(calendarData.patterns.avgMeetingsPerDay * 5),
        focusBlocks: Math.round(calendarData.patterns.focusTimePercentage / 10),
        busiestDay: calendarData.patterns.busiestDay,
        preferredMeetingTime: calendarData.patterns.preferredMeetingTime,
      },
    };
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    // Handle demo mode - return demo data
    if (isDemoMode) {
      setError(null); // Clear any previous error
      setInsights(getDemoInsights());
      setLoading(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your time patterns');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/calendar`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await response.json();

      if (data.success) {
        setInsights(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to load insights');
      }
    } catch (err) {
      console.error('Failed to fetch Calendar insights:', err);
      setError('Unable to read your time patterns right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    // In demo mode, just regenerate demo data
    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoInsights());
        setRefreshing(false);
      }, 800);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/calendar/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Skeleton loader component
  const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        ...style
      }}
    />
  );

  // Loading state with skeleton loaders
  if (loading) {
    return (
      <PageLayout>
        {/* Skeleton: Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <SkeletonPulse className="w-10 h-10 rounded-lg" />
            <SkeletonPulse className="w-12 h-12 rounded-xl" />
            <div>
              <SkeletonPulse className="h-7 w-36 mb-2" />
              <SkeletonPulse className="h-4 w-44" />
            </div>
          </div>
          <SkeletonPulse className="w-10 h-10 rounded-lg" />
        </div>

        {/* Skeleton: Upcoming Events */}
        <div className="mb-6">
          <SkeletonPulse className="h-4 w-28 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <GlassPanel key={i} className="!p-3">
                <div className="flex items-center gap-3">
                  <SkeletonPulse className="w-10 h-10 rounded" />
                  <div className="flex-1">
                    <SkeletonPulse className="h-4 w-40 mb-1" />
                    <SkeletonPulse className="h-3 w-20" />
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>

        {/* Skeleton: Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1, 2, 3, 4].map(i => (
            <GlassPanel key={i} className="!p-4">
              <SkeletonPulse className="h-3 w-20 mb-2" />
              <SkeletonPulse className="h-6 w-16" />
            </GlassPanel>
          ))}
        </div>

        {/* Skeleton: Reflection */}
        <GlassPanel className="mb-8">
          <SkeletonPulse className="h-4 w-24 mb-4" />
          <SkeletonPulse className="h-5 w-full mb-2" />
          <SkeletonPulse className="h-5 w-4/5 mb-2" />
          <SkeletonPulse className="h-5 w-2/3" />
        </GlassPanel>

        {/* Skeleton: Patterns */}
        <div>
          <SkeletonPulse className="h-4 w-36 mb-4" />
          <div className="space-y-3">
            {[1, 2].map(i => (
              <GlassPanel key={i} className="!p-4">
                <SkeletonPulse className="h-4 w-full mb-1" />
                <SkeletonPulse className="h-3 w-16" />
              </GlassPanel>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle
            className="w-12 h-12"
            style={{ color: colors.textSecondary }}
          />
          <p style={{ color: colors.textSecondary }}>{error}</p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg glass-button"
            style={{ color: colors.text }}
          >
            Connect Calendar
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {/* Back Button */}
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg glass-button"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
          </button>

          {/* Platform Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.calendarBg }}
          >
            <Calendar className="w-6 h-6" style={{ color: colors.calendarBlue }} />
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-2xl"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: colors.text
              }}
            >
              Time Patterns
            </h1>
            <p
              className="text-sm"
              style={{ color: colors.textSecondary }}
            >
              How you structure your days
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg glass-button"
          title="Get a fresh observation"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: colors.text }}
          />
        </button>
      </div>

      {/* Today's Schedule Timeline */}
      {insights?.todayEvents && insights.todayEvents.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Clock className="w-4 h-4" style={{ color: colors.calendarBlue }} />
            Today's Schedule
          </h3>
          {/* Timeline visualization */}
          <div className="relative">
            {/* Time axis */}
            <div className="flex justify-between text-xs mb-2" style={{ color: colors.textSecondary }}>
              {['8AM', '10AM', '12PM', '2PM', '4PM', '6PM'].map(time => (
                <span key={time}>{time}</span>
              ))}
            </div>
            {/* Timeline bar */}
            <div
              className="h-12 rounded-lg relative overflow-hidden"
              style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}
            >
              {insights.todayEvents.map((event, index) => {
                // Convert time to percentage position (8AM = 0%, 6PM = 100%)
                const startHour = parseInt(event.startTime.split(':')[0]);
                const endHour = parseInt(event.endTime.split(':')[0]);
                const startMin = parseInt(event.startTime.split(':')[1]) || 0;
                const endMin = parseInt(event.endTime.split(':')[1]) || 0;

                const startPos = ((startHour - 8 + startMin / 60) / 10) * 100;
                const width = ((endHour - startHour + (endMin - startMin) / 60) / 10) * 100;

                const eventColors: Record<string, string> = {
                  meeting: '#4285F4',
                  focus: '#34A853',
                  presentation: '#FBBC05',
                  workout: '#EA4335',
                  personal: '#9334E9',
                };

                if (startPos >= 0 && startPos <= 100) {
                  return (
                    <div
                      key={event.id}
                      className="absolute h-full rounded-md flex items-center justify-center px-2 overflow-hidden"
                      style={{
                        left: `${Math.max(0, startPos)}%`,
                        width: `${Math.min(width, 100 - startPos)}%`,
                        backgroundColor: eventColors[event.type] || '#666',
                        opacity: 0.9,
                      }}
                      title={`${event.title} (${event.startTime} - ${event.endTime})`}
                    >
                      <span className="text-xs text-white truncate font-medium">
                        {event.title.length > 15 ? event.title.slice(0, 15) + '...' : event.title}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Enhanced Upcoming Events with Icons and Attendees */}
      {insights?.upcomingEvents && insights.upcomingEvents.length > 0 && (
        <div className="mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <CalendarDays className="w-4 h-4" style={{ color: colors.calendarBlue }} />
            Coming Up
          </h3>
          <div className="space-y-2">
            {insights.upcomingEvents.map((event, index) => {
              const eventIcons: Record<string, React.ReactNode> = {
                meeting: <Users className="w-4 h-4" />,
                focus: <Target className="w-4 h-4" />,
                presentation: <Presentation className="w-4 h-4" />,
                workout: <Dumbbell className="w-4 h-4" />,
                interview: <Users className="w-4 h-4" />,
              };

              const eventColors: Record<string, string> = {
                meeting: '#4285F4',
                focus: '#34A853',
                presentation: '#FBBC05',
                workout: '#EA4335',
                interview: '#9334E9',
              };

              return (
                <GlassPanel key={index} className="!p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${eventColors[event.type || 'meeting']}20` }}
                    >
                      <span style={{ color: eventColors[event.type || 'meeting'] }}>
                        {eventIcons[event.type || 'meeting'] || <Calendar className="w-4 h-4" />}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" style={{ color: colors.text }}>
                        {event.title}
                      </div>
                      <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                        <span>{event.time}</span>
                        {event.attendees !== undefined && event.attendees > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {event.attendees}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className="text-xs px-2 py-1 rounded-full capitalize"
                      style={{
                        backgroundColor: `${eventColors[event.type || 'meeting']}20`,
                        color: eventColors[event.type || 'meeting'],
                      }}
                    >
                      {event.type}
                    </span>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        </div>
      )}

      {/* Event Type Distribution */}
      {insights?.eventTypeDistribution && insights.eventTypeDistribution.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <CalendarDays className="w-4 h-4" />
            How You Spend Your Time
          </h3>
          <div className="space-y-3">
            {insights.eventTypeDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-sm w-24" style={{ color: colors.text }}>
                  {item.type}
                </span>
                <div
                  className="flex-1 h-5 rounded-lg overflow-hidden"
                  style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)' }}
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
        </GlassPanel>
      )}

      {/* Weekly Busy Hours Heatmap */}
      {insights?.weeklyHeatmap && insights.weeklyHeatmap.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Clock className="w-4 h-4" />
            Weekly Busy Hours
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-[280px]">
              {/* Time slot headers */}
              <div className="flex mb-2">
                <div className="w-10" />
                {['8-10', '10-12', '12-2', '2-4', '4-6'].map(slot => (
                  <div
                    key={slot}
                    className="flex-1 text-center text-xs"
                    style={{ color: colors.textSecondary }}
                  >
                    {slot}
                  </div>
                ))}
              </div>
              {/* Day rows */}
              {insights.weeklyHeatmap.map((day, dayIndex) => (
                <div key={dayIndex} className="flex items-center mb-1">
                  <div
                    className="w-10 text-xs"
                    style={{ color: colors.textSecondary }}
                  >
                    {day.day}
                  </div>
                  {day.slots.map((slot, slotIndex) => {
                    const intensityColors = [
                      theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', // free
                      'rgba(66, 133, 244, 0.3)', // light
                      'rgba(66, 133, 244, 0.6)', // moderate
                      'rgba(66, 133, 244, 0.9)', // busy
                    ];
                    return (
                      <div
                        key={slotIndex}
                        className="flex-1 h-6 rounded mx-0.5"
                        style={{ backgroundColor: intensityColors[slot.intensity] }}
                        title={`${day.day} ${slot.slot}: ${['Free', 'Light', 'Moderate', 'Busy'][slot.intensity]}`}
                      />
                    );
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-xs" style={{ color: colors.textSecondary }}>Free</span>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="w-4 h-3 rounded"
                      style={{
                        backgroundColor: [
                          theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          'rgba(66, 133, 244, 0.3)',
                          'rgba(66, 133, 244, 0.6)',
                          'rgba(66, 133, 244, 0.9)',
                        ][i],
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs" style={{ color: colors.textSecondary }}>Busy</span>
              </div>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Schedule Stats - Visual indicators */}
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
      {insights?.reflection && (
        <div className="mb-8">
          <TwinReflection
            reflection={insights.reflection.text}
            timestamp={insights.reflection.generatedAt}
            confidence={insights.reflection.confidence}
            isNew={true}
          />
          {/* Evidence Section - Collapsible */}
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection
              evidence={insights.evidence}
              crossPlatformContext={insights.crossPlatformContext}
              className="mt-4"
            />
          )}
        </div>
      )}

      {/* Pattern Observations */}
      {insights?.patterns && insights.patterns.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Sparkles className="w-4 h-4" />
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
            className="text-sm uppercase tracking-wider mb-4"
            style={{ color: colors.textSecondary }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <GlassPanel key={past.id} variant="default" className="!p-4">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
                >
                  {past.text}
                </p>
                <p
                  className="text-xs mt-2"
                  style={{ color: colors.textSecondary }}
                >
                  {new Date(past.generatedAt).toLocaleDateString()}
                </p>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!insights?.reflection && (
        <GlassPanel className="text-center py-12">
          <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
            Your twin is studying your schedule
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As your calendar fills with events, your twin will notice patterns in how you structure your time.
          </p>
        </GlassPanel>
      )}
    </PageLayout>
  );
};

export default CalendarInsightsPage;
