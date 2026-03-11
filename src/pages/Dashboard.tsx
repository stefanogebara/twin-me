import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Target, Flame, Trophy, ChevronRight, Globe, BookOpen, Circle, ArrowUp, Sparkles, Eye, Moon, Activity } from 'lucide-react';
import { goalsAPI, GoalSummary } from '@/services/api/goalsAPI';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { calendarAPI, CalendarEvent } from '@/services/apiService';
import { authFetch } from '@/services/api/apiBase';
import { TodayInsights } from '@/components/TodayInsights';
import { ProactiveInsightsPanel } from '@/components/ProactiveInsightsPanel';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { DEMO_CALENDAR_DATA } from '@/services/demoDataService';
import { NextEventCard } from './components/dashboard/NextEventCard';
import { TwinInsightsGrid } from './components/dashboard/TwinInsightsGrid';
import { TwinReadinessScore } from '@/components/twin/TwinReadinessScore';
import { DailyCheckin } from '@/components/twin/DailyCheckin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { shouldShowInterviewCTA } from '@/utils/shouldShowInterviewCTA';

const QUICK_CHIPS = [
  { label: 'How am I doing?', icon: Sparkles },
  { label: 'What should I focus on?', icon: Eye },
  { label: 'Tell me something new', icon: Moon },
  { label: 'My personality insights', icon: Activity },
] as const;

// Auto-refresh interval for calendar events (1 minute)
const CALENDAR_REFRESH_INTERVAL = 60 * 1000;

interface TwinReadiness {
  score: number;
  label: string;
  breakdown?: { volume: number; diversity: number; reflection: number };
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

export const Dashboard: React.FC = () => {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [syncError, setSyncError] = useState<{ message: string; type?: 'auth' | 'general' } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const queryClient = useQueryClient();
  const { connectedProviders, data: platformStatusData } = usePlatformStatus(user?.id);

  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  // Calendar status + events (single query to avoid waterfall)
  const { data: calendarData } = useQuery({
    queryKey: ['calendar-data'],
    queryFn: async () => {
      const status = await calendarAPI.getStatus();
      if (!status.connected) return { connected: false, events: [] as CalendarEvent[], authError: false };
      if (status.tokenExpired) return { connected: true, events: [] as CalendarEvent[], authError: true };
      try {
        const eventsResponse = await calendarAPI.getEvents();
        return { connected: true, events: eventsResponse.events || [], authError: false };
      } catch (err: unknown) {
        const isAuth = err instanceof Error && /401|403|unauthorized|expired|token/i.test(err.message);
        if (isAuth) return { connected: true, events: [] as CalendarEvent[], authError: true };
        return { connected: true, events: [] as CalendarEvent[], authError: false };
      }
    },
    staleTime: 60 * 1000,
    enabled: !isDemoMode,
  });

  // Goals summary
  const { data: goalSummary } = useQuery<GoalSummary | null>({
    queryKey: ['goal-summary'],
    queryFn: async () => {
      try { return await goalsAPI.getSummary(); } catch { return null; }
    },
    staleTime: 5 * 60 * 1000,
    enabled: !isDemoMode,
  });

  // Demo calendar events (computed synchronously)
  const demoEvents = useMemo(() => {
    if (!isDemoMode) return [];
    const today = new Date();
    const events: CalendarEvent[] = DEMO_CALENDAR_DATA.todayEvents.map((evt) => {
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
      events.push({
        id: evt.id,
        title: evt.title,
        startTime: start,
        endTime: end,
        type: evt.type as CalendarEvent['type'],
        isImportant: (evt.attendees || 0) > 3,
      });
    });
    return events;
  }, [isDemoMode]);

  // Derived calendar state
  const calendarConnected = isDemoMode || calendarData?.connected || false;
  const allEvents = isDemoMode ? demoEvents : (calendarData?.events || []);
  const calendarAuthError = !isDemoMode && calendarData?.authError
    ? { message: 'Calendar connection expired. Please reconnect to see your events.', type: 'auth' as const }
    : null;
  const error = syncError || calendarAuthError;

  // Daily check-in streak
  const { data: streakData } = useQuery<{ streak: number }>({
    queryKey: ['checkin-streak'],
    queryFn: async () => {
      const res = await authFetch('/checkin/streak');
      if (!res.ok) return { streak: 0 };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !isDemoMode,
  });
  const checkinStreak = streakData?.streak ?? 0;

  // Check whether the user has already done today's mood check-in
  const { data: todayCheckin } = useQuery<{ checkedIn: boolean; data: { mood: string; energy: string | null } | null }>({
    queryKey: ['checkin-today'],
    queryFn: async () => {
      const res = await authFetch('/checkin/today');
      if (!res.ok) throw new Error('Failed to load check-in status');
      return res.json();
    },
    staleTime: 60 * 1000,
    enabled: !isDemoMode,
  });

  // Fetch interview completion status — shown as a CTA if not done
  const { data: interviewStatus } = useQuery<{ data: { completed_at: string | null } | null }>({
    queryKey: ['interview-status', user?.id],
    queryFn: async () => {
      const res = await authFetch(`/onboarding/calibration-data/${user?.id}`);
      if (!res.ok) throw new Error('Failed to load interview status');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user?.id && !isDemoMode,
  });

  const showInterviewCTA = shouldShowInterviewCTA({
    isDemoMode,
    interviewCompleted: !!interviewStatus?.data?.completed_at,
    interviewStatusLoaded: interviewStatus !== undefined,
    connectedPlatformCount: connectedProviders.length,
    totalMemories: memoryHealth?.totalCount ?? 0,
  });

  // Dismiss the check-in card locally (separate from checkedIn — allows manual dismissal)
  const [checkinDismissed, setCheckinDismissed] = useState(false);

  const handleCheckinComplete = () => {
    setCheckinDismissed(true);
    queryClient.invalidateQueries({ queryKey: ['checkin-today'] });
    queryClient.invalidateQueries({ queryKey: ['checkin-streak'] });
  };

  // Show the check-in card when: not demo mode, not yet checked in, and not dismissed this session
  const showCheckin = !isDemoMode && !checkinDismissed && todayCheckin !== undefined && !todayCheckin.checkedIn;

  // Fetch memory health (includes readiness score) — 5-min stale time, non-blocking
  const { data: memoryHealth } = useQuery<{ totalCount?: number; readiness?: TwinReadiness }>({
    queryKey: ['memory-health'],
    queryFn: async () => {
      const res = await authFetch('/memory-health');
      if (!res.ok) throw new Error('Failed to load memory health');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !isDemoMode,
  });

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

  // Calendar auto-refresh interval

  const refreshCalendar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['calendar-data'] });
    setCurrentTime(new Date());
  }, [queryClient]);

