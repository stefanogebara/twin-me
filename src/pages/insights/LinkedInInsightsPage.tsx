/**
 * LinkedIn Insights Page
 *
 * "Your Professional Self" - Conversational reflections from your twin
 * about what your professional profile reveals about your identity.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { getAccessToken } from '@/services/api/apiBase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { Briefcase, AlertCircle, MapPin, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDemoLinkedInInsights } from '@/services/demoDataService';
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

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  linkedinHeadline?: string;
  linkedinIndustry?: string;
  linkedinLocale?: string;
  linkedinSkills?: string[];
  linkedinConnectionCount?: number;
}

const LinkedInInsightsPage: React.FC = () => {
  useDocumentTitle('LinkedIn Insights');

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
    linkedinBlue: '#0A66C2',
    linkedinBg: 'rgba(10, 102, 194, 0.1)',
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    if (isDemoMode) {
      setError(null);
      setInsights(getDemoLinkedInInsights());
      setLoading(false);
      return;
    }

    const authToken = token || getAccessToken();
    if (!authToken) {
      setError('Please sign in to see your professional insights');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/linkedin`, {
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
      console.error('Failed to fetch LinkedIn insights:', err);
      setError('Unable to read your professional profile right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoLinkedInInsights());
        setRefreshing(false);
      }, 800);
      return;
    }

    const authToken = token || getAccessToken();

    try {
      await fetch(`${API_BASE}/insights/linkedin/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      toast.error('Refresh failed', {
        description: 'Unable to refresh LinkedIn insights. Please try again.',
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
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
            style={{ backgroundColor: '#10b77f' }}
          >
            Connect LinkedIn
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      <InsightsPageHeader
        title="Your Professional Self"
        subtitle="What your career signals say about you"
        icon={<Briefcase className="w-6 h-6" style={{ color: colors.linkedinBlue }} />}
        iconColor={colors.linkedinBlue}
        iconBgColor={colors.linkedinBg}
        textColor={colors.text}
        textSecondaryColor={colors.textSecondary}
        onBack={() => navigate('/dashboard')}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      {/* Professional Profile Card */}
      {(insights?.linkedinHeadline || insights?.linkedinIndustry) && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          {insights.linkedinHeadline && (
            <p
              className="text-lg font-medium mb-3"
              style={{ color: colors.text, fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              &ldquo;{insights.linkedinHeadline}&rdquo;
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-sm" style={{ color: colors.textSecondary }}>
            {insights.linkedinIndustry && (
              <div className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>{insights.linkedinIndustry}</span>
              </div>
            )}
            {insights.linkedinLocale && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>{insights.linkedinLocale}</span>
              </div>
            )}
            {insights.linkedinConnectionCount != null && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{insights.linkedinConnectionCount}+ connections</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skills */}
      {insights?.linkedinSkills && insights.linkedinSkills.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <h3
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: '#10b77f', fontVariant: 'small-caps' }}
          >
            Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.linkedinSkills.map((skill, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: colors.linkedinBg,
                  color: colors.linkedinBlue,
                  border: `1px solid rgba(10, 102, 194, 0.25)`,
                }}
              >
                {skill}
              </span>
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
      ) : insights?.linkedinHeadline ? (
        <div
          className="rounded-2xl p-4 mb-8"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <h3
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#10b77f', fontVariant: 'small-caps' }}
          >
            Twin&rsquo;s Observation
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            Your twin is reading your professional signals. Check back soon for insights about your career identity.
          </p>
        </div>
      ) : null}

      {/* Pattern Observations */}
      {insights?.patterns && insights.patterns.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-xs font-medium uppercase tracking-wider mb-4"
            style={{ color: '#10b77f', fontVariant: 'small-caps' }}
          >
            Patterns I&rsquo;ve Noticed
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
            className="text-xs font-medium uppercase tracking-wider mb-4"
            style={{ color: '#10b77f', fontVariant: 'small-caps' }}
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
      {!insights?.reflection?.text && !insights?.linkedinHeadline && (
        <div className="space-y-4">
          <div
            className="rounded-2xl text-center py-12 px-6"
            style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: colors.linkedinBg, border: '1px solid rgba(10, 102, 194, 0.2)' }}
            >
              <Briefcase className="w-8 h-8" style={{ color: colors.linkedinBlue }} />
            </div>
            <h3
              className="text-xl mb-2"
              style={{ color: colors.text, fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              Your professional story awaits
            </h3>
            <p className="text-sm max-w-sm mx-auto mb-6 leading-relaxed" style={{ color: colors.textSecondary }}>
              Connect LinkedIn and your twin will decode what your career trajectory, skills, and network reveal about your ambitions and professional identity.
            </p>
            <button
              onClick={() => navigate('/get-started')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#10b77f' }}
            >
              Connect LinkedIn
            </button>
            <div
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
              style={{ background: colors.linkedinBg, color: colors.linkedinBlue, border: '1px solid rgba(10, 102, 194, 0.2)' }}
            >
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: colors.linkedinBlue }} />
              Awaiting your profile data...
            </div>
          </div>
          {/* Preview skeleton */}
          <div aria-hidden="true" className="opacity-40 pointer-events-none space-y-3">
            <p
              className="text-xs uppercase tracking-wider"
              style={{ color: colors.textSecondary, fontVariant: 'small-caps' }}
            >
              Preview of your insights
            </p>
            <div
              className="rounded-2xl p-4"
              style={{ border: '1px dashed var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <span className="text-sm" style={{ color: colors.textSecondary }}>Career Profile</span>
              </div>
              <div className="space-y-3">
                <div className="h-4 rounded animate-pulse" style={{ width: '70%', background: 'var(--glass-surface-bg)' }} />
                <div className="h-3 rounded animate-pulse" style={{ width: '50%', background: 'rgba(255,255,255,0.04)' }} />
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-6 w-20 rounded-full animate-pulse" style={{ background: colors.linkedinBg }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInInsightsPage;
