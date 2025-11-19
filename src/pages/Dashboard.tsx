import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Music,
  Play,
  Clock,
  CheckCircle2,
  ChevronRight,
  Plus,
  Sparkles,
  Target,
  Award,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { calendarAPI, spotifyAPI, CalendarEvent } from '@/services/apiService';

interface PlatformStatus {
  id: string;
  name: string;
  connected: boolean;
  icon: React.ElementType;
  color: string;
}

interface Pattern {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [ritualStreak, setRitualStreak] = useState(0);
  const [focusScore, setFocusScore] = useState(0);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch platform statuses in parallel
        const [calendarStatus, spotifyStatus] = await Promise.allSettled([
          calendarAPI.getStatus(),
          spotifyAPI.getStatus()
        ]);

        // Update calendar connection status
        if (calendarStatus.status === 'fulfilled') {
          setCalendarConnected(calendarStatus.value.connected);
        }

        // Update Spotify connection status
        if (spotifyStatus.status === 'fulfilled') {
          setSpotifyConnected(spotifyStatus.value.connected);
        }

        // If calendar is connected, fetch events
        if (calendarStatus.status === 'fulfilled' && calendarStatus.value.connected) {
          try {
            const eventsResponse = await calendarAPI.getEvents();
            const events = eventsResponse.events || [];

            // Filter today's events
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);

            const todaysEvents = events.filter((event: CalendarEvent) => {
              const eventStart = new Date(event.startTime);
              return eventStart >= todayStart && eventStart < todayEnd;
            });

            setTodayEvents(todaysEvents);

            // Find next upcoming event
            const upcomingEvents = events
              .filter((event: CalendarEvent) => new Date(event.startTime) > now)
              .sort((a: CalendarEvent, b: CalendarEvent) =>
                new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              );

            if (upcomingEvents.length > 0) {
              setNextEvent(upcomingEvents[0]);
            } else {
              setNextEvent(null);
            }
          } catch (err) {
            console.error('Failed to fetch calendar events:', err);
            if (err instanceof Error && !err.message.includes('not connected')) {
              setError('Failed to load calendar events');
            }
          }
        }

        // Mock data for ritual streak and focus score
        setRitualStreak(5);
        setFocusScore(82);

      } catch (err) {
        console.error('Dashboard loading error:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await calendarAPI.sync();
      const eventsResponse = await calendarAPI.getEvents();
      const events = eventsResponse.events || [];

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const todaysEvents = events.filter((event: CalendarEvent) => {
        const eventStart = new Date(event.startTime);
        return eventStart >= todayStart && eventStart < todayEnd;
      });

      setTodayEvents(todaysEvents);

      const upcomingEvents = events
        .filter((event: CalendarEvent) => new Date(event.startTime) > now)
        .sort((a: CalendarEvent, b: CalendarEvent) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

      if (upcomingEvents.length > 0) {
        setNextEvent(upcomingEvents[0]);
      } else {
        setNextEvent(null);
      }
    } catch (err) {
      console.error('Sync error:', err);
      setError('Failed to sync calendar');
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

  const formatTimeUntil = (date: Date) => {
    const now = new Date();
    const eventDate = new Date(date);
    const diff = eventDate.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const platforms: PlatformStatus[] = [
    { id: 'calendar', name: 'Calendar', connected: calendarConnected, icon: Calendar, color: 'text-blue-500' },
    { id: 'spotify', name: 'Spotify', connected: spotifyConnected, icon: Music, color: 'text-green-500' },
  ];

  const patterns: Pattern[] = [
    {
      id: 'optimal-time',
      title: 'Optimal Prep Time',
      description: '15 min rituals work best for you',
      icon: Clock,
      color: 'text-purple-500'
    },
    {
      id: 'focus-music',
      title: 'Focus Music',
      description: 'Lo-fi beats boost your concentration',
      icon: Music,
      color: 'text-green-500'
    },
    {
      id: 'streak',
      title: `${ritualStreak} Day Streak`,
      description: 'Keep it going!',
      icon: Award,
      color: 'text-amber-500'
    }
  ];

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}
      >
        <div className="text-center">
          <Sparkles
            className="w-8 h-8 animate-pulse mx-auto mb-4"
            style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
          />
          <p style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Loading your day...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageLayout>
      {error && (
        <div
          className="mb-4 p-4 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span style={{ color: theme === 'dark' ? '#fca5a5' : '#dc2626' }}>{error}</span>
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
          {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} today • Focus Score: {focusScore}%
        </p>
      </div>

      {nextEvent ? (
        <GlassPanel className="mb-8 relative overflow-hidden">
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
                  {calendarConnected && (
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
                    in {formatTimeUntil(nextEvent.startTime)}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)',
                      color: '#8b5cf6'
                    }}
                  >
                    {nextEvent.type}
                  </span>
                </div>
              </div>

              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)'
                }}
              >
                <Target className="w-6 h-6 text-purple-500" />
              </div>
            </div>

            <button
              onClick={() => navigate('/ritual/start')}
              className="w-full glass-button py-4 flex items-center justify-center gap-3"
            >
              <Play className="w-5 h-5" />
              <span
                className="text-base"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}
              >
                Start Preparation Ritual
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
            {calendarConnected
              ? 'Your calendar is empty. Add events to start preparing for them.'
              : 'Connect your calendar to see your events here'
            }
          </p>
          {!calendarConnected && (
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

      <div className="mb-8">
        <h3
          className="text-sm uppercase tracking-wider mb-4"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
        >
          Your Patterns
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {patterns.map((pattern) => {
            const Icon = pattern.icon;
            return (
              <GlassPanel key={pattern.id} hover className="cursor-pointer">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                    }}
                  >
                    <Icon className={`w-5 h-5 ${pattern.color}`} />
                  </div>
                  <div>
                    <h4
                      className="text-sm mb-1"
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 500,
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                      }}
                    >
                      {pattern.title}
                    </h4>
                    <p
                      className="text-xs"
                      style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
                    >
                      {pattern.description}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-sm uppercase tracking-wider"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
          >
            Connected Platforms
          </h3>
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
                  border: theme === 'dark'
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
                {platform.connected ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
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