  useEffect(() => {
    if (!calendarConnected || isDemoMode) return;
    const refreshInterval = setInterval(refreshCalendar, CALENDAR_REFRESH_INTERVAL);
    return () => clearInterval(refreshInterval);
  }, [calendarConnected, isDemoMode, refreshCalendar]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await calendarAPI.sync();
      refreshCalendar();
    } catch (err) {
      const isAuthError = err instanceof Error && /401|403|expired/i.test(err.message);
      setSyncError({
        message: isAuthError
          ? 'Calendar connection expired. Please reconnect.'
          : 'Failed to sync calendar',
        type: isAuthError ? 'auth' : 'general'
      });
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = (lastSync: string | null): string => {
    if (!lastSync) return 'never';
    const diffMs = Date.now() - new Date(lastSync).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMin < 2) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  };

  const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
    spotify: 'Spotify',
    google_calendar: 'Calendar',
    youtube: 'YouTube',
    discord: 'Discord',
    linkedin: 'LinkedIn',
    whoop: 'Whoop',
    twitch: 'Twitch',
    github: 'GitHub',
    reddit: 'Reddit',
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

  const [promptValue, setPromptValue] = useState('');

  const handlePromptSubmit = () => {
    const text = promptValue.trim();
    if (text) {
      navigate('/talk-to-twin', { state: { discussContext: text } });
    } else {
      navigate('/talk-to-twin');
    }
  };

