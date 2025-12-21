import React, { useState } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';

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

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  type: string;
}

export const DashboardDemo: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  // Mock data for demonstration
  const nextEvent: CalendarEvent = {
    id: '1',
    title: 'Team Standup Meeting',
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    type: 'Meeting'
  };

  const todayEvents = [
    { id: '1', title: 'Team Standup', time: '9:00 AM' },
    { id: '2', title: 'Product Review', time: '2:00 PM' },
    { id: '3', title: 'Client Call', time: '4:00 PM' }
  ];

  const ritualStreak = 7;
  const focusScore = 85;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatTimeUntil = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const platforms: PlatformStatus[] = [
    { id: 'calendar', name: 'Calendar', connected: true, icon: Calendar, color: 'text-blue-500' },
    { id: 'spotify', name: 'Spotify', connected: true, icon: Music, color: 'text-green-500' },
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

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2000);
  };

  return (
    <PageLayout>
      <div className="mb-8">
        <h1
          className="text-3xl mb-2"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}
        >
          {getGreeting()}, Demo User
        </h1>
        <p
          className="text-base"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
        >
          {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} today • Focus Score: {focusScore}%
        </p>
      </div>

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
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="p-1 rounded glass-button"
                  title="Sync calendar"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`}
                    style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
                  />
                </button>
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
                  className="px-2 py-0.5 rounded-full text-xs glass-badge"
                >
                  {nextEvent.type}
                </span>
              </div>
            </div>

            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center glass"
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
              <GlassPanel key={pattern.id} variant="shimmer" hover className="cursor-pointer">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center glass"
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
                className="px-4 py-3 glass-button flex items-center gap-2"
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

export default DashboardDemo;