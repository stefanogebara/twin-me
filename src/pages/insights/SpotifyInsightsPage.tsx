/**
 * Spotify Insights Page
 *
 * "Your Musical Soul" - Visual, engaging insights from your twin
 * about what your music patterns reveal about you.
 *
 * REDESIGNED: Typography-driven dark design system
 */

import React from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePlatformInsights } from '@/hooks/usePlatformInsights';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Music, RefreshCw, ArrowLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { InsightsResponse } from './components/spotifyTypes';
import { SpotifySkeleton } from './components/SpotifySkeleton';
import { SpotifyCharts } from './components/SpotifyCharts';
import { SpotifyEmptyState } from './components/SpotifyEmptyState';

const SpotifyInsightsPage: React.FC = () => {
  useDocumentTitle('Spotify Insights');

  const navigate = useNavigate();
  const { insights, loading, generating, refreshing, error, refresh } =
    usePlatformInsights<InsightsResponse>('spotify', 'Please sign in to see your musical soul');

  const colors = {
    text: 'var(--foreground)',
    textSecondary: 'rgba(255,255,255,0.4)',
    spotifyGreen: '#1DB954',
    spotifyBg: 'rgba(29, 185, 84, 0.1)'
  };

  // Loading / generating: show the skeleton while the twin's reflection is
  // generated in the background (cold cache) rather than a misleading empty state.
  if (loading || generating) {
    return <SpotifySkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle
            className="w-12 h-12"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          />
          <p
            style={{
              color: colors.textSecondary,
              fontFamily: "'Inter', sans-serif"
            }}
          >
            {error}
          </p>
          <button
            onClick={() => navigate('/get-started')}
            className="px-4 py-2 rounded-lg"
            style={{
              backgroundColor: '#10b77f',
              color: '#0a0f0a',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500
            }}
          >
            Connect Spotify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {/* Back Button */}
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg"
            style={{
              border: '1px solid var(--border)',
              color: 'rgba(255,255,255,0.5)'
            }}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Platform Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.spotifyBg }}
          >
            <Music className="w-6 h-6" style={{ color: colors.spotifyGreen }} />
          </div>

          {/* Title */}
          <div>
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                fontStyle: 'italic',
                fontFamily: "'Instrument Serif', serif",
                color: colors.text
              }}
            >
              Your Musical Soul
            </h1>
            <p
              className="text-sm"
              style={{
                color: colors.textSecondary,
                fontFamily: "'Inter', sans-serif"
              }}
            >
              What your listening reveals
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={refresh}
          disabled={refreshing}
          className="p-2 rounded-lg"
          title="Get a fresh observation"
          style={{
            border: '1px solid var(--border)',
            color: 'rgba(255,255,255,0.5)'
          }}
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Charts: Recent Tracks, Top Artists, Genre Distribution, Listening Hours, Current Mood */}
      {insights && (
        <SpotifyCharts insights={insights} colors={colors} />
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
          {/* Evidence Section - Collapsible */}
          {insights?.evidence && insights.evidence.length > 0 && (
            <EvidenceSection
              evidence={insights.evidence}
              crossPlatformContext={insights.crossPlatformContext}
              className="mt-4"
            />
          )}
        </div>
      ) : (insights?.recentTracks?.length || insights?.topArtistsWithPlays?.length) ? (
        <div
          className="mb-8 p-4 rounded-lg"
          style={{
            border: '1px solid var(--border-glass)',
            backgroundColor: 'rgba(255,255,255,0.02)'
          }}
        >
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-2"
            style={{ color: '#10b77f' }}
          >
            Twin's Observation
          </span>
          <p
            className="text-sm leading-relaxed"
            style={{
              color: colors.textSecondary,
              fontFamily: "'Inter', sans-serif"
            }}
          >
            Your twin is processing observations about your listening patterns. Check back soon for personalized insights about your musical soul.
          </p>
        </div>
      ) : null}

      {/* Pattern Observations */}
      {insights?.patterns && insights.patterns.length > 0 && (
        <div className="mb-8">
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Patterns I've Noticed
          </span>
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
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: '#10b77f' }}
          >
            Past Observations
          </span>
          <div className="space-y-3">
            {insights.history.map(past => (
              <div
                key={past.id}
                className="p-4 rounded-lg"
                style={{
                  border: '1px solid var(--border-glass)',
                  backgroundColor: 'rgba(255,255,255,0.02)'
                }}
              >
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  {past.text}
                </p>
                <p
                  className="text-xs mt-2"
                  style={{
                    color: 'rgba(255,255,255,0.3)',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  {new Date(past.generatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State - show when no reflection AND no music data */}
      {!insights?.reflection?.text && !insights?.recentTracks?.length && !insights?.topArtistsWithPlays?.length && (
        <SpotifyEmptyState colors={colors} navigate={navigate} notConnected={insights?.notConnected === true} />
      )}
    </div>
  );
};

export default SpotifyInsightsPage;
