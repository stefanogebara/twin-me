/**
 * Spotify Insights Page
 *
 * "Your Musical Soul" - Visual, engaging insights from your twin
 * about what your music patterns reveal about you.
 *
 * REDESIGNED: Visual variety, specific data, no textbook style
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { TwinReflection, PatternObservation, DataHighlight, TrackCard } from './components/TwinReflection';
import { EvidenceSection } from './components/EvidenceSection';
import { Music, RefreshCw, Sparkles, ArrowLeft, AlertCircle, Disc3, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDemoSpotifyData } from '@/services/demoDataService';

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

interface RecentTrack {
  name: string;
  artist: string;
  playedAt?: string;
}

interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext;
  // New: Specific data for visual display
  recentTracks?: RecentTrack[];
  topArtists?: string[];
  currentMood?: {
    label: string;
    energy: number;
    valence: number;
  };
  error?: string;
}

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
        playedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      })),
      topArtists: spotifyData.topArtists.map(a => a.name),
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
    } finally {
      setRefreshing(false);
    }
  };

  // Skeleton loader component
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
    return (
      <PageLayout>
        {/* Skeleton: Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <SkeletonPulse className="w-10 h-10 rounded-lg" />
            <SkeletonPulse className="w-12 h-12 rounded-xl" />
            <div>
              <SkeletonPulse className="h-7 w-40 mb-2" />
              <SkeletonPulse className="h-4 w-32" />
            </div>
          </div>
          <SkeletonPulse className="w-10 h-10 rounded-lg" />
        </div>

        {/* Skeleton: Recent Tracks */}
        <div className="mb-6">
          <SkeletonPulse className="h-4 w-32 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <GlassPanel key={i} className="!p-3">
                <div className="flex items-center gap-3">
                  <SkeletonPulse className="w-10 h-10 rounded" />
                  <div className="flex-1">
                    <SkeletonPulse className="h-4 w-32 mb-1" />
                    <SkeletonPulse className="h-3 w-24" />
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>

        {/* Skeleton: Top Artists */}
        <GlassPanel className="mb-6 !p-4">
          <SkeletonPulse className="h-4 w-40 mb-3" />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map(i => (
              <SkeletonPulse key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </GlassPanel>

        {/* Skeleton: Reflection */}
        <GlassPanel className="mb-8">
          <SkeletonPulse className="h-4 w-24 mb-4" />
          <SkeletonPulse className="h-5 w-full mb-2" />
          <SkeletonPulse className="h-5 w-4/5 mb-2" />
          <SkeletonPulse className="h-5 w-3/5" />
        </GlassPanel>

        {/* Skeleton: Patterns */}
        <div>
          <SkeletonPulse className="h-4 w-36 mb-4" />
          <div className="space-y-3">
            {[1, 2].map(i => (
              <GlassPanel key={i} className="!p-4">
                <SkeletonPulse className="h-4 w-full mb-1" />
                <SkeletonPulse className="h-3 w-16" />
              </GlassPanel>
            ))}
          </div>
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
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg glass-button"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
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

      {/* Recent Tracks Section - Visual data display */}
      {insights?.recentTracks && insights.recentTracks.length > 0 && (
        <div className="mb-6">
          <h3
            className="text-sm uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: colors.textSecondary }}
          >
            <Disc3 className="w-4 h-4" style={{ color: colors.spotifyGreen }} />
            Recently Playing
          </h3>
          <div className="space-y-2">
            {insights.recentTracks.slice(0, 3).map((track, index) => (
              <TrackCard
                key={index}
                name={track.name}
                artist={track.artist}
                context={index === 0 ? 'Latest' : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top Artists - Visual data highlight */}
      {insights?.topArtists && insights.topArtists.length > 0 && (
        <div className="mb-6">
          <DataHighlight
            label="Artists You Gravitate Toward"
            items={insights.topArtists}
            icon={<Users className="w-4 h-4" />}
            accentColor={colors.spotifyGreen}
          />
        </div>
      )}

      {/* Current Mood - Visual indicator */}
      {insights?.currentMood && (
        <GlassPanel className="mb-6 !p-4">
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-xs uppercase tracking-wider"
                style={{ color: colors.textSecondary }}
              >
                Current Musical Mood
              </span>
              <div
                className="text-lg font-medium mt-1"
                style={{ color: colors.text }}
              >
                {insights.currentMood.label}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div
                  className="text-xs mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Energy
                </div>
                <div
                  className="w-12 h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'rgba(193, 192, 182, 0.1)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(insights.currentMood.energy || 0.5) * 100}%`,
                      backgroundColor: colors.spotifyGreen
                    }}
                  />
                </div>
              </div>
              <div className="text-center">
                <div
                  className="text-xs mb-1"
                  style={{ color: colors.textSecondary }}
                >
                  Positivity
                </div>
                <div
                  className="w-12 h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'rgba(193, 192, 182, 0.1)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(insights.currentMood.valence || 0.5) * 100}%`,
                      backgroundColor: '#fbbf24'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </GlassPanel>
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

      {/* Empty State - When no reflection yet */}
      {!insights?.reflection && (
        <GlassPanel className="text-center py-12">
          <Music className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
          <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
            Your twin is listening
          </h3>
          <p className="mt-2" style={{ color: colors.textSecondary }}>
            As you listen to music, your twin will notice patterns and share observations.
          </p>
        </GlassPanel>
      )}
    </PageLayout>
  );
};

export default SpotifyInsightsPage;
