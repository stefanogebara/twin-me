import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Globe, Target, Flame, Trophy, ChevronRight } from 'lucide-react';
import { goalsAPI, GoalSummary } from '@/services/api/goalsAPI';
import { PageLayout } from '@/components/layout/PageLayout';
import { calendarAPI, spotifyAPI, whoopAPI, CalendarEvent } from '@/services/apiService';
import { TodayInsights } from '@/components/TodayInsights';
import { ProactiveInsightsPanel } from '@/components/ProactiveInsightsPanel';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { DEMO_CALENDAR_DATA } from '@/services/demoDataService';
import { DashboardSkeleton } from './components/dashboard/DashboardSkeleton';
import { NextEventCard } from './components/dashboard/NextEventCard';
import { TwinInsightsGrid } from './components/dashboard/TwinInsightsGrid';
import { YourPatternsSection } from './components/dashboard/YourPatternsSection';
import { ConnectedPlatformsSection } from './components/dashboard/ConnectedPlatformsSection';

// Auto-refresh interval for calendar events (1 minute)
const CALENDAR_REFRESH_INTERVAL = 60 * 1000;

interface PlatformStatus {
  id: string;
  name: string;
  connected: boolean;
  expired?: boolean;
  color: string;
}

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

// DASH 2.4: Whoop data interface for dashboard display
interface WhoopData {
  recovery: number | null;
  hrv: number | null;
  sleepHours: number | null;
  strain: number | null;
  recoveryLabel: string;
}

