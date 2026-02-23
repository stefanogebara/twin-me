/**
 * LinkedIn Insights Page
 *
 * "Your Professional Self" - Conversational reflections from your twin
 * about what your professional profile reveals about your identity.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { InsightsPageHeader } from './components/InsightsPageHeader';
import { Briefcase, Sparkles, AlertCircle, MapPin, Users } from 'lucide-react';
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
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const colors = {
    text: '#000000',
    textSecondary: '#8A857D',
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

    const authToken = token || localStorage.getItem('auth_token');
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

    const authToken = token || localStorage.getItem('auth_token');

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
      <PageLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-stone-100 rounded-xl" />
          <div className="h-32 bg-stone-100 rounded-xl" />
          <div className="h-48 bg-stone-100 rounded-xl" />
        </div>
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
            Connect LinkedIn
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
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
        <GlassPanel className="!p-5 mb-6">
          {insights.linkedinHeadline && (
            <p
              className="text-lg font-medium mb-3"
              style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}
            >
              "{insights.linkedinHeadline}"
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
        </GlassPanel>
      )}

      {/* Skills */}
      {insights?.linkedinSkills && insights.linkedinSkills.length > 0 && (
        <GlassPanel className="!p-4 mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-3"
            style={{ color: colors.textSecondary }}
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
        </GlassPanel>
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
        <GlassPanel className="mb-8 !p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: colors.linkedinBlue }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Twin's Observation
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            Your twin is reading your professional signals. Check back soon for insights about your career identity.
          </p>
        </GlassPanel>
      ) : null}

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
          <h3
            className="text-sm uppercase tracking-wider mb-4"
            style={{ color: colors.textSecondary }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <GlassPanel key={past.id} variant="default" className="!p-4">
                <p className="text-sm leading-relaxed" style={{ color: '#57534e' }}>
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
      {!insights?.reflection?.text && !insights?.linkedinHeadline && (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center">
          <Briefcase className="w-12 h-12" style={{ color: colors.textSecondary }} />
          <p className="text-lg" style={{ color: colors.text }}>
            No LinkedIn data yet
          </p>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Connect LinkedIn to see what your professional profile reveals about you.
          </p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg glass-button"
            style={{ color: colors.text }}
          >
            Connect LinkedIn
          </button>
        </div>
      )}
    </PageLayout>
  );
};

export default LinkedInInsightsPage;
