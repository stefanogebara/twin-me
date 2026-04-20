/**
 * Spotify Insights Page
 *
 * "Your Musical Soul" - Visual, engaging insights from your twin
 * about what your music patterns reveal about you.
 *
 * REDESIGNED: Typography-driven dark design system
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getAccessToken } from '@/services/api/apiBase';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Music, RefreshCw, ArrowLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDemoSpotifyData } from '@/services/demoDataService';
import { toast } from 'sonner';
import type { InsightsResponse } from './components/spotifyTypes';
import { SpotifySkeleton } from './components/SpotifySkeleton';
import { SpotifyCharts } from './components/SpotifyCharts';
import { SpotifyEmptyState } from './components/SpotifyEmptyState';

const SpotifyInsightsPage: React.FC = () => {
  useDocumentTitle('Spotify Insights');

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
    spotifyGreen: '#1DB954',
    spotifyBg: 'rgba(29, 185, 84, 0.1)'
  };

  // Generate demo insights data
  const getDemoInsights = (): InsightsResponse => {
    const spotifyData = getDemoSpotifyData();
    return {
      success: true,
      reflection: {
        id: 'demo-reflection-1',
        text: `Your musical soul reveals a curious explorer. You gravitate toward ${spotifyData.topGenres[0]?.genre || 'ambient'} sounds, especially during ${spotifyData.listeningHabits.peakHours}. Your recent listening shows a ${spotifyData.recentMood} energy - your twin notices you use music to match and shift your mood throughout the day.`,
        generatedAt: new Date().toISOString(),
        expiresAt: null,
        confidence: 'high',
        themes: ['mood', 'discovery', 'patterns'],
      },
      patterns: [
        {
          id: 'pattern-1',
          text: `You tend to listen to more energetic music in the morning and wind down with ambient tracks after ${spotifyData.listeningHabits.peakHours.includes('pm') ? 'work' : 'evening activities'}.`,
          occurrences: 'often',
        },
        {
          id: 'pattern-2',
          text: `Your skip rate of ${spotifyData.listeningHabits.skipRate} suggests you know what you like - you're selective but committed once you find the right track.`,
          occurrences: 'sometimes',
        },
        {
          id: 'pattern-3',
          text: `${spotifyData.listeningHabits.weekdayVsWeekend} - your listening habits shift based on your schedule.`,
          occurrences: 'noticed',
        },
      ],
      history: [
        {
          id: 'history-1',
          text: 'Your recent shift toward more instrumental music correlates with your calendar showing more deep work blocks.',
          generatedAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      evidence: [
        {
          id: 'evidence-1',
          observation: `${spotifyData.topArtists[0]?.name} dominates your recent plays`,
          dataPoints: [`${spotifyData.topArtists[0]?.plays || 500}+ plays`, `Top genre: ${spotifyData.topArtists[0]?.genre || 'Electronic'}`],
          confidence: 'high',
        },
      ],
      recentTracks: spotifyData.topTracks.slice(0, 5).map(track => ({
        name: track.name,
        artist: track.artist,
        playedAt: track.playedAt,
      })),
      topArtists: spotifyData.topArtists.map(a => a.name),
      topArtistsWithPlays: spotifyData.topArtists,
      topGenres: spotifyData.topGenres,
      listeningHours: spotifyData.listeningHours,
      currentMood: {
        label: spotifyData.recentMood.charAt(0).toUpperCase() + spotifyData.recentMood.slice(1),
        energy: spotifyData.averageEnergy,
        valence: Math.random() * 0.4 + 0.4,
      },
    };
  };

  useEffect(() => {
    fetchInsights();
  }, [isDemoMode]);

  const fetchInsights = async () => {
    // Handle demo mode - return demo data
    if (isDemoMode) {
      setInsights(getDemoInsights());
      setLoading(false);
      return;
    }

    const authToken = token || getAccessToken();
    if (!authToken) {
      setError('Please sign in to see your musical soul');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/insights/spotify`, {
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
      console.error('Failed to fetch Spotify insights:', err);
      setError('Unable to connect to your musical soul right now');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    // In demo mode, just regenerate demo data
    if (isDemoMode) {
      setTimeout(() => {
        setInsights(getDemoInsights());
        setRefreshing(false);
      }, 800); // Simulate loading
      return;
    }

    const authToken = token || getAccessToken();

    try {
      await fetch(`${API_BASE}/insights/spotify/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      await fetchInsights();
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      toast.error('Refresh failed', { description: 'Unable to refresh Spotify insights. Please try again.' });
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state with skeleton loaders
  if (loading) {
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
          onClick={handleRefresh}
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
        <SpotifyEmptyState colors={colors} navigate={navigate} />
      )}
    </div>
  );
};

export default SpotifyInsightsPage;
