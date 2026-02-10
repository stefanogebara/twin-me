/**
 * Twitch Insights Page
 *
 * "Your Gaming World" - Visual insights from your twin
 * about what your Twitch patterns reveal about you.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Tv, RefreshCw, Sparkles, ArrowLeft, AlertCircle, Users, Gamepad2, PieChart, History, Download, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart as RechartsPie, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

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

interface TwitchChannel {
  name: string;
  gameName?: string | null;
}

interface GamingCategory {
  game: string;
  percentage: number;
}

interface StreamWatch {
  channelName?: string;
  gameName?: string | null;
  watchDuration?: number;
  timestamp?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  twitchChannels?: TwitchChannel[];
  twitchChannelNames?: string[];
  twitchFollowedCount?: number;
  twitchGamingCategories?: GamingCategory[];
  twitchDisplayName?: string | null;
  twitchStreamWatches?: StreamWatch[];
  twitchBrowseCategories?: string[];
  hasExtensionData?: boolean;
  error?: string;
}

const GAME_COLORS = ['#9146FF', '#B380FF', '#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c'];

const getDemoTwitchInsights = (): InsightsResponse => ({
  success: true,
  reflection: {
    id: 'demo-tw-1',
    text: "Your Twitch world shows a fascinating blend of competitive gaming and creative community engagement. You're drawn to streamers who combine skill with personality - not just watching gameplay, but following stories. Your twin notices you often tune in to Just Chatting streams late at night, suggesting you value the social aspect of streaming as much as the gaming itself.",
    generatedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    expiresAt: null,
    confidence: 'high',
    themes: ['gaming', 'community', 'social']
  },
  patterns: [
    { id: 'p1', text: 'You watch competitive FPS streams during peak hours but creative streams late at night', occurrences: 'often' },
    { id: 'p2', text: 'You tend to follow smaller streamers with tight-knit communities', occurrences: 'sometimes' },
    { id: 'p3', text: 'Your Just Chatting watch time has increased 40% over the last month', occurrences: 'noticed' }
  ],
  history: [
    { id: 'h1', text: 'Your streaming taste reveals someone who values authenticity over production value.', generatedAt: new Date(Date.now() - 86400000 * 5).toISOString() }
  ],
  evidence: [
    { id: 'e1', observation: 'Community-oriented viewer', dataPoints: ['75% of followed channels have under 5K avg viewers', 'High chat participation during streams'], confidence: 'high' }
  ],
  twitchChannels: [
    { name: 'Shroud', gameName: 'Valorant' },
    { name: 'Pokimane', gameName: 'Just Chatting' },
    { name: 'CohhCarnage', gameName: 'Elden Ring' },
    { name: 'summit1g', gameName: 'GTA V' },
    { name: 'xQc', gameName: 'Just Chatting' },
    { name: 'Lirik', gameName: 'Variety' }
  ],
  twitchFollowedCount: 47,
  twitchGamingCategories: [
    { game: 'FPS / Shooters', percentage: 30 },
    { game: 'Just Chatting', percentage: 22 },
    { game: 'RPG / Adventure', percentage: 18 },
    { game: 'Strategy', percentage: 12 },
    { game: 'Creative / Art', percentage: 10 },
    { game: 'Music', percentage: 8 }
  ],
  twitchDisplayName: 'Alex',
  hasExtensionData: true,
  twitchStreamWatches: [
    { channelName: 'Shroud', gameName: 'Valorant', watchDuration: 3600 },
    { channelName: 'CohhCarnage', gameName: 'Elden Ring', watchDuration: 5400 },
    { channelName: 'Pokimane', gameName: 'Just Chatting', watchDuration: 1800 }
  ],
  twitchBrowseCategories: ['Valorant', 'Just Chatting', 'Elden Ring', 'League of Legends', 'Art', 'Music', 'Minecraft']
});

const TwitchInsightsPage: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    twitchPurple: '#9146FF',
    twitchBg: theme === 'dark' ? 'rgba(145, 70, 255, 0.15)' : 'rgba(145, 70, 255, 0.1)'
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    if (isDemoMode) {
      setError(null);
      setInsights(getDemoTwitchInsights());
      setLoading(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your gaming world');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/twitch`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        setInsights(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to load insights');
      }
    } catch (err) {
      console.error('Failed to fetch Twitch insights:', err);
      setError('Unable to connect to your gaming world right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoTwitchInsights());
        setRefreshing(false);
      }, 1000);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/twitch/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      toast.error('Refresh failed', { description: 'Unable to refresh Twitch insights. Please try again.' });
    } finally {
      setRefreshing(false);
    }
  };

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
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <SkeletonPulse className="w-10 h-10 rounded-lg" />
            <SkeletonPulse className="w-12 h-12 rounded-xl" />
            <div>
              <SkeletonPulse className="h-7 w-40 mb-2" />
              <SkeletonPulse className="h-4 w-32" />
            </div>
          </div>
        </div>
        <GlassPanel className="mb-6 !p-4">
          <SkeletonPulse className="h-4 w-40 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <SkeletonPulse key={i} className="h-8 w-full" />
            ))}
          </div>
        </GlassPanel>
        <GlassPanel className="mb-8">
          <SkeletonPulse className="h-5 w-full mb-2" />
          <SkeletonPulse className="h-5 w-4/5 mb-2" />
          <SkeletonPulse className="h-5 w-3/5" />
        </GlassPanel>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle className="w-12 h-12" style={{ color: colors.textSecondary }} />
          <p style={{ color: colors.textSecondary }}>{error}</p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg glass-button"
            style={{ color: colors.text }}
          >
            Connect Twitch
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
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg glass-button">
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
          </button>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.twitchBg }}
          >
            <Tv className="w-6 h-6" style={{ color: colors.twitchPurple }} />
          </div>
          <div>
            <h1
              className="text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: colors.text }}
            >
              Your Gaming World
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {insights?.twitchDisplayName
                ? `${insights.twitchDisplayName}'s streaming patterns`
                : 'What your streaming reveals'}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg glass-button"
          title="Get a fresh observation"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: colors.text }} />
        </button>
      </div>

      {/* Extension Install Banner */}
      {!insights?.hasExtensionData && (
        <GlassPanel
          className="!p-4 mb-6 cursor-pointer transition-opacity hover:opacity-80"
          style={{ borderLeft: `3px solid ${colors.twitchPurple}` }}
          onClick={() => navigate('/get-started')}
        >
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 flex-shrink-0" style={{ color: colors.twitchPurple }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: colors.text }}>
                Get deeper Twitch insights
              </p>
              <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                Install our browser extension to capture stream watch sessions, gaming patterns, and browsing activity that the Twitch API can't access.
              </p>
            </div>
            <ArrowLeft className="w-4 h-4 rotate-180 flex-shrink-0" style={{ color: colors.textSecondary }} />
          </div>
        </GlassPanel>
      )}

      {/* Recent Stream Watches (Extension Data) */}
      {insights?.twitchStreamWatches && insights.twitchStreamWatches.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <History className="w-4 h-4" />
            Recent Stream Watches
          </h3>
          <div className="space-y-3">
            {insights.twitchStreamWatches.slice(0, 8).map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.twitchBg }}
                >
                  <Eye className="w-5 h-5" style={{ color: colors.twitchPurple }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: colors.text }}>
                    {item.channelName || 'Unknown channel'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.gameName && (
                      <span className="text-xs" style={{ color: colors.twitchPurple }}>
                        {item.gameName}
                      </span>
                    )}
                    {item.watchDuration != null && item.watchDuration > 0 && (
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {item.watchDuration >= 3600
                          ? `${Math.floor(item.watchDuration / 3600)}h ${Math.floor((item.watchDuration % 3600) / 60)}m`
                          : `${Math.floor(item.watchDuration / 60)}m`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Browse Categories (Extension Data) */}
      {insights?.twitchBrowseCategories && insights.twitchBrowseCategories.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Gamepad2 className="w-4 h-4" />
            Categories Browsed
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.twitchBrowseCategories.slice(0, 10).map((cat, index) => (
              <span
                key={index}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: colors.twitchBg,
                  color: colors.twitchPurple
                }}
              >
                {cat}
              </span>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Followed Channels */}
      {insights?.twitchChannels && insights.twitchChannels.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Users className="w-4 h-4" />
            Followed Channels
            {insights.twitchFollowedCount ? (
              <span className="text-xs ml-auto" style={{ color: colors.textSecondary }}>
                {insights.twitchFollowedCount} total
              </span>
            ) : null}
          </h3>
          <div className="space-y-3">
            {insights.twitchChannels.slice(0, 10).map((channel, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: colors.twitchBg, color: colors.twitchPurple }}
                >
                  {(channel.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: colors.text }}>
                    {channel.name}
                  </span>
                  {channel.gameName && (
                    <span className="text-xs truncate block" style={{ color: colors.textSecondary }}>
                      {channel.gameName}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Gaming Preferences */}
      {insights?.twitchGamingCategories && insights.twitchGamingCategories.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Gamepad2 className="w-4 h-4" />
            Gaming Preferences
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={insights.twitchGamingCategories}
                    dataKey="percentage"
                    nameKey="game"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={2}
                  >
                    {insights.twitchGamingCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={GAME_COLORS[index % GAME_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: colors.text }}
                    itemStyle={{ color: colors.text }}
                    formatter={(value: number) => [`${value}%`, 'Share']}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {insights.twitchGamingCategories.slice(0, 8).map((cat, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: GAME_COLORS[index % GAME_COLORS.length] }}
                  />
                  <span className="text-sm truncate" style={{ color: colors.text }}>
                    {cat.game}
                  </span>
                  <span className="text-xs ml-auto flex-shrink-0" style={{ color: colors.textSecondary }}>
                    {cat.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>
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
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection evidence={insights.evidence} className="mt-4" />
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
          <h3 className="text-sm uppercase tracking-wider mb-4" style={{ color: colors.textSecondary }}>
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
                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
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
          <Tv className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
            Your twin is tuning in
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As your Twitch data syncs, your twin will notice patterns in your streaming world and share observations.
          </p>
        </GlassPanel>
      )}
    </PageLayout>
  );
};

export default TwitchInsightsPage;
