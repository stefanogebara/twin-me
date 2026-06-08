/**
 * Web Browsing Insights Page
 *
 * "Your Digital Life" - Visual insights from your twin
 * about what your browsing patterns reveal about you.
 */

import React from 'react';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { WebBrowsingSkeleton } from './components/WebBrowsingSkeleton';
import { WebBrowsingErrorState } from './components/WebBrowsingErrorState';
import { WebBrowsingCharts } from './components/WebBrowsingCharts';
import type { InsightsResponse } from './components/webBrowsingTypes';
import { Globe, RefreshCw, Layout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WebBrowsingInsightsPage: React.FC = () => {
  useDocumentTitle('Web Browsing Insights');

  const navigate = useNavigate();

  const { insights, loading, generating, refreshing, error, refresh } =
    usePlatformInsights<InsightsResponse>('web', 'Please sign in to see your digital life insights');

  const colors = {
    text: 'var(--foreground)',
    textSecondary: 'rgba(255,255,255,0.4)',
    webAccent: '#6366f1',
    webBg: 'rgba(99, 102, 241, 0.1)'
  };

  if (loading || generating) {
    return <WebBrowsingSkeleton />;
  }

  if (error) {
    return <WebBrowsingErrorState colors={colors} navigate={navigate} />;
  }

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontSize: '28px', fontWeight: 400, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
          Your Digital Life
        </h1>
        <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg transition-opacity hover:opacity-60" style={{ color: 'rgba(255,255,255,0.3)' }} title="Refresh">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        What your browsing reveals about you
      </p>
      <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-8" />

      {/* Extension Install Banner */}
      {!insights?.hasExtensionData && (
        <div
          className="p-4 mb-6 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${colors.webAccent}` }}
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
          </div>
        </div>
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
            className="text-xs uppercase tracking-wider mb-4"
            style={{ color: '#10b77f', fontVariant: 'small-caps', letterSpacing: '0.08em' }}
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
            className="text-xs uppercase tracking-wider mb-4"
            style={{ color: '#10b77f', fontVariant: 'small-caps', letterSpacing: '0.08em' }}
          >
            Past Observations
          </h3>
          <div className="space-y-3">
            {insights.history.map(past => (
              <div
                key={past.id}
                className="p-4 rounded-xl"
                style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
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
      {!insights?.reflection && (
        <div
          className="text-center py-12 rounded-xl"
          style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <Globe className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Your twin is exploring
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As your browsing data flows in, your twin will discover patterns and share observations about your digital life.
          </p>
        </div>
      )}
    </div>
  );
};

export default WebBrowsingInsightsPage;
