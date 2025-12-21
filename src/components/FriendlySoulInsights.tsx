/**
 * Friendly Soul Insights Component
 * Uses the new insight generation API to show user-friendly discoveries
 * No technical jargon - just meaningful insights and recommendations
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FriendlyInsightCard } from './insights/FriendlyInsightCard';
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  Loader,
  ChevronRight,
  Shield,
  TrendingUp,
  Target,
  Users,
  Zap,
  MessageSquare
} from 'lucide-react';

interface Insight {
  title: string;
  icon: string;
  description: string;
  source: 'spotify' | 'youtube' | 'github' | 'cross-platform';
  confidence: number;
  actions?: string[];
  data?: any;
}

interface Recommendation {
  type: 'productivity' | 'social' | 'learning' | 'discovery';
  title: string;
  description: string;
  action: string;
}

interface InsightsResponse {
  success: boolean;
  userId: string;
  insights: Insight[];
  summary: {
    totalInsights: number;
    platforms: string[];
    authenticityScore: number;
    topInsight: Insight | null;
  };
  recommendations: Recommendation[];
}

export function FriendlySoulInsights() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [privacySettings, setPrivacySettings] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'personal' | 'professional' | 'creative'>('all');

  // Fetch insights from our new API
  const fetchInsights = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/soul-signature/insights/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      setInsights(data);
    } catch (err) {
      console.error('Error fetching insights:', err);
      setError('Unable to load your insights. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  React.useEffect(() => {
    fetchInsights();
  }, [user?.id]);

  // Toggle privacy for an insight
  const togglePrivacy = (insightTitle: string) => {
    setPrivacySettings(prev => ({
      ...prev,
      [insightTitle]: !prev[insightTitle]
    }));

    // In real implementation, this would also update the backend
    fetch(`${import.meta.env.VITE_API_URL}/soul-signature/insights/${user?.id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        insightId: insightTitle, // In production, use actual ID
        share: !privacySettings[insightTitle]
      })
    });
  };

  // Filter insights based on type
  // TODO: Properly categorize Claude insights into personal/professional/creative
  // For now, show all insights regardless of filter until we implement proper categorization
  const filterInsights = (insights: Insight[]) => {
    if (activeFilter === 'all') return insights;

    // Real Claude insights need to be categorized at the data transformation layer
    // This will be implemented when we add the insight type mapping from the API response
    return insights;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Sparkles className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          </motion.div>
          <p className="text-slate-600">Discovering your soul signature...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="backdrop-blur-[16px] rounded-xl p-6 shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <div className="flex items-center space-x-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
        <button
          onClick={fetchInsights}
          className="mt-4 px-4 py-2 bg-stone-500 text-white rounded-lg hover:bg-stone-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // No insights yet
  if (!insights || !insights.summary || !insights.insights || insights.insights.length === 0) {
    return (
      <div
        className="backdrop-blur-[16px] rounded-xl p-8 shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <div className="text-center">
          <Sparkles className="w-16 h-16 text-stone-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            Your Journey Begins Here
          </h3>
          <p className="text-slate-600 mb-6">
            Connect your favorite platforms to discover your authentic soul signature
          </p>
          <button className="px-6 py-3 bg-stone-500 text-white rounded-lg hover:bg-stone-600 transition-colors">
            Connect Platforms
          </button>
        </div>
      </div>
    );
  }

  const filteredInsights = filterInsights(insights.insights);

  return (
    <div className="space-y-8">
      {/* Header with Summary */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-[16px] rounded-xl p-6 shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">
              Your Soul Insights
            </h2>
            <p className="text-slate-600">
              {insights.summary.totalInsights} discoveries from {insights.summary.platforms.join(', ')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/soul-chat')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-500 hover:bg-stone-600 text-white font-medium transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Chat with Your Twin
            </motion.button>

            <button
              onClick={fetchInsights}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Authenticity Score */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-stone-500">
              {insights.summary.authenticityScore}%
            </div>
            <div className="text-sm text-slate-600 mt-1">Authenticity Score</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900">
              {insights.summary.totalInsights}
            </div>
            <div className="text-sm text-slate-600 mt-1">Insights</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900">
              {insights.summary.platforms.length}
            </div>
            <div className="text-sm text-slate-600 mt-1">Platforms</div>
          </div>
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2">
        {(['all', 'personal', 'professional', 'creative'] as const).map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeFilter === filter
                ? 'bg-stone-500 text-white'
                : 'bg-stone-100 text-slate-700 hover:bg-stone-200'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Top Insight Highlight */}
      {insights.summary.topInsight && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="absolute -top-2 -left-2 px-3 py-1 bg-gradient-to-r from-stone-500 to-stone-500 text-white text-xs font-semibold rounded-full z-10">
            TOP DISCOVERY
          </div>
          <FriendlyInsightCard
            {...insights.summary.topInsight}
            isPrivate={privacySettings[insights.summary.topInsight.title]}
            onPrivacyToggle={() => togglePrivacy(insights.summary.topInsight.title)}
            delay={0.1}
          />
        </motion.div>
      )}

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence mode="wait">
          {filteredInsights.map((insight, index) => (
            <FriendlyInsightCard
              key={insight.title}
              {...insight}
              isPrivate={privacySettings[insight.title]}
              onPrivacyToggle={() => togglePrivacy(insight.title)}
              delay={index * 0.1}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Recommendations Section */}
      {insights.recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="backdrop-blur-[16px] rounded-xl p-6 shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
            borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
            borderWidth: '1px',
            borderStyle: 'solid'
          }}
        >
          <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2 text-stone-500" />
            Recommendations for You
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.recommendations.map((rec, index) => (
              <motion.div
                key={index}
                whileHover={{ scale: 1.02 }}
                className="p-4 rounded-lg bg-stone-50 hover:bg-stone-100 transition-all cursor-pointer"
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-white">
                    {rec.type === 'productivity' && <Zap className="w-5 h-5 text-yellow-500" />}
                    {rec.type === 'social' && <Users className="w-5 h-5 text-blue-500" />}
                    {rec.type === 'learning' && <TrendingUp className="w-5 h-5 text-green-500" />}
                    {rec.type === 'discovery' && <Sparkles className="w-5 h-5 text-purple-500" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900 mb-1">{rec.title}</h4>
                    <p className="text-sm text-slate-600 mb-2">{rec.description}</p>
                    <button className="text-sm text-stone-500 hover:text-stone-600 flex items-center">
                      {rec.action}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Privacy Notice */}
      <div className="flex items-center justify-center space-x-2 text-sm text-slate-500">
        <Shield className="w-4 h-4" />
        <span>Your insights are private by default. Click the eye icon to control sharing.</span>
      </div>
    </div>
  );
}