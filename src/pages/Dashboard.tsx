import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Target, Flame, Trophy, ChevronRight, Globe } from 'lucide-react';
import { goalsAPI, GoalSummary } from '@/services/api/goalsAPI';
import { PageLayout } from '@/components/layout/PageLayout';
import { calendarAPI, CalendarEvent } from '@/services/apiService';
import { TodayInsights } from '@/components/TodayInsights';
import { ProactiveInsightsPanel } from '@/components/ProactiveInsightsPanel';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { DEMO_CALENDAR_DATA } from '@/services/demoDataService';
import { DashboardSkeleton } from './components/dashboard/DashboardSkeleton';
import { NextEventCard } from './components/dashboard/NextEventCard';
import { TwinInsightsGrid } from './components/dashboard/TwinInsightsGrid';

// Auto-refresh interval for calendar events (1 minute)
const CALENDAR_REFRESH_INTERVAL = 60 * 1000;

interface Pattern {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  actionLabel?: string;
  actionPath?: string;
  hasData?: boolean;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [goalSummary, setGoalSummary] = useState<GoalSummary | null>(null);
  const [error, setError] = useState<{ message: string; type?: 'auth' | 'general' } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const { connectedProviders } = usePlatformStatus(user?.id);

  // Update current time every 30 seconds for live event filtering
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute today's events and next event based on current time (live filtering)
  const { todayEvents, nextEvent } = useMemo(() => {
    const now = currentTime;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todaysEvents = allEvents.filter((event: CalendarEvent) => {
      const eventStart = new Date(event.startTime);
      return eventStart >= todayStart && eventStart < todayEnd;
    });

    const upcomingEvents = allEvents
      .filter((event: CalendarEvent) => new Date(event.endTime) > now)
      .sort((a: CalendarEvent, b: CalendarEvent) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

    return {
      todayEvents: todaysEvents,
      nextEvent: upcomingEvents.length > 0 ? upcomingEvents[0] : null
    };
  }, [allEvents, currentTime]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      const isDemoMode = localStorage.getItem('demo_mode') === 'true';

      if (isDemoMode) {
        setCalendarConnected(true);

        const today = new Date();
        const demoEvents: CalendarEvent[] = DEMO_CALENDAR_DATA.todayEvents.map((evt) => {
          const [startH, startM] = evt.startTime.split(':').map(Number);
          const [endH, endM] = evt.endTime.split(':').map(Number);
          const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startH, startM);
          const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endH, endM);
          return {
            id: evt.id,
            title: evt.title,
            startTime: start,
            endTime: end,
            type: (evt.type === 'focus' || evt.type === 'workout') ? 'personal' : evt.type as CalendarEvent['type'],
            isImportant: (evt.attendees || 0) > 3,
          };
        });
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        DEMO_CALENDAR_DATA.upcomingEvents.forEach((evt) => {
          const [h, m] = (evt.time || '10:00').split(':').map(Number);
          const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), h, m);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          demoEvents.push({
            id: evt.id,
            title: evt.title,
            startTime: start,
            endTime: end,
            type: evt.type as CalendarEvent['type'],
            isImportant: (evt.attendees || 0) > 3,
          });
        });
        setAllEvents(demoEvents);
        setLoading(false);
        return;
      }

      try {
        const [calendarStatus, goalResult] = await Promise.allSettled([
          calendarAPI.getStatus(),
          goalsAPI.getSummary()
        ]);

        if (goalResult.status === 'fulfilled') {
          setGoalSummary(goalResult.value);
        }

        if (calendarStatus.status === 'fulfilled') {
          setCalendarConnected(calendarStatus.value.connected);
        }

        if (calendarStatus.status === 'fulfilled' && calendarStatus.value.connected) {
          if (calendarStatus.value.tokenExpired) {
            setError({
              message: 'Calendar connection expired. Please reconnect to see your events.',
              type: 'auth'
            });
          } else {
            try {
              const eventsResponse = await calendarAPI.getEvents();
              setAllEvents(eventsResponse.events || []);
            } catch (err: unknown) {
              const isAuthError = err instanceof Error && (
                err.message.includes('401') ||
                err.message.includes('403') ||
                err.message.includes('unauthorized') ||
                err.message.includes('Unauthorized') ||
                err.message.includes('expired') ||
                err.message.includes('token')
              );
              if (err instanceof Error && !err.message.includes('not connected')) {
                setError({
                  message: isAuthError
                    ? 'Calendar connection expired. Please reconnect to see your events.'
                    : 'Failed to load calendar events',
                  type: isAuthError ? 'auth' : 'general'
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Dashboard loading error:', err);
        setError({ message: 'Failed to load dashboard data', type: 'general' });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const fetchCalendarEvents = useCallback(async () => {
    if (!calendarConnected) return;
    try {
      const eventsResponse = await calendarAPI.getEvents();
      setAllEvents(eventsResponse.events || []);
      setCurrentTime(new Date());
    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
    }
  }, [calendarConnected]);

  useEffect(() => {
    if (!calendarConnected) return;
    const refreshInterval = setInterval(fetchCalendarEvents, CALENDAR_REFRESH_INTERVAL);
    return () => clearInterval(refreshInterval);
  }, [calendarConnected, fetchCalendarEvents]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await calendarAPI.sync();
      await fetchCalendarEvents();
    } catch (err) {
      const isAuthError = err instanceof Error && (
        err.message.includes('401') ||
        err.message.includes('403') ||
        err.message.includes('expired')
      );
      setError({
        message: isAuthError
          ? 'Calendar connection expired. Please reconnect.'
          : 'Failed to sync calendar',
        type: isAuthError ? 'auth' : 'general'
      });
    } finally {
      setSyncing(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatTimeUntil = (startDate: Date, endDate?: Date) => {
    const now = currentTime;
    const eventStart = new Date(startDate);
    const eventEnd = endDate ? new Date(endDate) : null;
    const diff = eventStart.getTime() - now.getTime();

    if (diff < 0 && eventEnd && now < eventEnd) return 'now';
    if (diff < 0) return 'ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes <= 0) return 'starting';
    return `${minutes}m`;
  };

  const isSpotifyConnected = connectedProviders.includes('spotify');
  const isCalendarConnected = connectedProviders.includes('google_calendar') || calendarConnected;
  const isYouTubeConnected = connectedProviders.includes('youtube');

  const insightLinks: Pattern[] = [
    {
      id: 'music-soul',
      title: 'Your Musical Soul',
      description: isSpotifyConnected
        ? 'What your listening reveals about you'
        : 'Connect Spotify to discover your musical soul',
      icon: Globe,
      color: isSpotifyConnected ? 'text-green-500' : 'text-gray-500',
      hasData: isSpotifyConnected,
      actionLabel: isSpotifyConnected ? 'Explore' : 'Connect',
      actionPath: isSpotifyConnected ? '/insights/spotify' : '/get-started'
    },
    {
      id: 'time-patterns',
      title: 'Time Patterns',
      description: isCalendarConnected
        ? 'How you structure your days'
        : 'Connect Calendar to see your time patterns',
      icon: Globe,
      color: isCalendarConnected ? 'text-blue-500' : 'text-gray-500',
      hasData: isCalendarConnected,
      actionLabel: isCalendarConnected ? 'Explore' : 'Connect',
      actionPath: isCalendarConnected ? '/insights/calendar' : '/get-started'
    },
    {
      id: 'content-world',
      title: 'Content World',
      description: isYouTubeConnected
        ? 'Your YouTube universe and viewing patterns'
        : 'Connect YouTube to discover your content world',
      icon: Globe,
      color: isYouTubeConnected ? 'text-red-500' : 'text-gray-500',
      hasData: isYouTubeConnected,
      actionLabel: isYouTubeConnected ? 'Explore' : 'Connect',
      actionPath: isYouTubeConnected ? '/insights/youtube' : '/get-started'
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <PageLayout>
      {error && (
        <div
          className="mb-6 p-6 rounded-2xl flex items-center justify-between"
          style={{
            backgroundColor: error.type === 'auth'
              ? 'rgba(245, 158, 11, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
            border: error.type === 'auth'
              ? '1px solid rgba(245, 158, 11, 0.3)'
              : '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className={`w-5 h-5 ${error.type === 'auth' ? 'text-amber-500' : 'text-red-500'}`} />
            <span style={{ color: error.type === 'auth' ? '#d97706' : '#dc2626' }}>
              {error.message}
            </span>
          </div>
          {error.type === 'auth' && (
            <button
              onClick={() => navigate('/get-started')}
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <h1 className="heading-serif text-3xl mb-2">
          {getGreeting()}, {user?.firstName || 'there'}
        </h1>
        <p className="text-base" style={{ color: '#8A857D' }}>
          {todayEvents.length > 0
            ? `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today`
            : 'Your day awaits'
          }
          {connectedProviders.length > 0 && (
            <span style={{ color: '#a8a29e' }}>
              {' '}&bull;{' '}
              <span style={{ color: '#B8942E' }}>
                {connectedProviders.length} platform{connectedProviders.length !== 1 ? 's' : ''} connected
              </span>
            </span>
          )}
        </p>
      </motion.div>

      <div className="mb-8">
        <TodayInsights />
      </div>

      <div className="mb-8">
        <ProactiveInsightsPanel />
      </div>

      {goalSummary && (goalSummary.active > 0 || goalSummary.suggested > 0) && (
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <button
            onClick={() => navigate('/goals')}
            className="w-full text-left rounded-2xl p-6 transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: 'rgba(0,0,0,0.02)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: '#44403c' }} />
                <span className="text-sm font-medium" style={{ color: '#000000' }}>Goals</span>
                {goalSummary.suggested > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400">
                    {goalSummary.suggested}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: '#8A857D' }} />
            </div>
            <div className="flex items-center gap-6">
              {goalSummary.active > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm" style={{ color: '#8A857D' }}>{goalSummary.active} active</span>
                </div>
              )}
              {goalSummary.bestStreak > 0 && (
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-sm" style={{ color: '#8A857D' }}>{goalSummary.bestStreak}d best streak</span>
                </div>
              )}
              {goalSummary.completed > 0 && (
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm" style={{ color: '#8A857D' }}>{goalSummary.completed} completed</span>
                </div>
              )}
              {goalSummary.suggested > 0 && goalSummary.active === 0 && (
                <span className="text-sm" style={{ color: '#3b82f6' }}>
                  Your twin has {goalSummary.suggested} suggestion{goalSummary.suggested > 1 ? 's' : ''} for you
                </span>
              )}
            </div>
          </button>
        </motion.div>
      )}

      <NextEventCard
        nextEvent={nextEvent}
        isCalendarConnected={isCalendarConnected}
        syncing={syncing}
        onSync={handleSync}
        onNavigate={navigate}
        formatTimeUntil={formatTimeUntil}
      />

      <TwinInsightsGrid
        insightLinks={insightLinks}
        onNavigate={navigate}
      />
    </PageLayout>
  );
};

export default Dashboard;
