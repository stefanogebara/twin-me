/**
 * Spotify Insights Page
 *
 * "Your Musical Soul" - Visual, engaging insights from your twin
 * about what your music patterns reveal about you.
 *
 * REDESIGNED: Visual variety, specific data, no textbook style
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Music, RefreshCw, Sparkles, ArrowLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDemoSpotifyData } from '@/services/demoDataService';
import { toast } from 'sonner';
import type { InsightsResponse } from './components/spotifyTypes';
import { SpotifySkeleton } from './components/SpotifySkeleton';
import { SpotifyCharts } from './components/SpotifyCharts';
import { SpotifyEmptyState } from './components/SpotifyEmptyState';

const SpotifyInsightsPage: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { isDemoMode } = useDemo();
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
    spotifyGreen: '#1DB954',
    spotifyBg: theme === 'dark' ? 'rgba(29, 185, 84, 0.15)' : 'rgba(29, 185, 84, 0.1)'
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

    const authToken = token || localStorage.getItem('auth_token');
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

    const authToken = token || localStorage.getItem('auth_token');

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

  // Skeleton loader component (kept for error state usage)
  const SkeletonPulse = ({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        ...style
      }}
    />
  );

  // Loading state with skeleton loaders
  if (loading) {
    return <SpotifySkeleton theme={theme} />;
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
            Connect Spotify
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

          {/* Platform Icon */}
          <motion.div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.spotifyBg }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          >
            <Music className="w-6 h-6" style={{ color: colors.spotifyGreen }} />
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <h1
              className="text-2xl"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: colors.text
              }}
            >
              Your Musical Soul
            </h1>
            <p
              className="text-sm"
              style={{ color: colors.textSecondary }}
            >
              What your listening reveals
            </p>
          </motion.div>
        </div>

        {/* Refresh Button */}
        <motion.button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg glass-button"
          title="Get a fresh observation"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: colors.text }}
          />
        </motion.button>
      </div>

      {/* Charts: Recent Tracks, Top Artists, Genre Distribution, Listening Hours, Current Mood */}
      {insights && (
        <SpotifyCharts insights={insights} colors={colors} theme={theme} />
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
        <GlassPanel className="mb-8 !p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: colors.spotifyGreen }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              Twin's Observation
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            Your twin is processing observations about your listening patterns. Check back soon for personalized insights about your musical soul.
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
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
                >
                  {past.text}
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

      {/* Empty State - show when no reflection AND no music data */}
      {!insights?.reflection?.text && !insights?.recentTracks?.length && !insights?.topArtistsWithPlays?.length && (
        <SpotifyEmptyState colors={colors} theme={theme} navigate={navigate} />
      )}
    </PageLayout>
  );
};

export default SpotifyInsightsPage;
