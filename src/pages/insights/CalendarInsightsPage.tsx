/**
 * Calendar Insights Page
 *
 * "Time Patterns" - Conversational reflections from your twin
 * about what your schedule reveals about your priorities and rhythms.
 *
 * NO meeting counts. NO time stats. Just observations about time.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Calendar, RefreshCw, Sparkles, ArrowLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext;
  error?: string;
}

const CalendarInsightsPage: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Theme colors
  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e',
    calendarBlue: '#4285F4',
    calendarBg: theme === 'dark' ? 'rgba(66, 133, 244, 0.15)' : 'rgba(66, 133, 244, 0.1)'
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) {
      setError('Please sign in to see your time patterns');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/calendar`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const data = await response.json();

      if (data.success) {
        setInsights(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to load insights');
      }
    } catch (err) {
      console.error('Failed to fetch Calendar insights:', err);
      setError('Unable to read your time patterns right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const authToken = token || localStorage.getItem('auth_token');

    try {
      await fetch(`${API_BASE}/insights/calendar/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <RefreshCw
            className="w-8 h-8 animate-spin"
            style={{ color: colors.text }}
          />
          <p style={{ color: colors.textSecondary }}>
            Understanding your relationship with time...
          </p>
        </div>
      </PageLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle
            className="w-12 h-12"
            style={{ color: colors.textSecondary }}
          />
          <p style={{ color: colors.textSecondary }}>{error}</p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg glass-button"
            style={{ color: colors.text }}
          >
            Connect Calendar
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
          {/* Back Button */}
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg glass-button"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
          </button>

          {/* Platform Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.calendarBg }}
          >
            <Calendar className="w-6 h-6" style={{ color: colors.calendarBlue }} />
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-2xl"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: colors.text
              }}
            >
              Time Patterns
            </h1>
            <p
              className="text-sm"
              style={{ color: colors.textSecondary }}
            >
              How you structure your days
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg glass-button"
          title="Get a fresh observation"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: colors.text }}
          />
        </button>
      </div>

      {/* Primary Reflection */}
      {insights?.reflection && (
        <div className="mb-8">
          <TwinReflection
            reflection={insights.reflection.text}
            timestamp={insights.reflection.generatedAt}
            confidence={insights.reflection.confidence}
            isNew={true}
          />
          {/* Evidence Section - Collapsible */}
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection
              evidence={insights.evidence}
              crossPlatformContext={insights.crossPlatformContext}
              className="mt-4"
            />
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
          <h3
            className="text-sm uppercase tracking-wider mb-4"
            style={{ color: colors.textSecondary }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <GlassPanel key={past.id} variant="default" className="!p-4">
                <p
                  className="text-sm italic"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
                >
                  "{past.text}"
                </p>
                <p
                  className="text-xs mt-2"
                  style={{ color: colors.textSecondary }}
                >
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
          <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
            Your twin is studying your schedule
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As your calendar fills with events, your twin will notice patterns in how you structure your time.
          </p>
        </GlassPanel>
      )}
    </PageLayout>
  );
};

export default CalendarInsightsPage;
