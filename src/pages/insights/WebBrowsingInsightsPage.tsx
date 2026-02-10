/**
 * Web Browsing Insights Page
 *
 * "Your Digital Life" - Visual insights from your twin
 * about what your browsing patterns reveal about you.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Globe, RefreshCw, Sparkles, ArrowLeft, AlertCircle, Search, BarChart3, BookOpen, Clock, Layout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

interface CategoryItem {
  category: string;
  count: number;
  percentage: number;
}

interface DomainItem {
  domain: string;
  count: number;
}

interface RecentActivityItem {
  title?: string;
  domain?: string;
  category?: string;
  timeOnPage?: number;
  timestamp?: string;
}

interface ReadingProfile {
  avgEngagement: number | null;
  avgTimeOnPage: number | null;
  dominantBehavior: string | null;
  readingBehaviors: Record<string, number>;
  contentTypeDistribution: Record<string, number>;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  webTopCategories?: CategoryItem[];
  webTopDomains?: DomainItem[];
  webTopTopics?: string[];
  webRecentSearches?: string[];
  webReadingProfile?: ReadingProfile | null;
  webRecentActivity?: RecentActivityItem[];
  webTotalPageVisits?: number;
  webTotalSearches?: number;
  hasExtensionData?: boolean;
  error?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Learning: '#60a5fa',
  News: '#f59e0b',
  Shopping: '#f97316',
  Social: '#a78bfa',
  Entertainment: '#ec4899',
  Productivity: '#22c55e',
  Health: '#14b8a6',
  Reference: '#8b5cf6',
  Other: '#6b7280'
};

const WebBrowsingInsightsPage: React.FC = () => {
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
    webAccent: '#6366f1',
    webBg: theme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)'
  };

  const getDemoInsights = (): InsightsResponse => ({
    success: true,
    reflection: {
      id: 'demo-web-1',
      text: 'Your browsing patterns reveal a deeply curious mind. You gravitate toward technology and learning content, spending significant time reading in-depth articles rather than skimming. Your search history shows a pattern of going deep on topics that interest you — from AI research to creative design. Your twin notices you browse most actively in the evenings, suggesting this is your personal exploration time.',
      generatedAt: new Date().toISOString(),
      expiresAt: null,
      confidence: 'high',
      themes: ['curiosity', 'learning', 'deep-reading'],
    },
    patterns: [
      { id: 'p1', text: 'You tend to deep-dive into topics for 20+ minutes, reading multiple articles in sequence before moving on.', occurrences: 'often' },
      { id: 'p2', text: 'Your browsing shifts from productivity tools during the day to creative and entertainment content in the evening.', occurrences: 'sometimes' },
      { id: 'p3', text: 'You frequently search for "how things work" style content, showing a systematic learning approach.', occurrences: 'noticed' },
    ],
    history: [
      { id: 'h1', text: 'Your recent browsing shows increased interest in AI and machine learning topics.', generatedAt: new Date(Date.now() - 86400000).toISOString() },
    ],
    evidence: [
      { id: 'ev1', observation: 'Technology dominates your browsing categories', dataPoints: ['42% of page visits', '15+ tech domains visited'], confidence: 'high' },
      { id: 'ev2', observation: 'Deep reader pattern detected', dataPoints: ['Average 3.2 min per page', '68% engagement score'], confidence: 'medium' },
    ],
    webTopCategories: [
      { category: 'Technology', count: 84, percentage: 42 },
      { category: 'Learning', count: 48, percentage: 24 },
      { category: 'News', count: 28, percentage: 14 },
      { category: 'Entertainment', count: 20, percentage: 10 },
      { category: 'Social', count: 12, percentage: 6 },
      { category: 'Shopping', count: 8, percentage: 4 },
    ],
    webTopDomains: [
      { domain: 'github.com', count: 32 },
      { domain: 'stackoverflow.com', count: 24 },
      { domain: 'medium.com', count: 18 },
      { domain: 'reddit.com', count: 15 },
      { domain: 'youtube.com', count: 12 },
      { domain: 'arxiv.org', count: 10 },
      { domain: 'news.ycombinator.com', count: 8 },
    ],
    webTopTopics: ['artificial intelligence', 'web development', 'machine learning', 'design systems', 'productivity', 'psychology', 'music production', 'startups'],
    webRecentSearches: ['react server components', 'claude api best practices', 'how neural networks learn', 'best productivity apps 2026', 'soul signature meaning'],
    webReadingProfile: {
      avgEngagement: 68,
      avgTimeOnPage: 192,
      dominantBehavior: 'deep_reader',
      readingBehaviors: { deep_reader: 45, engaged_reader: 30, skimmer: 15, scanner: 10 },
      contentTypeDistribution: { article: 50, reference: 25, video: 15, other: 10 },
    },
    webRecentActivity: [
      { title: 'Understanding Transformer Architecture', domain: 'arxiv.org', category: 'Learning', timeOnPage: 420, timestamp: new Date(Date.now() - 3600000).toISOString() },
      { title: 'React 19 New Features Guide', domain: 'react.dev', category: 'Technology', timeOnPage: 280, timestamp: new Date(Date.now() - 7200000).toISOString() },
      { title: 'The Science of Habit Formation', domain: 'medium.com', category: 'Learning', timeOnPage: 350, timestamp: new Date(Date.now() - 10800000).toISOString() },
    ],
    webTotalPageVisits: 200,
    webTotalSearches: 45,
    hasExtensionData: true,
  });

  useEffect(() => {
    let ignore = false;

    if (isDemoMode) {
      setError(null);
      setInsights(getDemoInsights());
      setLoading(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your digital life insights');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/insights/web`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        if (ignore) return;

        if (data.success) {
          setInsights(data);
          setError(null);
        } else {
          setError(data.error || 'Failed to load insights');
        }
      } catch (err) {
        if (ignore) return;
        console.error('Failed to fetch web browsing insights:', err);
        setError('Unable to connect to your digital life insights right now');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => { ignore = true; };
  }, [isDemoMode]);

  const fetchInsights = async () => {
    if (isDemoMode) {
      setError(null);
      setInsights(getDemoInsights());
      setLoading(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your digital life insights');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/web`, {
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
      console.error('Failed to fetch web browsing insights:', err);
      setError('Unable to connect to your digital life insights right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    if (isDemoMode) {
      setInsights(getDemoInsights());
      setRefreshing(false);
      return;
    }

    const authToken = token || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/web/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      toast.error('Refresh failed', { description: 'Unable to refresh Web Browsing insights. Please try again.' });
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
          <p className="text-center" style={{ color: colors.textSecondary }}>{error}</p>
          <p className="text-sm text-center max-w-md" style={{ color: colors.textSecondary }}>
            Install the Soul Signature browser extension and browse the web to start capturing your digital life patterns.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/get-started')}
              className="px-4 py-2 rounded-lg glass-button"
              style={{ color: colors.accent, borderColor: colors.accent, borderWidth: '1px' }}
            >
              Install Extension
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-lg glass-button"
              style={{ color: colors.text }}
            >
              Back to Dashboard
            </button>
          </div>
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
            style={{ backgroundColor: colors.webBg }}
          >
            <Globe className="w-6 h-6" style={{ color: colors.webAccent }} />
          </div>
          <div>
            <h1
              className="text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: colors.text }}
            >
              Your Digital Life
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              What your browsing reveals about you
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

      {/* Interest Categories */}
      {insights?.webTopCategories && insights.webTopCategories.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <BarChart3 className="w-4 h-4" />
            Your Interest Universe
          </h3>
          <div className="space-y-3">
            {insights.webTopCategories.slice(0, 8).map((cat, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: colors.text }}>
                    {cat.category}
                  </span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>
                    {cat.percentage}%
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.Other
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* What You Search For */}
      {insights?.webRecentSearches && insights.webRecentSearches.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Search className="w-4 h-4" />
            What You Search For
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.webRecentSearches.slice(0, 12).map((query, index) => (
              <span
                key={index}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: colors.webBg,
                  color: colors.webAccent
                }}
              >
                {query}
              </span>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Reading Profile */}
      {insights?.webReadingProfile && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <BookOpen className="w-4 h-4" />
            Your Reading Profile
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {insights.webReadingProfile.dominantBehavior && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium capitalize" style={{ color: colors.webAccent }}>
                  {insights.webReadingProfile.dominantBehavior.replace('_', ' ')}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Reading Style</p>
              </div>
            )}
            {insights.webReadingProfile.avgTimeOnPage != null && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium" style={{ color: colors.webAccent }}>
                  {insights.webReadingProfile.avgTimeOnPage < 60
                    ? `${insights.webReadingProfile.avgTimeOnPage}s`
                    : `${Math.floor(insights.webReadingProfile.avgTimeOnPage / 60)}m ${insights.webReadingProfile.avgTimeOnPage % 60}s`
                  }
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Avg. Time per Page</p>
              </div>
            )}
            {insights.webReadingProfile.avgEngagement != null && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium" style={{ color: colors.webAccent }}>
                  {insights.webReadingProfile.avgEngagement}/100
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Engagement Score</p>
              </div>
            )}
            {insights.webTotalPageVisits != null && insights.webTotalPageVisits > 0 && (
              <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.webBg }}>
                <p className="text-lg font-medium" style={{ color: colors.webAccent }}>
                  {insights.webTotalPageVisits}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Pages Tracked</p>
              </div>
            )}
          </div>
        </GlassPanel>
      )}

      {/* Digital Landscape - Top Domains */}
      {insights?.webTopDomains && insights.webTopDomains.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Layout className="w-4 h-4" />
            Your Digital Landscape
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.webTopDomains.slice(0, 15).map((item, index) => {
              const size = Math.max(0.7, Math.min(1.2, item.count / (insights.webTopDomains![0]?.count || 1)));
              return (
                <span
                  key={index}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    color: colors.text,
                    fontSize: `${size}rem`,
                    borderLeft: `3px solid ${colors.webAccent}`,
                    opacity: 0.6 + (item.count / (insights.webTopDomains![0]?.count || 1)) * 0.4
                  }}
                >
                  {item.domain.replace(/^www\./, '')}
                  <span className="text-xs ml-1" style={{ color: colors.textSecondary }}>
                    ({item.count})
                  </span>
                </span>
              );
            })}
          </div>
        </GlassPanel>
      )}

      {/* Top Topics */}
      {insights?.webTopTopics && insights.webTopTopics.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Sparkles className="w-4 h-4" />
            Topics That Draw You In
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.webTopTopics.slice(0, 15).map((topic, index) => (
              <span
                key={index}
                className="px-2.5 py-1 rounded-md text-xs"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.08)',
                  color: colors.text,
                  opacity: 1 - (index * 0.03)
                }}
              >
                {topic}
              </span>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Recent Activity */}
      {insights?.webRecentActivity && insights.webRecentActivity.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Clock className="w-4 h-4" />
            Recent Browsing
          </h3>
          <div className="space-y-3">
            {insights.webRecentActivity.slice(0, 8).map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.webBg }}
                >
                  <Globe className="w-5 h-5" style={{ color: colors.webAccent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: colors.text }}>
                    {item.title || item.domain || 'Unknown page'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.domain && (
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {item.domain.replace(/^www\./, '')}
                      </span>
                    )}
                    {item.category && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: CATEGORY_COLORS[item.category]
                            ? `${CATEGORY_COLORS[item.category]}20`
                            : 'rgba(107,114,128,0.1)',
                          color: CATEGORY_COLORS[item.category] || '#6b7280'
                        }}
                      >
                        {item.category}
                      </span>
                    )}
                    {item.timeOnPage != null && item.timeOnPage > 0 && (
                      <span className="text-xs" style={{ color: colors.textSecondary }}>
                        {item.timeOnPage < 60 ? `${item.timeOnPage}s` : `${Math.floor(item.timeOnPage / 60)}m`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
          <Globe className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
            Your twin is exploring
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As your browsing data flows in, your twin will discover patterns and share observations about your digital life.
          </p>
        </GlassPanel>
      )}
    </PageLayout>
  );
};

export default WebBrowsingInsightsPage;
