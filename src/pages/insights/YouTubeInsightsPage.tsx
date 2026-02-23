/**
 * YouTube Insights Page
 *
 * "Your Content World" - Visual insights from your twin
 * about what your YouTube patterns reveal about you.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Video, RefreshCw, Sparkles, ArrowLeft, AlertCircle, Users, ThumbsUp, PieChart, BookOpen, History, Search, Download } from 'lucide-react';
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

interface YouTubeChannel {
  name: string;
  description?: string;
}

interface LikedVideo {
  title: string;
  channel: string;
  publishedAt?: string;
}

interface ContentCategory {
  category: string;
  percentage: number;
}

interface WatchHistoryItem {
  title?: string;
  videoId?: string;
  watchDuration?: number;
  watchPercentage?: number;
  completed?: boolean;
  timestamp?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  youtubeChannels?: YouTubeChannel[];
  youtubeChannelNames?: string[];
  youtubeRecentLiked?: LikedVideo[];
  youtubeContentCategories?: ContentCategory[];
  youtubeSubscriptionCount?: number;
  youtubeLikedVideoCount?: number;
  youtubeLearningRatio?: number | null;
  youtubeWatchHistory?: WatchHistoryItem[];
  youtubeSearchQueries?: string[];
  hasExtensionData?: boolean;
  error?: string;
}

const CATEGORY_COLORS = ['#FF0000', '#FF4444', '#60a5fa', '#a78bfa', '#fbbf24', '#4ade80'];

const getDemoYouTubeInsights = (): InsightsResponse => ({
  success: true,
  reflection: {
    id: 'demo-yt-1',
    text: "Your YouTube world reveals a curious mind that oscillates between deep learning and creative entertainment. You gravitate toward long-form educational content during mornings and switch to gaming and music videos in the evenings. There's a strong pattern of binge-watching documentary series and tech explainers - your twin sees someone who uses YouTube as a personal university.",
    generatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    expiresAt: null,
    confidence: 'high',
    themes: ['learning', 'technology', 'creativity']
  },
  patterns: [
    { id: 'p1', text: 'You watch educational tech content 3x more during weekday mornings', occurrences: 'often' },
    { id: 'p2', text: 'Your music video consumption spikes on Friday evenings', occurrences: 'often' },
    { id: 'p3', text: 'You rarely finish videos over 45 minutes but always finish 10-20min ones', occurrences: 'sometimes' },
    { id: 'p4', text: 'You follow a mix of indie creators and major channels equally', occurrences: 'noticed' }
  ],
  history: [
    { id: 'h1', text: 'Your curiosity index is in the top 15% - you explore more new channels than most viewers.', generatedAt: new Date(Date.now() - 86400000 * 3).toISOString() }
  ],
  evidence: [
    { id: 'e1', observation: 'Strong preference for visual learning', dataPoints: ['85% of watched content is visual/tutorial', 'Average watch time higher on step-by-step content'], confidence: 'high' }
  ],
  youtubeChannels: [
    { name: 'Fireship', description: 'Quick tech explainers' },
    { name: 'Veritasium', description: 'Science & engineering' },
    { name: 'Theo - t3.gg', description: 'Web development' },
    { name: 'Kurzgesagt', description: 'Animated science' },
    { name: 'MKBHD', description: 'Tech reviews' },
    { name: 'Lex Fridman', description: 'Deep conversations' }
  ],
  youtubeRecentLiked: [
    { title: 'The Biggest Problem in AI Right Now', channel: 'Fireship' },
    { title: 'Why The Universe Might Be a Hologram', channel: 'Veritasium' },
    { title: 'I Built an AI Agent That Codes For Me', channel: 'Theo - t3.gg' },
    { title: 'The Egg - A Short Story', channel: 'Kurzgesagt' }
  ],
  youtubeContentCategories: [
    { category: 'Technology', percentage: 35 },
    { category: 'Science', percentage: 20 },
    { category: 'Music', percentage: 18 },
    { category: 'Gaming', percentage: 12 },
    { category: 'Education', percentage: 10 },
    { category: 'Entertainment', percentage: 5 }
  ],
  youtubeSubscriptionCount: 142,
  youtubeLikedVideoCount: 387,
  youtubeLearningRatio: 65,
  hasExtensionData: true,
  youtubeWatchHistory: [
    { title: 'React Server Components Changed Everything', watchDuration: 720, watchPercentage: 95, completed: true },
    { title: 'The Map of Mathematics', watchDuration: 640, watchPercentage: 78, completed: false },
    { title: 'Building AI Agents from Scratch', watchDuration: 1200, watchPercentage: 100, completed: true }
  ],
  youtubeSearchQueries: ['claude api tutorial', 'react 19 features', 'best lofi beats', 'how neural networks work', 'typescript generics explained']
});

const YouTubeInsightsPage: React.FC = () => {
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const colors = {
    text: '#1F1C18',
    textSecondary: '#8A857D',
    youtubeRed: '#FF0000',
    youtubeBg: 'rgba(255, 0, 0, 0.1)'
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    if (isDemoMode) {
      setError(null);
      setInsights(getDemoYouTubeInsights());
      setLoading(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your content world');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/youtube`, {
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
      console.error('Failed to fetch YouTube insights:', err);
      setError('Unable to connect to your content world right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoYouTubeInsights());
        setRefreshing(false);
      }, 1000);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/youtube/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      toast.error('Refresh failed', { description: 'Unable to refresh YouTube insights. Please try again.' });
    } finally {
      setRefreshing(false);
    }
  };

  const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.06)',
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
            Connect YouTube
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
          <motion.button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg glass-button"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
          </motion.button>
          <motion.div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.youtubeBg }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          >
            <Video className="w-6 h-6" style={{ color: colors.youtubeRed }} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <h1
              className="text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: colors.text }}
            >
              Your Content World
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              What your viewing reveals
            </p>
          </motion.div>
        </div>
        <motion.button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg glass-button"
          title="Get a fresh observation"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: colors.text }} />
        </motion.button>
      </div>

      {/* Extension Coming Soon Banner */}
      {!insights?.hasExtensionData && (
        <GlassPanel
          className="!p-4 mb-6"
          style={{ borderLeft: `3px solid ${colors.youtubeRed}` }}
        >
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 flex-shrink-0" style={{ color: colors.youtubeRed }} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium" style={{ color: colors.text }}>
                  Deeper YouTube insights
                </p>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: 'rgba(255,0,0,0.08)', color: colors.youtubeRed }}
                >
                  Coming soon
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                A browser extension will capture watch history, search queries, and viewing patterns that the YouTube API can't access.
              </p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Recent Watch History (Extension Data) */}
      {insights?.youtubeWatchHistory && insights.youtubeWatchHistory.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <History className="w-4 h-4" />
            Recent Watch History
          </h3>
          <div className="space-y-3">
            {insights.youtubeWatchHistory.slice(0, 8).map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.youtubeBg }}
                >
                  <Video className="w-5 h-5" style={{ color: colors.youtubeRed }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: colors.text }}>
                    {item.title || item.videoId || 'Unknown video'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.watchPercentage != null && (
                      <div className="flex items-center gap-1">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
                          <div className="h-full rounded-full" style={{ width: `${item.watchPercentage}%`, backgroundColor: item.completed ? '#22c55e' : colors.youtubeRed }} />
                        </div>
                        <span className="text-xs" style={{ color: colors.textSecondary }}>{item.watchPercentage}%</span>
                      </div>
                    )}
                    {item.watchDuration != null && item.watchDuration > 0 && (
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {Math.floor(item.watchDuration / 60)}m {item.watchDuration % 60}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Search Interests (Extension Data) */}
      {insights?.youtubeSearchQueries && insights.youtubeSearchQueries.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Search className="w-4 h-4" />
            Search Interests
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.youtubeSearchQueries.slice(0, 10).map((query, index) => (
              <span
                key={index}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: colors.youtubeBg,
                  color: colors.youtubeRed
                }}
              >
                {query}
              </span>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Top Subscriptions */}
      {insights?.youtubeChannels && insights.youtubeChannels.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Users className="w-4 h-4" />
            Top Subscriptions
          </h3>
          <div className="space-y-3">
            {insights.youtubeChannels.slice(0, 8).map((channel, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: colors.youtubeBg, color: colors.youtubeRed }}
                >
                  {(channel.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: colors.text }}>
                    {channel.name}
                  </span>
                  {channel.description && (
                    <span className="text-xs truncate block" style={{ color: colors.textSecondary }}>
                      {channel.description}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Content Categories Distribution */}
      {insights?.youtubeContentCategories && insights.youtubeContentCategories.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <PieChart className="w-4 h-4" />
            Content Categories
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={insights.youtubeContentCategories}
                    dataKey="percentage"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={2}
                  >
                    {insights.youtubeContentCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
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
              {insights.youtubeContentCategories.slice(0, 6).map((cat, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                  />
                  <span className="text-sm" style={{ color: colors.text }}>
                    {cat.category}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: colors.textSecondary }}>
                    {cat.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Learning vs Entertainment Ratio */}
      {insights?.youtubeLearningRatio != null && (
        <GlassPanel className="mb-6 !p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Learning vs Entertainment
            </span>
            <BookOpen className="w-4 h-4" style={{ color: colors.textSecondary }} />
          </div>
          <div className="flex gap-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <div
              className="h-full rounded-l-full transition-all"
              style={{ width: `${insights.youtubeLearningRatio}%`, backgroundColor: '#60a5fa' }}
            />
            <div
              className="h-full rounded-r-full transition-all"
              style={{ width: `${100 - insights.youtubeLearningRatio}%`, backgroundColor: colors.youtubeRed }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs" style={{ color: '#60a5fa' }}>
              Learning {insights.youtubeLearningRatio}%
            </span>
            <span className="text-xs" style={{ color: colors.youtubeRed }}>
              Entertainment {100 - insights.youtubeLearningRatio}%
            </span>
          </div>
        </GlassPanel>
      )}

      {/* Recently Liked Videos */}
      {insights?.youtubeRecentLiked && insights.youtubeRecentLiked.length > 0 && (
        <div className="mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <ThumbsUp className="w-4 h-4" style={{ color: colors.youtubeRed }} />
            Recently Liked
          </h3>
          <div className="space-y-2">
            {insights.youtubeRecentLiked.slice(0, 5).map((video, index) => (
              <GlassPanel key={index} className="!p-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center"
                    style={{ backgroundColor: colors.youtubeBg }}
                  >
                    <Video className="w-5 h-5" style={{ color: colors.youtubeRed }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block" style={{ color: colors.text }}>
                      {video.title}
                    </span>
                    <span className="text-xs truncate block" style={{ color: colors.textSecondary }}>
                      {video.channel}
                    </span>
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
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
                  style={{ color: '#57534e' }}
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
        <div className="space-y-4">
          <GlassPanel className="text-center py-10">
            <Video className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
            <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
              Your twin is exploring
            </h3>
            <p className="mt-2 mb-4 max-w-sm mx-auto" style={{ color: colors.textSecondary }}>
              As your YouTube data syncs, your twin will discover patterns and share observations about your content world.
            </p>
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: 'rgba(255, 0, 0, 0.05)',
                color: colors.youtubeRed,
                border: '1px solid rgba(255, 0, 0, 0.15)',
              }}
            >
              <div aria-hidden="true" className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.youtubeRed }} />
              Your twin is collecting data... check back soon
            </div>
          </GlassPanel>

          {/* Skeleton preview of what insights will look like */}
          <div aria-hidden="true" className="opacity-50 pointer-events-none space-y-3">
            <p className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Preview of your insights
            </p>
            {/* Placeholder: Top Subscriptions */}
            <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <span className="text-sm" style={{ color: colors.textSecondary }}>Top Subscriptions</span>
              </div>
              <div className="space-y-2">
                {[85, 65, 45].map((width, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
                    <div className="flex-1">
                      <div className="h-3 rounded animate-pulse mb-1" style={{ width: `${width}%`, backgroundColor: 'rgba(0,0,0,0.06)' }} />
                      <div className="h-2 rounded animate-pulse" style={{ width: `${width - 20}%`, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
            {/* Placeholder: Content Categories */}
            <div className="grid grid-cols-2 gap-3">
              <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
                <div className="flex items-center gap-2 mb-3">
                  <PieChart className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Categories</span>
                </div>
                <div className="w-16 h-16 mx-auto rounded-full animate-pulse" style={{ border: `3px dashed rgba(0,0,0,0.08)` }} />
              </GlassPanel>
              <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
                <div className="flex items-center gap-2 mb-3">
                  <ThumbsUp className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Liked Videos</span>
                </div>
                <div className="space-y-2">
                  {[70, 50, 35].map((w, i) => (
                    <div key={i} className="h-3 rounded animate-pulse" style={{ width: `${w}%`, backgroundColor: `${colors.youtubeRed}20` }} />
                  ))}
                </div>
              </GlassPanel>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default YouTubeInsightsPage;
