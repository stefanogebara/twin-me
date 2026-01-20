import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Music,
  Clock,
  CheckCircle2,
  ChevronRight,
  Plus,
  Sparkles,
  Target,
  RefreshCw,
  AlertCircle,
  Activity
} from 'lucide-react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { calendarAPI, spotifyAPI, whoopAPI, CalendarEvent } from '@/services/apiService';
import { TodayInsights } from '@/components/TodayInsights';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';

// Auto-refresh interval for calendar events (1 minute)
const CALENDAR_REFRESH_INTERVAL = 60 * 1000;

interface PlatformStatus {
  id: string;
  name: string;
  connected: boolean;
  expired?: boolean;
  icon: React.ElementType;
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
const PLATFORM_CONFIG: Record<string, { name: string; icon: React.ElementType; color: string }> = {
  spotify: { name: 'Spotify', icon: Music, color: 'text-green-500' },
  google_calendar: { name: 'Calendar', icon: Calendar, color: 'text-blue-500' },
  whoop: { name: 'Whoop', icon: Activity, color: 'text-cyan-500' },
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
        // In demo mode, show all MVP platforms as connected
        setCalendarConnected(true);
        setSpotifyConnected(true);
        setWhoopConnected(true);
        setLoading(false);
        return;
      }

      try {
        // Fetch platform statuses in parallel
        const [calendarStatus, spotifyStatus, whoopStatus] = await Promise.allSettled([
          calendarAPI.getStatus(),
          spotifyAPI.getStatus(),
          whoopAPI.getStatus()
        ]);

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
      console.log('[Dashboard] Auto-refreshing calendar events...');
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

  // MVP platforms only
  const mvpPlatformIds = ['google_calendar', 'spotify', 'whoop'];

  // Build dynamic platforms list from connected providers (filtered to MVP platforms only)
  const platforms: PlatformStatus[] = connectedProviders
    .filter(provider => mvpPlatformIds.includes(provider))
    .map(provider => {
      const config = PLATFORM_CONFIG[provider];
      if (!config) return null; // Only show platforms with config (MVP platforms)

      const status = platformStatusData[provider];
      const isExpired = status?.tokenExpired || status?.status === 'token_expired';

      return {
        id: provider,
        name: config.name,
        connected: true, // It's in connected providers, so it's connected
        expired: isExpired, // But may have expired token
        icon: config.icon,
        color: config.color
      };
    })
    .filter((p): p is PlatformStatus => p !== null);

  // Add MVP platforms if not connected (as suggested connections)
  mvpPlatformIds.forEach(provider => {
    if (!connectedProviders.includes(provider)) {
      const config = PLATFORM_CONFIG[provider];
      if (config) {
        platforms.push({
          id: provider,
          name: config.name,
          connected: false,
          icon: config.icon,
          color: config.color
        });
      }
    }
  });

  // Build insight links based on connected platforms
  // Use connectedProviders from usePlatformStatus hook for consistency with bottom section
  const isSpotifyConnected = connectedProviders.includes('spotify') || spotifyConnected;
  const isWhoopConnected = connectedProviders.includes('whoop') || whoopConnected;
  const isCalendarConnected = connectedProviders.includes('google_calendar') || calendarConnected;

  const insightLinks: Pattern[] = [
    {
      id: 'music-soul',
      title: 'Your Musical Soul',
      description: isSpotifyConnected
        ? 'What your listening reveals about you'
        : 'Connect Spotify to discover your musical soul',
      icon: Music,
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
      icon: Activity,
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
      icon: Calendar,
      color: isCalendarConnected ? 'text-blue-500' : 'text-gray-500',
      hasData: isCalendarConnected,
      actionLabel: isCalendarConnected ? 'Explore' : 'Connect',
      actionPath: isCalendarConnected ? '/insights/calendar' : '/get-started'
    }
  ];

  // Skeleton loader component for perceived performance
  const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        ...style
      }}
    />
  );

  if (loading) {
    return (
      <PageLayout>
        {/* Skeleton: Greeting Header */}
        <div className="mb-8">
          <SkeletonPulse className="h-9 w-64 mb-2" />
          <SkeletonPulse className="h-5 w-32" />
        </div>

        {/* Skeleton: Today's Insights */}
        <div className="mb-8">
          <SkeletonPulse className="h-32 w-full rounded-xl" />
        </div>

        {/* Skeleton: Next Event Card */}
        <GlassPanel className="mb-8">
          <SkeletonPulse className="h-3 w-full mb-4" style={{ borderRadius: '2px' }} />
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <SkeletonPulse className="h-4 w-36 mb-3" />
              <SkeletonPulse className="h-7 w-48 mb-3" />
              <div className="flex items-center gap-4">
                <SkeletonPulse className="h-5 w-20" />
                <SkeletonPulse className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <SkeletonPulse className="w-12 h-12 rounded-xl" />
          </div>
          <SkeletonPulse className="h-12 w-full mt-6 rounded-xl" />
        </GlassPanel>

        {/* Skeleton: Twin Insights */}
        <div className="mb-8">
          <SkeletonPulse className="h-5 w-28 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <GlassPanel key={i}>
                <div className="flex items-start gap-3">
                  <SkeletonPulse className="w-10 h-10 rounded-lg flex-shrink-0" />
                  <div className="flex-1">
                    <SkeletonPulse className="h-4 w-24 mb-2" />
                    <SkeletonPulse className="h-3 w-full mb-2" />
                    <SkeletonPulse className="h-6 w-20 rounded-full" />
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>

        {/* Skeleton: Connected Platforms */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <SkeletonPulse className="h-5 w-40" />
            <SkeletonPulse className="h-5 w-16" />
          </div>
          <div className="flex gap-3 flex-wrap">
            {[1, 2, 3].map((i) => (
              <SkeletonPulse key={i} className="h-12 w-28 rounded-xl" />
            ))}
          </div>
        </div>
      </PageLayout>
    );
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

      <div className="mb-8">
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
      </div>

      {/* Today's Insights Section */}
      <div className="mb-8">
        <TodayInsights />
      </div>


      {nextEvent ? (
        <GlassPanel className="mb-8 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.1)'
            }}
          />

          <div className="pt-4">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
                  >
                    Next Important Event
                  </span>
                  {isCalendarConnected && (
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="Sync calendar"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`}
                        style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
                      />
                    </button>
                  )}
                </div>
                <h2
                  className="text-2xl mb-2"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                  }}
                >
                  {nextEvent.title}
                </h2>
                <div className="flex items-center gap-4">
                  <span
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
                  >
                    <Clock className="w-4 h-4" />
                    {formatTimeUntil(nextEvent.startTime, nextEvent.endTime) === 'now' ? 'happening now' : `in ${formatTimeUntil(nextEvent.startTime, nextEvent.endTime)}`}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
                    }}
                  >
                    {nextEvent.type}
                  </span>
                </div>
              </div>

              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                }}
              >
                <Target className="w-6 h-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }} />
              </div>
            </div>

            <button
              onClick={() => navigate('/insights/calendar')}
              className="w-full glass-button py-4 flex items-center justify-center gap-3"
            >
              <Sparkles className="w-5 h-5" />
              <span
                className="text-base"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}
              >
                View Time Patterns
              </span>
            </button>
          </div>
        </GlassPanel>
      ) : (
        <GlassPanel className="mb-8 text-center py-12">
          <Calendar
            className="w-12 h-12 mx-auto mb-4 opacity-30"
            style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
          />
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 500,
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
          >
            No upcoming events
          </h2>
          <p
            className="text-sm mb-6"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
          >
            {isCalendarConnected
              ? 'Your calendar is empty. Add events to start preparing for them.'
              : 'Connect your calendar to see your events here'
            }
          </p>
          {!isCalendarConnected && (
            <button
              onClick={() => navigate('/get-started')}
              className="px-6 py-3 rounded-xl inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}
            >
              <Plus className="w-4 h-4" />
              Connect Calendar
            </button>
          )}
        </GlassPanel>
      )}

      {/* Twin Insights - Links to platform insight pages */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-1 h-5 rounded-full"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
                : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
            }}
          />
          <h3
            className="text-sm uppercase tracking-wider"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            Twin Insights
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insightLinks.map((insight) => {
            const Icon = insight.icon;
            return (
              <GlassPanel
                key={insight.id}
                hover
                className="cursor-pointer"
                onClick={() => navigate(insight.actionPath!)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: insight.hasData
                        ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)')
                        : (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                    }}
                  >
                    <Icon className={`w-5 h-5 ${insight.color}`} />
                  </div>
                  <div className="flex-1">
                    <h4
                      className="text-sm mb-1"
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 500,
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                      }}
                    >
                      {insight.title}
                    </h4>
                    <p
                      className="text-xs mb-2"
                      style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
                    >
                      {insight.description}
                    </p>
                    <span
                      className="text-xs px-3 py-1 rounded-full inline-block"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                        color: theme === 'dark' ? '#C1C0B6' : '#44403c'
                      }}
                    >
                      {insight.actionLabel} →
                    </span>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      </div>

      {/* DASH 2.5: Visual hierarchy improvement */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-5 rounded-full"
              style={{
                background: theme === 'dark'
                  ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
                  : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
              }}
            />
            <h3
              className="text-sm uppercase tracking-wider"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
            >
              Connected Platforms
            </h3>
          </div>
          <button
            onClick={() => navigate('/get-started')}
            className="text-sm flex items-center gap-1 transition-colors hover:opacity-80"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
          >
            Manage
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            return (
              <button
                key={platform.id}
                onClick={() => navigate('/get-started')}
                className="px-4 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: theme === 'dark'
                    ? platform.connected ? 'rgba(193, 192, 182, 0.15)' : 'rgba(193, 192, 182, 0.05)'
                    : platform.connected ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                  border: platform.expired
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : theme === 'dark'
                    ? '1px solid rgba(193, 192, 182, 0.1)'
                    : '1px solid rgba(0, 0, 0, 0.06)'
                }}
              >
                <Icon className={`w-4 h-4 ${platform.color}`} />
                <span
                  className="text-sm"
                  style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                >
                  {platform.name}
                </span>
                {platform.connected && !platform.expired ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : platform.expired ? (
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <Plus className="w-4 h-4 opacity-50" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
