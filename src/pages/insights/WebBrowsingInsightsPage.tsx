/**
 * Web Browsing Insights Page
 *
 * "Your Digital Life" - Visual insights from your twin
 * about what your browsing patterns reveal about you.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { WebBrowsingSkeleton } from './components/WebBrowsingSkeleton';
import { WebBrowsingErrorState } from './components/WebBrowsingErrorState';
import { WebBrowsingCharts } from './components/WebBrowsingCharts';
import type { InsightsResponse } from './components/webBrowsingTypes';
import { Globe, RefreshCw, Sparkles, ArrowLeft, Layout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const WebBrowsingInsightsPage: React.FC = () => {
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const colors = {
    text: 'var(--foreground)',
    textSecondary: 'var(--text-secondary)',
    webAccent: '#6366f1',
    webBg: 'rgba(99, 102, 241, 0.1)'
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

  if (loading) {
    return <WebBrowsingSkeleton />;
  }

  if (error) {
    return <WebBrowsingErrorState colors={colors} navigate={navigate} />;
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
            style={{ backgroundColor: colors.webBg }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          >
            <Globe className="w-6 h-6" style={{ color: colors.webAccent }} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <h1
              className="text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: colors.text }}
            >
              Your Digital Life
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              What your browsing reveals about you
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
          whileTap={{ scale: 0.95 }}
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: colors.text }} />
        </motion.button>
      </div>

      {/* Extension Install Banner */}
      {!insights?.hasExtensionData && (
        <GlassPanel
          className="!p-4 mb-6 cursor-pointer transition-opacity hover:opacity-80"
          style={{ borderLeft: `3px solid ${colors.webAccent}` }}
          onClick={() => navigate('/get-started')}
        >
          <div className="flex items-center gap-3">
            <Layout className="w-5 h-5 flex-shrink-0" style={{ color: colors.webAccent }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: colors.text }}>
                Install the browser extension to unlock your digital life
              </p>
              <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                Capture browsing patterns, reading habits, search queries, and content preferences to discover what your digital footprint reveals about you.
              </p>
            </div>
            <ArrowLeft className="w-4 h-4 rotate-180 flex-shrink-0" style={{ color: colors.textSecondary }} />
          </div>
        </GlassPanel>
      )}

      {/* Charts & Data Visualizations */}
      {insights && (
        <WebBrowsingCharts insights={insights} colors={colors} />
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
                  style={{ color: 'var(--text-secondary)' }}
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