  const handleChipClick = (label: string) => {
    navigate('/talk-to-twin', { state: { discussContext: label } });
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
      color: isSpotifyConnected ? 'text-green-500' : 'text-muted-foreground',
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
      color: isCalendarConnected ? 'text-blue-500' : 'text-muted-foreground',
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
      color: isYouTubeConnected ? 'text-red-500' : 'text-muted-foreground',
      hasData: isYouTubeConnected,
      actionLabel: isYouTubeConnected ? 'Explore' : 'Connect',
      actionPath: isYouTubeConnected ? '/insights/youtube' : '/get-started'
    },
  ];

  return (
    <PageLayout>
      {error && (
        <div
          className="mb-10 p-7 glass-card flex items-center justify-between"
          style={{
            borderColor: error.type === 'auth'
              ? 'rgba(245, 158, 11, 0.3)'
              : 'rgba(239, 68, 68, 0.3)'
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

      {/* ── Greeting ── */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <h1
          className="heading-serif"
          style={{
            fontSize: 'clamp(2.5rem, 5.5vw, 3.75rem)',
            fontWeight: 400,
            letterSpacing: '-0.05em',
            lineHeight: 1.1,
            marginBottom: '0.75rem',
            color: 'var(--foreground)',
          }}
        >
          What's on your mind, {user?.firstName || 'there'}?
        </h1>
        <p className="text-[15px] font-medium" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {todayEvents.length > 0
            ? `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today`
            : 'Your day awaits'
          }
          {connectedProviders.length > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {' '}&bull;{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                {connectedProviders.length} platform{connectedProviders.length !== 1 ? 's' : ''} connected
              </span>
            </span>
          )}
          {checkinStreak >= 2 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {' '}&bull;{' '}
              <span style={{ color: 'var(--accent-streak)' }}>
                {checkinStreak}-day streak
              </span>
            </span>
          )}
        </p>
      </motion.div>

      {/* ── Central Glass Prompt ── */}
      <motion.div
        className="mb-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div
          className="glass-card !p-1.5 !rounded-[20px] transition-all duration-200"
          style={{
            borderColor: 'var(--accent-vibrant-glow)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 132, 0, 0.4)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 2px rgba(255, 132, 0, 0.15)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-vibrant-glow)';
            e.currentTarget.style.boxShadow = '';
          }}
        >
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Ask your twin anything..."
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
              className="flex-1 bg-transparent border-none outline-none px-5 py-4"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                fontWeight: 400,
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={handlePromptSubmit}
              className="flex items-center justify-center w-11 h-11 rounded-full flex-shrink-0 mr-0.5 transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))',
                color: '#1a1a17',
                boxShadow: '0 2px 12px var(--accent-vibrant-glow)',
              }}
              aria-label="Ask your twin"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick-action chips */}
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {QUICK_CHIPS.map((chip) => {
            const ChipIcon = chip.icon;
            return (
              <button
                key={chip.label}
                onClick={() => handleChipClick(chip.label)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-normal transition-all duration-200"
                style={{
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-secondary)',
                  background: 'var(--glass-surface-bg-subtle)',
                  border: '1px solid var(--glass-surface-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 132, 0, 0.4)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'var(--accent-vibrant-glow)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--glass-surface-border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'var(--glass-surface-bg-subtle)';
                }}
              >
                <ChipIcon className="w-3.5 h-3.5" aria-hidden="true" style={{ color: 'rgba(212,168,83,0.6)' }} />
                {chip.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {memoryHealth?.readiness !== undefined && (
        <GlassPanel className="!p-5 !mb-12" variant="card" delay={0.1}>
          <TwinReadinessScore
            score={memoryHealth.readiness.score}
            label={memoryHealth.readiness.label}
            breakdown={memoryHealth.readiness.breakdown}
            compact
          />
        </GlassPanel>
      )}

      {connectedProviders.length > 0 && (
        <motion.div
          className="mb-12 flex flex-wrap gap-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          {connectedProviders.map((provider) => {
            const status = platformStatusData[provider];
            const name = PLATFORM_DISPLAY_NAMES[provider] ?? provider;
            // Hide platforms that have never synced — "synced never" is confusing
            if (!status?.lastSync) return null;
            const syncLabel = formatLastSync(status.lastSync);
            const isRecent = Date.now() - new Date(status.lastSync).getTime() < 2 * 60 * 60 * 1000;
            return (
              <span
                key={provider}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs glass-badge"
              >
                <Circle
                  className="w-1.5 h-1.5 fill-current flex-shrink-0"
                  style={{ color: isRecent ? '#22c55e' : 'var(--text-muted)' }}
                />
                {name} synced {syncLabel}
              </span>
            );
          })}
        </motion.div>
      )}

      <AnimatePresence>
        {showCheckin && (
          <motion.div
            key="daily-checkin"
            className="mb-12 glass-card !p-7"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.35 }}
          >
            <DailyCheckin onComplete={handleCheckinComplete} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-14">
        <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>
          YOUR INSIGHTS
        </p>
        <TodayInsights />
      </div>

      <AnimatePresence>
        {showInterviewCTA && (
          <motion.div
            key="interview-cta"
            className="mb-12"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.35 }}
          >
            <button
              onClick={() => navigate('/interview')}
              className="w-full text-left flex items-center gap-4 px-7 py-5 glass-card transition-all hover:scale-[1.01]"
              style={{ borderColor: 'rgba(196, 162, 101, 0.35)' }}
            >
              <BookOpen className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent-vibrant)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Tell your twin your story</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>A 5-min interview seeds your twin with foundational context</p>
              </div>
              <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--accent-vibrant)' }}>Start →</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-14">
        <ProactiveInsightsPanel />
      </div>

      {goalSummary && (goalSummary.active > 0 || goalSummary.suggested > 0) && (
        <motion.div
          className="mb-14"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <button
            onClick={() => navigate('/goals')}
            className="w-full text-left glass-card p-7 transition-all hover:scale-[1.01]"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-ui)', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>Goals</span>
                {goalSummary.suggested > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-400">
                    {goalSummary.suggested}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="flex items-center gap-6">
              {goalSummary.active > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{goalSummary.active} active</span>
                </div>
              )}
              {goalSummary.bestStreak > 0 && (
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{goalSummary.bestStreak}d best streak</span>
                </div>
              )}
              {goalSummary.completed > 0 && (
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{goalSummary.completed} completed</span>
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
