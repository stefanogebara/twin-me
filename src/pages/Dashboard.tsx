import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  ChevronRight,
  Plus,
  Sparkles,
  Target,
  RefreshCw,
  AlertCircle,
  Globe,
  Link2,
  Award
} from 'lucide-react';
import { PlatformLogo, getPlatformLogo } from '@/components/PlatformLogos';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { calendarAPI, spotifyAPI, whoopAPI, CalendarEvent } from '@/services/apiService';
import { TodayInsights } from '@/components/TodayInsights';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { DEMO_CALENDAR_DATA } from '@/services/demoDataService';
import { Clay3DIcon } from '@/components/Clay3DIcon';

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
  discord: { name: 'Discord', color: 'text-indigo-500', brandColor: '#5865F2' },
  reddit: { name: 'Reddit', color: 'text-orange-500', brandColor: '#FF4500' },
  github: { name: 'GitHub', color: 'text-gray-500', brandColor: '#6e6e6e' },
  gmail: { name: 'Gmail', color: 'text-red-400', brandColor: '#EA4335' },
  outlook: { name: 'Outlook', color: 'text-blue-400', brandColor: '#0078D4' },
  linkedin: { name: 'LinkedIn', color: 'text-blue-600', brandColor: '#0A66C2' },
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

  // Build dynamic platforms list from all connected providers
  // Merge connectedProviders (from usePlatformStatus hook) with individually-checked states
  // This ensures platforms show even if one data source is unavailable
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
  // Use connectedProviders from usePlatformStatus hook for consistency with bottom section
  const isSpotifyConnected = connectedProviders.includes('spotify') || spotifyConnected;
  const isWhoopConnected = connectedProviders.includes('whoop') || whoopConnected;
  const isCalendarConnected = connectedProviders.includes('google_calendar') || calendarConnected;
  const isYouTubeConnected = connectedProviders.includes('youtube');
  const isTwitchConnected = connectedProviders.includes('twitch');
  const isDiscordConnected = connectedProviders.includes('discord');

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
    {
      id: 'digital-life',
      title: 'Digital Life',
      description: isDiscordConnected
        ? 'What your digital communities reveal about you'
        : 'Connect Discord to explore your digital life',
      icon: Globe,
      color: isDiscordConnected ? 'text-indigo-500' : 'text-gray-500',
      hasData: isDiscordConnected,
      actionLabel: isDiscordConnected ? 'Explore' : 'Connect',
      actionPath: isDiscordConnected ? '/insights/web' : '/get-started'
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


      {nextEvent ? (
        <GlassPanel className="mb-8 relative overflow-hidden" variant="card">
          <div
            className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-green-500"
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
                    {(() => {
                      const t = formatTimeUntil(nextEvent.startTime, nextEvent.endTime);
                      if (t === 'now') return 'happening now';
                      if (t === 'starting') return 'starting soon';
                      if (t === 'ended') return 'just ended';
                      return `in ${t}`;
                    })()}
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

            <motion.button
              onClick={() => navigate('/insights/calendar')}
              className="w-full py-4 flex items-center justify-center gap-3 rounded-xl glow-accent"
              style={{
                background: `linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))`,
                color: '#1a1a17',
                fontWeight: 600,
                boxShadow: '0 2px 12px var(--accent-vibrant-glow)',
              }}
              whileHover={{ scale: 1.015, boxShadow: '0 4px 20px var(--accent-vibrant-glow)' }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.2 }}
            >
              <Sparkles className="w-5 h-5" />
              <span
                className="text-base"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}
              >
                View Time Patterns
              </span>
            </motion.button>
          </div>
        </GlassPanel>
      ) : (
        <div
          className="mb-8 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)'
          }}
        >
          <Calendar
            className="w-5 h-5 flex-shrink-0 opacity-40"
            style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
          />
          <span
            className="text-sm flex-1"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
          >
            {isCalendarConnected ? 'No upcoming events' : 'Connect your calendar to see events'}
          </span>
          <button
            onClick={() => navigate(isCalendarConnected ? '/insights/calendar' : '/get-started')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 flex-shrink-0"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.06)',
              color: theme === 'dark' ? '#C1C0B6' : '#44403c'
            }}
          >
            {isCalendarConnected ? 'View Calendar' : 'Connect Calendar'}
          </button>
        </div>
      )}

      {/* Twin Insights - Links to platform insight pages */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-1 h-5 rounded-full"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(to bottom, var(--accent-vibrant), rgba(193, 192, 182, 0.2))'
                : 'linear-gradient(to bottom, var(--accent-vibrant), rgba(0, 0, 0, 0.1))'
            }}
          />
          <h3
            className="text-sm uppercase tracking-wider"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            Twin Insights
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {insightLinks.map((insight, idx) => {
            const Icon = insight.icon;
            return (
              <GlassPanel
                key={insight.id}
                hover
                className="cursor-pointer"
                delay={0.05 + idx * 0.06}
                onClick={() => navigate(insight.actionPath!)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}
                    style={{
                      backgroundColor: insight.hasData
                        ? undefined
                        : (theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'),
                      ...(insight.hasData && insight.id === 'music-soul' ? { backgroundColor: theme === 'dark' ? 'rgba(29, 185, 84, 0.15)' : 'rgba(29, 185, 84, 0.1)' } : {}),
                      ...(insight.hasData && insight.id === 'body-stories' ? { backgroundColor: theme === 'dark' ? 'rgba(0, 165, 224, 0.15)' : 'rgba(0, 165, 224, 0.1)' } : {}),
                      ...(insight.hasData && insight.id === 'time-patterns' ? { backgroundColor: theme === 'dark' ? 'rgba(66, 133, 244, 0.15)' : 'rgba(66, 133, 244, 0.1)' } : {}),
                      ...(insight.hasData && insight.id === 'content-world' ? { backgroundColor: theme === 'dark' ? 'rgba(255, 0, 0, 0.12)' : 'rgba(255, 0, 0, 0.08)' } : {}),
                      ...(insight.hasData && insight.id === 'gaming-world' ? { backgroundColor: theme === 'dark' ? 'rgba(145, 70, 255, 0.15)' : 'rgba(145, 70, 255, 0.1)' } : {}),
                      ...(insight.hasData && insight.id === 'digital-life' ? { backgroundColor: theme === 'dark' ? 'rgba(88, 101, 242, 0.15)' : 'rgba(88, 101, 242, 0.1)' } : {}),
                    }}
                  >
                    {(() => {
                      const clay3dMap: Record<string, string> = {
                        'music-soul': 'headphones',
                        'body-stories': 'lightning',
                        'time-patterns': 'compass',
                        'content-world': 'star',
                        'gaming-world': 'game-controller',
                        'digital-life': 'globe',
                      };
                      const clayIcon = clay3dMap[insight.id];
                      return clayIcon ? (
                        <Clay3DIcon name={clayIcon} size={24} className={insight.hasData ? '' : 'opacity-50 grayscale'} />
                      ) : (
                        <Icon className={`w-5 h-5 ${insight.color}`} />
                      );
                    })()}
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
                      className="text-xs px-3 py-1 rounded-full inline-block font-medium"
                      style={{
                        backgroundColor: insight.hasData
                          ? (theme === 'dark' ? 'rgba(224, 184, 96, 0.15)' : 'rgba(212, 168, 83, 0.12)')
                          : (theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.06)'),
                        color: insight.hasData
                          ? (theme === 'dark' ? '#E0B860' : '#B8942E')
                          : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c')
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

      {/* Your Patterns - data-driven patterns section */}
      {platforms.length > 0 && (
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
              Your Patterns
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isCalendarConnected && (
              <GlassPanel variant="shimmer" hover className="cursor-pointer" onClick={() => navigate('/insights/calendar')}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)'
                  }}>
                    <Clock className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <h4 className="text-sm mb-1" style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>Optimal Prep Time</h4>
                    <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
                      {todayEvents.length > 0 ? `${todayEvents.length} events shaping your day` : 'Your schedule patterns'}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            )}
            {isSpotifyConnected && (
              <GlassPanel variant="shimmer" hover className="cursor-pointer" onClick={() => navigate('/insights/spotify')}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)'
                  }}>
                    <Clay3DIcon name="headphones" size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm mb-1" style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>Focus Music</h4>
                    <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
                      Your listening shapes your flow
                    </p>
                  </div>
                </div>
              </GlassPanel>
            )}
            {platforms.length >= 2 && (
              <GlassPanel variant="shimmer" hover className="cursor-pointer" onClick={() => navigate('/soul-signature')}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)'
                  }}>
                    <Award className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-sm mb-1" style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}>{platforms.length} Platforms Connected</h4>
                    <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
                      Building your soul signature
                    </p>
                  </div>
                </div>
              </GlassPanel>
            )}
          </div>
        </div>
      )}

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

        {platforms.length > 0 ? (
          <div className="flex gap-3 flex-wrap">
            {platforms.map((platform) => {
              const config = PLATFORM_CONFIG[platform.id];
              const brandColor = config?.brandColor || (theme === 'dark' ? '#C1C0B6' : '#0c0a09');
              return (
                <button
                  key={platform.id}
                  onClick={() => navigate('/get-started')}
                  className="px-4 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark'
                      ? platform.connected ? 'rgba(193, 192, 182, 0.1)' : 'rgba(193, 192, 182, 0.05)'
                      : platform.connected ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    borderLeft: platform.connected && !platform.expired
                      ? `3px solid ${brandColor}`
                      : undefined,
                    border: platform.expired
                      ? '1px solid rgba(245, 158, 11, 0.4)'
                      : !platform.connected
                      ? (theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)')
                      : undefined,
                    borderTop: platform.connected && !platform.expired
                      ? (theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)')
                      : undefined,
                    borderRight: platform.connected && !platform.expired
                      ? (theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)')
                      : undefined,
                    borderBottom: platform.connected && !platform.expired
                      ? (theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)')
                      : undefined,
                  }}
                >
                  <PlatformLogo platform={platform.id} className="w-4 h-4" />
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
        ) : (
          <GlassPanel className="text-center py-8">
            <Link2
              className="w-10 h-10 mx-auto mb-3 opacity-30"
              style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
            />
            <p
              className="text-sm mb-4"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
            >
              Connect your first platform to start building your digital twin
            </p>
            <button
              onClick={() => navigate('/get-started')}
              className="btn btn-accent rounded-xl inline-flex items-center gap-2 text-sm transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              Connect Platforms
            </button>
          </GlassPanel>
        )}
      </div>
    </PageLayout>
  );
};

export default Dashboard;