// Platform configuration for icons and colors (MVP platforms only)
const PLATFORM_CONFIG: Record<string, { name: string; color: string; brandColor: string }> = {
  spotify: { name: 'Spotify', color: 'text-green-500', brandColor: '#1DB954' },
  google_calendar: { name: 'Calendar', color: 'text-blue-500', brandColor: '#4285F4' },
  whoop: { name: 'Whoop', color: 'text-cyan-500', brandColor: '#00A5E0' },
  youtube: { name: 'YouTube', color: 'text-red-500', brandColor: '#FF0000' },
  twitch: { name: 'Twitch', color: 'text-purple-500', brandColor: '#9146FF' },
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]); // Store all events from API
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [whoopConnected, setWhoopConnected] = useState(false);
  // DASH 2.4: Whoop data state
  const [whoopData, setWhoopData] = useState<WhoopData | null>(null);
  const [goalSummary, setGoalSummary] = useState<GoalSummary | null>(null);
  const [error, setError] = useState<{ message: string; type?: 'auth' | 'general' } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date()); // For live updates

  // Use platform status hook for dynamic platform display
  const { data: platformStatusData, connectedProviders } = usePlatformStatus(user?.id);

  // Update current time every 30 seconds for live event filtering
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30 * 1000); // Every 30 seconds

    return () => clearInterval(timer);
  }, []);

  // Compute today's events and next event based on current time (live filtering)
  const { todayEvents, nextEvent } = useMemo(() => {
    const now = currentTime;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Filter today's events
    const todaysEvents = allEvents.filter((event: CalendarEvent) => {
      const eventStart = new Date(event.startTime);
      return eventStart >= todayStart && eventStart < todayEnd;
    });

    // Find next upcoming event (events that haven't started yet OR are currently happening)
    const upcomingEvents = allEvents
      .filter((event: CalendarEvent) => {
        const eventEnd = new Date(event.endTime);
        // Include event if it hasn't ended yet
        return eventEnd > now;
      })
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

      // Check for demo mode
      const isDemoMode = localStorage.getItem('demo_mode') === 'true';

      if (isDemoMode) {
        // In demo mode, show all MVP platforms as connected with sample data
        setCalendarConnected(true);
        setSpotifyConnected(true);
        setWhoopConnected(true);

        // Populate demo calendar events with real Date objects
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
        // Add tomorrow's upcoming events
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        DEMO_CALENDAR_DATA.upcomingEvents.forEach((evt) => {
          const [h, m] = (evt.time || '10:00').split(':').map(Number);
          const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), h, m);
          const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration
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

        // Set demo Whoop data
        setWhoopData({
          recovery: 72,
          hrv: 58,
          sleepHours: 7.2,
          strain: 11.4,
          recoveryLabel: 'Green'
        });

        setLoading(false);
        return;
      }

      try {
        // Fetch platform statuses + goal summary in parallel
        const [calendarStatus, spotifyStatus, whoopStatus, goalResult] = await Promise.allSettled([
          calendarAPI.getStatus(),
          spotifyAPI.getStatus(),
          whoopAPI.getStatus(),
          goalsAPI.getSummary()
        ]);

        // Update goal summary
        if (goalResult.status === 'fulfilled') {
          setGoalSummary(goalResult.value);
        }

        // Update calendar connection status
        if (calendarStatus.status === 'fulfilled') {
          setCalendarConnected(calendarStatus.value.connected);
        }

        // Update Spotify connection status
        if (spotifyStatus.status === 'fulfilled') {
          setSpotifyConnected(spotifyStatus.value.connected);
        }

        // Update Whoop connection status and fetch data if connected
        if (whoopStatus.status === 'fulfilled') {
          const isWhoopConnected = whoopStatus.value.connected && !whoopStatus.value.tokenExpired;
          setWhoopConnected(isWhoopConnected);

          // DASH 2.4: Fetch Whoop data when connected
          if (isWhoopConnected) {
            try {
              const whoopState = await whoopAPI.getCurrentState();
              setWhoopData({
                recovery: whoopState.recovery?.score ?? null,
                hrv: whoopState.recovery?.components?.hrv ?? null,
                sleepHours: whoopState.sleep?.hours ?? null,
                strain: whoopState.strain?.score ?? null,
                recoveryLabel: whoopState.recovery?.label || 'Unknown'
              });
            } catch (err) {
              console.error('Failed to fetch Whoop data:', err);
              // Don't set error for Whoop - it's optional
            }
          }
        }

        // If calendar is connected, fetch events
        if (calendarStatus.status === 'fulfilled' && calendarStatus.value.connected) {
          // Check if token is expired before attempting to fetch
          if (calendarStatus.value.tokenExpired) {
            setError({
              message: 'Calendar connection expired. Please reconnect to see your events.',
              type: 'auth'
            });
          } else {
            try {
              const eventsResponse = await calendarAPI.getEvents();
              const events = eventsResponse.events || [];
              // Store all events - filtering is done in useMemo with live time updates
              setAllEvents(events);
            } catch (err: unknown) {
              console.error('Failed to fetch calendar events:', err);
              // Check if error is authentication related (401/403)
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

  // Function to fetch calendar events (used by both initial load and refresh)
  const fetchCalendarEvents = useCallback(async () => {
    if (!calendarConnected) return;

    try {
      const eventsResponse = await calendarAPI.getEvents();
      const events = eventsResponse.events || [];
      setAllEvents(events);
      setCurrentTime(new Date()); // Update time to trigger re-filter
    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
    }
  }, [calendarConnected]);

  // Auto-refresh calendar events every minute
  useEffect(() => {
    if (!calendarConnected) return;

    const refreshInterval = setInterval(() => {
      fetchCalendarEvents();
    }, CALENDAR_REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [calendarConnected, fetchCalendarEvents]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await calendarAPI.sync();
      await fetchCalendarEvents();
    } catch (err) {
      console.error('Sync error:', err);
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
    const now = currentTime; // Use live time
    const eventStart = new Date(startDate);
    const eventEnd = endDate ? new Date(endDate) : null;
    const diff = eventStart.getTime() - now.getTime();

    // Event is currently happening
    if (diff < 0 && eventEnd && now < eventEnd) {
      return 'now';
    }

    // Event has passed (shouldn't show, but handle gracefully)
    if (diff < 0) {
      return 'ended';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes <= 0) {
      return 'starting';
    }
    return `${minutes}m`;
  };

  // Build dynamic platforms list from all connected providers
  const allConnectedIds = new Set<string>(connectedProviders);
  if (calendarConnected) allConnectedIds.add('google_calendar');
  if (spotifyConnected) allConnectedIds.add('spotify');
  if (whoopConnected) allConnectedIds.add('whoop');

  const platforms: PlatformStatus[] = Array.from(allConnectedIds)
    .map(provider => {
      const config = PLATFORM_CONFIG[provider];
      if (!config) return null;

      const status = platformStatusData[provider];
      const isExpired = status?.tokenExpired || status?.status === 'token_expired';

      return {
        id: provider,
        name: config.name,
        connected: true,
        expired: isExpired,
        color: config.color
      };
    })
    .filter((p): p is PlatformStatus => p !== null);

  // Build insight links based on connected platforms
  const isSpotifyConnected = connectedProviders.includes('spotify') || spotifyConnected;
  const isWhoopConnected = connectedProviders.includes('whoop') || whoopConnected;
  const isCalendarConnected = connectedProviders.includes('google_calendar') || calendarConnected;
  const isYouTubeConnected = connectedProviders.includes('youtube');
  const isTwitchConnected = connectedProviders.includes('twitch');

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
      id: 'body-stories',
      title: 'Body Stories',
      description: isWhoopConnected
        ? 'What your body tells you'
        : 'Connect Whoop to hear your body stories',
      icon: Globe,
      color: isWhoopConnected ? 'text-cyan-500' : 'text-gray-500',
      hasData: isWhoopConnected,
      actionLabel: isWhoopConnected ? 'Explore' : 'Connect',
      actionPath: isWhoopConnected ? '/insights/whoop' : '/get-started'
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
    {
      id: 'gaming-world',
      title: 'Gaming World',
      description: isTwitchConnected
        ? 'Your Twitch streams and gaming identity'
        : 'Connect Twitch to reveal your gaming world',
      icon: Globe,
      color: isTwitchConnected ? 'text-purple-500' : 'text-gray-500',
      hasData: isTwitchConnected,
      actionLabel: isTwitchConnected ? 'Explore' : 'Connect',
      actionPath: isTwitchConnected ? '/insights/twitch' : '/get-started'
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <PageLayout>
      {error && (
        <div
          className="mb-4 p-4 rounded-xl flex items-center justify-between"
          style={{
            backgroundColor: error.type === 'auth'
              ? (theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.1)')
              : (theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
            border: error.type === 'auth'
              ? '1px solid rgba(245, 158, 11, 0.3)'
              : '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className={`w-5 h-5 ${error.type === 'auth' ? 'text-amber-500' : 'text-red-500'}`} />
            <span style={{ color: error.type === 'auth'
              ? (theme === 'dark' ? '#fcd34d' : '#d97706')
              : (theme === 'dark' ? '#fca5a5' : '#dc2626')
            }}>
              {error.message}
            </span>
          </div>
          {error.type === 'auth' && (
            <button
              onClick={() => navigate('/get-started')}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                color: theme === 'dark' ? '#fcd34d' : '#d97706'
              }}
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
        <h1
          className="text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}
        >
          {getGreeting()}, {user?.firstName || 'there'}
        </h1>
        <p
          className="text-base"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
        >
          {todayEvents.length > 0
            ? `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today`
            : 'Your day awaits'
          }
        </p>
      </motion.div>

      {/* Today's Insights Section */}
      <div className="mb-8">
        <TodayInsights />
      </div>

      {/* Proactive Insights - What the twin has noticed */}
      <div className="mb-8">
        <ProactiveInsightsPanel />
      </div>

      {/* Goal Tracking Summary Widget */}
      {goalSummary && (goalSummary.active > 0 || goalSummary.suggested > 0) && (
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <button
            onClick={() => navigate('/goals')}
            className="w-full text-left rounded-xl p-5 transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }} />
                <span className="text-sm font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                  Goals
                </span>
                {goalSummary.suggested > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400">
                    {goalSummary.suggested}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193,192,182,0.5)' : '#a8a29e' }} />
            </div>
            <div className="flex items-center gap-6">
              {goalSummary.active > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193,192,182,0.7)' : '#57534e' }}>
                    {goalSummary.active} active
                  </span>
                </div>
              )}
              {goalSummary.bestStreak > 0 && (
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193,192,182,0.7)' : '#57534e' }}>
                    {goalSummary.bestStreak}d best streak
                  </span>
                </div>
              )}
              {goalSummary.completed > 0 && (
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193,192,182,0.7)' : '#57534e' }}>
                    {goalSummary.completed} completed
                  </span>
                </div>
              )}
              {goalSummary.suggested > 0 && goalSummary.active === 0 && (
                <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(147,197,253,0.8)' : '#3b82f6' }}>
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

      <YourPatternsSection
        platforms={platforms}
        isCalendarConnected={isCalendarConnected}
        isSpotifyConnected={isSpotifyConnected}
        todayEventsCount={todayEvents.length}
        onNavigate={navigate}
      />

      <ConnectedPlatformsSection
        platforms={platforms}
        onNavigate={navigate}
      />
    </PageLayout>
  );
};

export default Dashboard;
