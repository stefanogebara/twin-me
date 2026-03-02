/**
 * Today's Insights Component
 * Shows 3-5 contextual, digestible insights based on real-time data
 * from Google Calendar, Spotify, and YouTube
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FeedbackWidget } from './FeedbackWidget';
import { DEMO_TODAY_INSIGHTS } from '../services/demoDataService';
import { usePlatformStatus } from '../hooks/usePlatformStatus';
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
import { getPlatformLogo } from '@/components/PlatformLogos';

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
    calendar: boolean;
    spotify: boolean;
    youtube: boolean;
  };
}

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
  const { isDemoMode, user } = useAuth();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Get real platform status to check token expiry
  const { data: platformStatus, isLoading: platformStatusLoading } = usePlatformStatus(user?.id);

  // Helper to check if platform is truly active (connected AND token not expired)
  const isPlatformActive = (platform: string) => {
    // In demo mode, all platforms are active
    if (isDemoMode) return true;

    const status = platformStatus[platform];
    return status?.connected && !status?.tokenExpired && status?.status !== 'token_expired';
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery<TodayInsightsResponse>({
    queryKey: ['today-insights'],
    queryFn: async () => {
      if (isDemoMode) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          success: true,
          insights: DEMO_TODAY_INSIGHTS,
          dataTimestamp: new Date().toISOString(),
          sources: { calendar: true, spotify: true }
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
    retry: 0,
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

  // ── Per-platform connect rows for any platform that is NOT connected ─────
  const disconnectedPlatforms = !isLoading && !platformStatusLoading && !isDemoMode
    ? [
        { platform: 'Calendar', platformKey: 'google_calendar', desc: 'Connect Google Calendar to unlock schedule insights',   active: isPlatformActive('google_calendar') },
        { platform: 'Spotify',  platformKey: 'spotify',         desc: 'Connect Spotify to unlock music mood insights',         active: isPlatformActive('spotify') },
      ].filter(p => !p.active)
    : [];

  // Show connect rows alongside real content when some (but not necessarily all) platforms are disconnected
  // If ALL platforms are disconnected and there's no data yet, show only the connect state
  const allDisconnected = disconnectedPlatforms.length === 2;

  if (allDisconnected && !isLoading && !platformStatusLoading && !isDemoMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: '#57534e' }} />
          <h2 className="text-lg font-medium" style={{ fontFamily: 'var(--font-heading)', color: '#000000' }}>
            Today's Insights
          </h2>
        </div>
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
          }}
        >
          {disconnectedPlatforms.map(({ platform, desc }) => (
            <div key={platform} className="flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: '#57534e' }}>
                {desc}
              </span>
              <button
                onClick={() => navigate('/get-started')}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.06)',
                  color: '#44403c',
                }}
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      }}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#8A857D' }} />
          <span className="ml-3" style={{ color: '#8A857D' }}>
            Analyzing your day...
          </span>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      }}>
        <div className="flex items-center gap-3" style={{ color: '#57534e' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#ef4444' }} />
          <span className="text-sm">Unable to load insights. Try refreshing.</span>
        </div>
      </div>
    );
  }

  const insights = data.insights;

  // ── Connected but no insights yet ────────────────────────────────────────
  if (insights.length === 0 && !isDemoMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: '#57534e' }} />
          <h2 className="text-lg font-medium" style={{ fontFamily: 'var(--font-heading)', color: '#000000' }}>
            Today's Insights
          </h2>
        </div>
        <div
          className="rounded-xl p-5 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
          }}
        >
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: '#a8a29e' }} />
          <span className="text-sm" style={{ color: '#57534e' }}>
            Analyzing your data — insights will appear here once your platforms sync.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" style={{ color: '#8A857D' }} />
          <h2 className="text-lg font-medium" style={{
            fontFamily: 'var(--font-heading)',
            color: '#000000'
          }}>
            Today's Insights
          </h2>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-lg transition-colors hover:bg-black/5"
          title="Refresh insights"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
            style={{ color: '#8A857D' }}
          />
        </button>
      </div>

      {/* Data Sources Indicator - Uses real platform status with token expiry check */}
      <div className="flex items-center gap-4 text-xs" style={{ color: '#8A857D' }}>
        {(() => {
          const CalendarIcon = getPlatformLogo('google_calendar') || Calendar;
          const SpotifyIcon = getPlatformLogo('spotify') || Music;
          return (
            <>
              <span className="flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                Calendar {isPlatformActive('google_calendar') ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : platformStatus['google_calendar']?.tokenExpired ? (
                  <AlertCircle className="w-3 h-3 text-amber-500" title="Token expired" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
              </span>
              <span className="flex items-center gap-1">
                <SpotifyIcon className="w-3 h-3" />
                Spotify {isPlatformActive('spotify') ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : platformStatus['spotify']?.tokenExpired ? (
                  <AlertCircle className="w-3 h-3 text-amber-500" title="Token expired" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
              </span>
            </>
          );
        })()}
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
                background: 'rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(10px) saturate(140%)',
                WebkitBackdropFilter: 'blur(10px) saturate(140%)',
                border: '1px solid rgba(255, 255, 255, 0.45)',
                boxShadow: isExpanded
                  ? '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                  : '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
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
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: colors.text }} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium truncate" style={{
                        color: '#000000'
                      }}>
                        {insight.title}
                      </h3>
                    </div>
                    <p className="text-sm" style={{ color: '#57534e' }}>
                      {insight.summary}
                    </p>
                  </div>

                  {/* Expand Arrow */}
                  <ChevronRight
                    className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    style={{ color: '#8A857D' }}
                  />
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && insight.detail && (
                <div
                  className="px-4 pb-4 pt-0"
                  style={{ borderTop: '1px solid rgba(0, 0, 0, 0.05)' }}
                >
                  <p className="text-sm mb-3 pt-3" style={{ color: '#78716c' }}>
                    {insight.detail}
                  </p>

                  {/* Enhanced Mood Visualization for music insights */}
                  {insight.type === 'music' && insight.audioFeatures && (
                    <div className="mb-4 p-3 rounded-lg" style={{
                      backgroundColor: 'rgba(29, 185, 84, 0.05)',
                      border: '1px solid rgba(29, 185, 84, 0.1)'
                    }}>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Energy Bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: '#78716c' }}>Energy</span>
                            <span style={{ color: '#1DB954' }}>{Math.round(insight.audioFeatures.energy)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: 'rgba(29, 185, 84, 0.1)'
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
                            <span style={{ color: '#78716c' }}>Positivity</span>
                            <span style={{ color: '#8B5CF6' }}>{Math.round(insight.audioFeatures.valence)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: 'rgba(139, 92, 246, 0.1)'
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
                            <span style={{ color: '#78716c' }}>Danceability</span>
                            <span style={{ color: '#EC4899' }}>{Math.round(insight.audioFeatures.danceability)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: 'rgba(236, 72, 153, 0.1)'
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
                            <span style={{ color: '#78716c' }}>Tempo</span>
                            <span style={{ color: '#F59E0B' }}>{Math.round(insight.audioFeatures.tempo)} BPM</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.1)'
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
                          backgroundColor: 'rgba(0, 0, 0, 0.06)',
                          color: '#000000'
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

      {/* Per-platform "Connect" rows for any platform that is not yet connected */}
      {disconnectedPlatforms.length > 0 && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(0, 0, 0, 0.04)',
          }}
        >
          {disconnectedPlatforms.map(({ platform, desc }) => (
            <div key={platform} className="flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: '#57534e' }}>
                {desc}
              </span>
              <button
                onClick={() => navigate('/get-started')}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.06)',
                  color: '#44403c',
                }}
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Only show the Soul Signature link when there are actual insights to explore */}
      {insights.length > 0 && (
        <button
          onClick={() => navigate('/soul-signature')}
          className="w-full py-3 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
            color: '#57534e',
            border: '1px solid rgba(0, 0, 0, 0.05)'
          }}
        >
          View Your Full Soul Signature
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default TodayInsights;
