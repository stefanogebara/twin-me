/**
 * Today's Insights Component
 * Shows 3-5 contextual, digestible insights based on real-time data
 * from Whoop, Google Calendar, and Spotify
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { FeedbackWidget } from './FeedbackWidget';
import {
  Activity,
  Calendar,
  Music,
  ChevronRight,
  Sparkles,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Zap,
  Moon,
  Sun,
  Heart,
  Loader2,
  RefreshCw
} from 'lucide-react';

interface MoodData {
  label: string;
  emoji?: string;
  description: string;
  color?: string;
  valence?: number;
  energy?: number;
}

interface AudioFeatures {
  energy: number;
  valence: number;
  danceability: number;
  tempo: number;
}

interface TodayInsight {
  id: string;
  type: 'health' | 'schedule' | 'music' | 'recommendation' | 'pattern';
  title: string;
  summary: string;
  detail?: string;
  platforms: string[];
  priority: 'high' | 'medium' | 'low';
  action?: {
    label: string;
    route?: string;
    onClick?: () => void;
  };
  icon: 'activity' | 'calendar' | 'music' | 'zap' | 'moon' | 'sun' | 'heart' | 'trending';
  // Enhanced mood data from Spotify
  moodData?: MoodData | null;
  audioFeatures?: AudioFeatures | null;
}

interface TodayInsightsResponse {
  success: boolean;
  insights: TodayInsight[];
  dataTimestamp: string;
  sources: {
    whoop: boolean;
    calendar: boolean;
    spotify: boolean;
  };
}

// Demo insights for demo mode
const DEMO_INSIGHTS: TodayInsight[] = [
  {
    id: 'demo-1',
    type: 'health',
    title: 'Good Recovery Day',
    summary: 'Your recovery is at 72% - perfect for moderate activity',
    detail: 'Based on your Whoop data, your HRV is above average and you got 7.2 hours of sleep. Consider a workout today.',
    platforms: ['whoop'],
    priority: 'high',
    icon: 'activity',
    action: { label: 'View Health Data', route: '/soul-signature' }
  },
  {
    id: 'demo-2',
    type: 'schedule',
    title: 'Your Day Ahead',
    summary: 'Check your calendar to see upcoming events',
    detail: 'Connect Google Calendar to get personalized insights about your schedule. We\'ll analyze your meeting patterns and suggest optimal prep times.',
    platforms: ['google_calendar'],
    priority: 'high',
    icon: 'calendar',
    action: { label: 'View Time Patterns', route: '/insights/calendar' }
  },
  {
    id: 'demo-3',
    type: 'music',
    title: 'Morning Focus Playlist',
    summary: 'Based on your listening, ambient music helps you focus',
    detail: 'Your recent Spotify history shows you listen to lo-fi and ambient tracks during work hours. This correlates with your most productive calendar blocks.',
    platforms: ['spotify', 'google_calendar'],
    priority: 'medium',
    icon: 'music',
    action: { label: 'View Music Insights', route: '/insights/spotify' }
  },
  {
    id: 'demo-4',
    type: 'pattern',
    title: 'Energy Pattern Detected',
    summary: 'You tend to crash around 3pm - schedule important work earlier',
    detail: 'Cross-referencing your Whoop strain data with calendar events shows your energy dips mid-afternoon. Your high-recovery days correlate with morning workouts.',
    platforms: ['whoop', 'google_calendar', 'spotify'],
    priority: 'medium',
    icon: 'trending'
  }
];

const iconMap = {
  activity: Activity,
  calendar: Calendar,
  music: Music,
  zap: Zap,
  moon: Moon,
  sun: Sun,
  heart: Heart,
  trending: TrendingUp
};

const priorityColors = {
  high: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  medium: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' }
};

export const TodayInsights: React.FC = () => {
  const { theme } = useTheme();
  const { isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<TodayInsightsResponse>({
    queryKey: ['today-insights'],
    queryFn: async () => {
      if (isDemoMode) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          success: true,
          insights: DEMO_INSIGHTS,
          dataTimestamp: new Date().toISOString(),
          sources: { whoop: true, calendar: true, spotify: true }
        };
      }

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/twin/today-insights`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  });

  const handleInsightClick = (insight: TodayInsight) => {
    if (expandedId === insight.id) {
      setExpandedId(null);
    } else {
      setExpandedId(insight.id);
    }
  };

  const handleAction = (insight: TodayInsight) => {
    if (insight.action?.route) {
      navigate(insight.action.route);
    } else if (insight.action?.onClick) {
      insight.action.onClick();
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6" style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
      }}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }} />
          <span className="ml-3" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Analyzing your day...
          </span>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="rounded-2xl p-6" style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
      }}>
        <div className="flex items-center gap-3 text-red-500">
          <AlertCircle className="w-5 h-5" />
          <span>Unable to load insights. Please try again.</span>
        </div>
      </div>
    );
  }

  const insights = data.insights;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#57534e' }} />
          <h2 className="text-lg font-medium" style={{
            fontFamily: 'var(--font-heading)',
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}>
            Today's Insights
          </h2>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          title="Refresh insights"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
          />
        </button>
      </div>

      {/* Data Sources Indicator */}
      <div className="flex items-center gap-4 text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Whoop {data.sources.whoop ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-orange-500" />}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Calendar {data.sources.calendar ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-orange-500" />}
        </span>
        <span className="flex items-center gap-1">
          <Music className="w-3 h-3" />
          Spotify {data.sources.spotify ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-orange-500" />}
        </span>
      </div>

      {/* Insights List */}
      <div className="space-y-3">
        {insights.map((insight) => {
          const Icon = iconMap[insight.icon] || Sparkles;
          const isExpanded = expandedId === insight.id;
          const colors = priorityColors[insight.priority];

          return (
            <div
              key={insight.id}
              className="rounded-xl overflow-hidden transition-all duration-200 cursor-pointer"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.8)',
                border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.15)' : '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: isExpanded ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none'
              }}
              onClick={() => handleInsightClick(insight)}
            >
              {/* Main Content */}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : colors.bg,
                      border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : colors.border}`
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: theme === 'dark' ? '#C1C0B6' : colors.text }} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium truncate" style={{
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                      }}>
                        {insight.title}
                      </h3>
                      {/* Platform badges */}
                      <div className="flex gap-1">
                        {insight.platforms.map(platform => (
                          <span
                            key={platform}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                            }}
                          >
                            {platform.replace('google_', '').replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}>
                      {insight.summary}
                    </p>
                  </div>

                  {/* Expand Arrow */}
                  <ChevronRight
                    className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}
                  />
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && insight.detail && (
                <div
                  className="px-4 pb-4 pt-0"
                  style={{ borderTop: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)' }}
                >
                  <p className="text-sm mb-3 pt-3" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
                    {insight.detail}
                  </p>

                  {/* Enhanced Mood Visualization for music insights */}
                  {insight.type === 'music' && insight.audioFeatures && (
                    <div className="mb-4 p-3 rounded-lg" style={{
                      backgroundColor: theme === 'dark' ? 'rgba(29, 185, 84, 0.08)' : 'rgba(29, 185, 84, 0.05)',
                      border: theme === 'dark' ? '1px solid rgba(29, 185, 84, 0.15)' : '1px solid rgba(29, 185, 84, 0.1)'
                    }}>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Energy Bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>Energy</span>
                            <span style={{ color: '#1DB954' }}>{Math.round(insight.audioFeatures.energy)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(29, 185, 84, 0.15)' : 'rgba(29, 185, 84, 0.1)'
                          }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${insight.audioFeatures.energy}%`, backgroundColor: '#1DB954' }}
                            />
                          </div>
                        </div>
                        {/* Positivity Bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>Positivity</span>
                            <span style={{ color: '#8B5CF6' }}>{Math.round(insight.audioFeatures.valence)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)'
                          }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${insight.audioFeatures.valence}%`, backgroundColor: '#8B5CF6' }}
                            />
                          </div>
                        </div>
                        {/* Danceability Bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>Danceability</span>
                            <span style={{ color: '#EC4899' }}>{Math.round(insight.audioFeatures.danceability)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.1)'
                          }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${insight.audioFeatures.danceability}%`, backgroundColor: '#EC4899' }}
                            />
                          </div>
                        </div>
                        {/* Tempo */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>Tempo</span>
                            <span style={{ color: '#F59E0B' }}>{Math.round(insight.audioFeatures.tempo)} BPM</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)'
                          }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min((insight.audioFeatures.tempo / 180) * 100, 100)}%`, backgroundColor: '#F59E0B' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    {insight.action && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction(insight);
                        }}
                        className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                          color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                        }}
                      >
                        {insight.action.label} →
                      </button>
                    )}

                    {/* Compact Feedback Widget */}
                    <FeedbackWidget
                      recommendationId={insight.id}
                      recommendationType={insight.type}
                      compact={true}
                      contextSnapshot={{
                        insightTitle: insight.title,
                        insightType: insight.type,
                        priority: insight.priority,
                        platforms: insight.platforms,
                        timestamp: data?.dataTimestamp
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* View All Link */}
      <button
        onClick={() => navigate('/soul-signature')}
        className="w-full py-3 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
          border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
        }}
      >
        View Your Full Soul Signature
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default TodayInsights;
