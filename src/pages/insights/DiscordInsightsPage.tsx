/**
 * Discord Insights Page
 *
 * "Your Community World" - Conversational reflections from your twin
 * about what your Discord server memberships reveal about you.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { getAccessToken } from '@/services/api/apiBase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { MessageSquare, AlertCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDemoDiscordInsights } from '@/services/demoDataService';
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

interface DiscordServer {
  name: string;
  category: string;
  memberCount?: number;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  discordServers?: DiscordServer[];
  discordTotalServers?: number;
  discordCategoryBreakdown?: CategoryBreakdown[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'tech/dev': '#5865F2',
  'gaming': '#57F287',
  'creative': '#FEE75C',
  'learning': '#EB459E',
  'community': '#ED4245',
};

const DiscordInsightsPage: React.FC = () => {
  useDocumentTitle('Discord Insights');

  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004';

  const colors = {
    text: 'var(--foreground)',
    textSecondary: 'rgba(255,255,255,0.4)',
    discordPurple: '#5865F2',
    discordBg: 'rgba(88, 101, 242, 0.1)',
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    if (isDemoMode) {
      setError(null);
      setInsights(getDemoDiscordInsights());
      setLoading(false);
      return;
    }

    const authToken = token || getAccessToken() || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your community insights');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/discord`, {
        headers: { Authorization: `Bearer ${authToken}` },
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
      console.error('Failed to fetch Discord insights:', err);
      setError('Unable to read your community world right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoDiscordInsights());
        setRefreshing(false);
      }, 800);
      return;
    }

    const authToken = token || getAccessToken() || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/discord/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      toast.error('Refresh failed', {
        description: 'Unable to refresh Discord insights. Please try again.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="animate-pulse space-y-4">
          <div className="h-16 rounded-xl" style={{ backgroundColor: 'var(--glass-surface-bg)' }} />
          <div className="h-32 rounded-xl" style={{ backgroundColor: 'var(--glass-surface-bg)' }} />
          <div className="h-48 rounded-xl" style={{ backgroundColor: 'var(--glass-surface-bg)' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle className="w-12 h-12" style={{ color: colors.textSecondary }} />
          <p style={{ color: colors.textSecondary }}>{error}</p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: '#10b77f', color: '#fff' }}
          >
            Connect Discord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      <InsightsPageHeader
        title="Your Community World"
        subtitle="What your servers reveal about you"
        icon={<MessageSquare className="w-6 h-6" style={{ color: colors.discordPurple }} />}
        iconColor={colors.discordPurple}
        iconBgColor={colors.discordBg}
        textColor={colors.text}
        textSecondaryColor={colors.textSecondary}
        onBack={() => navigate('/dashboard')}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      {/* Server Tags */}
      {insights?.discordServers && insights.discordServers.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <h3
            className="text-[11px] font-medium uppercase tracking-[0.08em] mb-3 flex items-center gap-2"
            style={{ color: '#10b77f' }}
          >
            <Users className="w-4 h-4" />
            Your Communities ({insights.discordTotalServers ?? insights.discordServers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.discordServers.map((server, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: `${CATEGORY_COLORS[server.category] || colors.discordPurple}18`,
                  color: CATEGORY_COLORS[server.category] || colors.discordPurple,
                  border: `1px solid ${CATEGORY_COLORS[server.category] || colors.discordPurple}40`,
                }}
              >
                {server.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {insights?.discordCategoryBreakdown && insights.discordCategoryBreakdown.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <h3
            className="text-[11px] font-medium uppercase tracking-[0.08em] mb-4 flex items-center gap-2"
            style={{ color: '#10b77f' }}
          >
            <MessageSquare className="w-4 h-4" />
            Community Focus
          </h3>
          <div className="space-y-3">
            {insights.discordCategoryBreakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm w-24 capitalize" style={{ color: colors.text }}>
                  {item.category}
                </span>
                <div
                  className="flex-1 h-5 rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--glass-surface-bg)' }}
                >
                  <div
                    className="h-full rounded-lg transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: CATEGORY_COLORS[item.category] || colors.discordPurple,
                    }}
                  />
                </div>
                <span
                  className="text-sm font-medium w-12 text-right"
                  style={{ color: colors.textSecondary }}
                >
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Reflection */}
      {insights?.reflection?.text ? (
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
      ) : insights?.discordServers?.length ? (
        <div
          className="mb-8 rounded-2xl p-4"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4" style={{ color: colors.discordPurple }} />
            <span
              className="text-[11px] font-medium uppercase tracking-[0.08em]"
              style={{ color: '#10b77f' }}
            >
              Twin's Observation
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            Your twin is analyzing your community memberships. Check back soon for insights about your digital social world.
          </p>
        </div>
      ) : null}

      {/* Pattern Observations */}
      {insights?.patterns && insights.patterns.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-[11px] font-medium uppercase tracking-[0.08em] mb-4 flex items-center gap-2"
            style={{ color: '#10b77f' }}
          >
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
          <h3
            className="text-[11px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#10b77f' }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <div
                key={past.id}
                className="rounded-2xl p-4"
                style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                  {past.text}
                </p>
                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                  {new Date(past.generatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!insights?.reflection?.text && !insights?.discordServers?.length && (
        <div className="space-y-4">
          <div
            className="text-center py-12 rounded-2xl"
            style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: colors.discordBg, border: '1px solid rgba(88, 101, 242, 0.2)' }}
            >
              <MessageSquare className="w-8 h-8" style={{ color: colors.discordPurple }} />
            </div>
            <h3
              className="text-xl mb-2"
              style={{ color: colors.text, fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              Your twin is listening in
            </h3>
            <p className="text-sm max-w-sm mx-auto mb-6 leading-relaxed" style={{ color: colors.textSecondary }}>
              As your Discord activity syncs, your twin will uncover what your communities and conversations reveal about your social world.
            </p>
            <button
              onClick={() => navigate('/get-started')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
              style={{ background: '#10b77f' }}
            >
              Connect Discord
            </button>
            <div
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
              style={{ background: colors.discordBg, color: colors.discordPurple, border: '1px solid rgba(88, 101, 242, 0.2)' }}
            >
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: colors.discordPurple }} />
              Collecting your server activity...
            </div>
          </div>
          {/* Preview skeleton */}
          <div aria-hidden="true" className="opacity-40 pointer-events-none space-y-3">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.08em]"
              style={{ color: colors.textSecondary }}
            >
              Preview of your insights
            </p>
            <div
              className="rounded-2xl p-4"
              style={{ border: '1px dashed var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <span className="text-sm" style={{ color: colors.textSecondary }}>Your Communities</span>
              </div>
              <div className="space-y-2">
                {[75, 55, 35].map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: colors.discordBg }} />
                    <div className="flex-1 h-3 rounded animate-pulse" style={{ width: `${w}%`, background: 'var(--glass-surface-bg)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscordInsightsPage;
