/**
 * Ritual Music Page
 *
 * Context-aware music recommendations based on Whoop recovery,
 * calendar events, and current mood from Spotify.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Music,
  Heart,
  Calendar,
  Sparkles,
  PlayCircle,
  RefreshCw,
  ChevronRight,
  Target,
  Zap,
  Moon,
  Sun,
  Brain,
  AlertCircle,
  ExternalLink,
  Headphones
} from 'lucide-react';

// Types
interface WhoopContext {
  recovery: { score: number; label: string } | null;
  strain?: number;
  sleepHours?: number;
  sleepQuality?: string;
  needsReauth?: boolean;
}

interface CalendarEvent {
  title: string;
  start: string;
  type?: string;
  timeUntil?: string;
}

interface SpotifyContext {
  recentMood?: string;
  averageEnergy?: number;
  recentTracksCount?: number;
}

interface UserContext {
  whoop: WhoopContext | null;
  calendar: CalendarEvent | null;
  upcomingEvents: CalendarEvent[];
  spotify: SpotifyContext | null;
  connectedPlatforms: {
    whoop: boolean;
    spotify: boolean;
    calendar: boolean;
  };
  summary?: string;
}

interface Track {
  name: string;
  artists: string;
  albumArt?: string;
  spotifyUrl?: string;
  energy?: number;
  valence?: number;
  reason?: string;
}

interface MusicRecommendation {
  tracks: Track[];
  reasoning: string;
  energyLevel: string;
  contextSummary: string;
}

// Purpose options
const PURPOSES = [
  { id: 'general', label: 'General', icon: Music, description: 'Everyday listening', color: '#8B5CF6' },
  { id: 'focus', label: 'Focus', icon: Brain, description: 'Deep work & concentration', color: '#3B82F6' },
  { id: 'pre-event', label: 'Pre-Event', icon: Zap, description: 'Get energized', color: '#F59E0B' },
  { id: 'workout', label: 'Workout', icon: Target, description: 'Exercise & training', color: '#EF4444' },
  { id: 'relax', label: 'Relax', icon: Sun, description: 'Wind down', color: '#10B981' },
  { id: 'sleep', label: 'Sleep', icon: Moon, description: 'Prepare for rest', color: '#6366F1' },
];

// Suggested purpose from backend learning system
interface SuggestedPurpose {
  id: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  feedbackCount?: number;
  source?: string;
  patternName?: string;
}

// Recovery color based on score
const getRecoveryColor = (score: number) => {
  if (score >= 67) return '#10B981';
  if (score >= 34) return '#F59E0B';
  return '#EF4444';
};

// Main Page Component
const RitualMusicPage: React.FC = () => {
  const { user, isSignedIn, isLoaded } = useAuth();
  const { theme } = useTheme();
  const API_URL = import.meta.env.VITE_API_URL;

  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null);
  const [suggestedPurpose, setSuggestedPurpose] = useState<SuggestedPurpose | null>(null);
  const [userOverridePurpose, setUserOverridePurpose] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [context, setContext] = useState<UserContext | null>(null);
  const [recommendations, setRecommendations] = useState<MusicRecommendation | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme-aware colors
  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e';
  const cardBg = theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)';
  const cardBorder = theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)';
  const cardShadow = theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.06)';
  const hoverBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)';

  // Fetch user context and purpose suggestion from backend
  useEffect(() => {
    const fetchContextAndSuggestion = async () => {
      if (!isSignedIn || !user?.id) return;

      const token = localStorage.getItem('auth_token');
      if (!token) return;

      try {
        setLoadingContext(true);

        // Fetch context and purpose suggestion in parallel
        const [contextResponse, suggestionResponse] = await Promise.all([
          fetch(`${API_URL}/twin/context`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/twin/purpose-suggestion`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        const contextData = await contextResponse.json();
        const suggestionData = await suggestionResponse.json();

        if (contextData.success) {
          // Merge context with connectedPlatforms (which is at top level of response)
          const newContext = {
            ...contextData.context,
            connectedPlatforms: contextData.connectedPlatforms || {
              whoop: !!contextData.context?.whoop,
              spotify: !!contextData.context?.spotify,
              calendar: !!contextData.context?.calendar
            }
          };
          setContext(newContext);
        }

        if (suggestionData.success) {
          // Convert backend confidence (0-1) to frontend confidence level
          const confidenceValue = suggestionData.confidence || 0.5;
          const confidenceLevel: 'high' | 'medium' | 'low' =
            confidenceValue >= 0.7 ? 'high' :
            confidenceValue >= 0.4 ? 'medium' : 'low';

          const suggestion: SuggestedPurpose = {
            id: suggestionData.suggestion,
            reason: suggestionData.reason || 'Based on your context',
            confidence: confidenceLevel,
            feedbackCount: suggestionData.feedbackCount,
            source: suggestionData.source,
            patternName: suggestionData.patternName
          };

          setSuggestedPurpose(suggestion);

          // Auto-select the suggested purpose (unless user already manually selected)
          if (!userOverridePurpose && !initialLoadComplete) {
            setSelectedPurpose(suggestion.id);
            setInitialLoadComplete(true);
          }
        }
      } catch (err) {
        console.error('Error fetching context:', err);
      } finally {
        setLoadingContext(false);
      }
    };

    fetchContextAndSuggestion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, user?.id, API_URL]);

  // Fetch music recommendations
  const fetchMusic = async () => {
    if (!isSignedIn || !user?.id) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      setLoadingMusic(true);
      setError(null);

      const response = await fetch(`${API_URL}/twin/music/${selectedPurpose}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();
      if (data.success) {
        setRecommendations({
          tracks: data.tracks || [],
          reasoning: data.reasoning || '',
          energyLevel: data.recommendedEnergy || 'medium',
          contextSummary: data.contextSummary || ''
        });
      } else {
        setError(data.error || 'Failed to get recommendations');
      }
    } catch (err) {
      console.error('Error fetching music:', err);
      setError('Failed to get music recommendations');
    } finally {
      setLoadingMusic(false);
    }
  };

  // Fetch music on mount and when purpose changes
  useEffect(() => {
    if (isSignedIn && user?.id && selectedPurpose) {
      fetchMusic();
    }
  }, [selectedPurpose, isSignedIn, user?.id]);

  // Loading state - wait for auth to initialize
  if (!isLoaded) {
    return (
      <div className="min-h-screen p-6 md:p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: textMuted }} />
          <p style={{ color: textSecondary }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated state
  if (!isSignedIn) {
    return (
      <div className="min-h-screen p-6 md:p-8 flex items-center justify-center">
        <div
          className="max-w-md w-full rounded-3xl p-8 text-center"
          style={{
            backgroundColor: cardBg,
            border: cardBorder,
            boxShadow: cardShadow
          }}
        >
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
          >
            <AlertCircle className="w-8 h-8" style={{ color: '#F59E0B' }} />
          </div>
          <h2
            className="text-2xl mb-3"
            style={{ fontFamily: 'var(--font-heading)', color: textColor }}
          >
            Sign In Required
          </h2>
          <p className="mb-6" style={{ color: textSecondary }}>
            Please sign in to access personalized music recommendations based on your context.
          </p>
          <button
            onClick={() => window.location.href = '/auth'}
            className="px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-[1.02]"
            style={{
              backgroundColor: '#8B5CF6',
              color: '#ffffff'
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-5xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-3xl md:text-4xl font-normal tracking-tight"
            style={{ fontFamily: 'var(--font-heading)', color: textColor }}
          >
            Ritual Music
          </h1>
          <p className="mt-2 text-sm md:text-base" style={{ color: textSecondary }}>
            Context-aware music for your current moment
          </p>
        </div>
        <button
          onClick={fetchMusic}
          disabled={loadingMusic}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-[1.02]"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            color: textColor,
            border: cardBorder
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loadingMusic ? 'animate-spin' : ''}`} />
          <span className="font-medium">Refresh</span>
        </button>
      </div>

      {/* Context Summary */}
      <div
        className="rounded-2xl md:rounded-3xl p-5 md:p-6"
        style={{
          backgroundColor: cardBg,
          border: cardBorder,
          boxShadow: cardShadow
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: '#8B5CF6' }} />
          </div>
          <div>
            <h2 className="text-lg font-medium" style={{ color: textColor }}>
              Your Current Context
            </h2>
            <p className="text-xs" style={{ color: textMuted }}>
              Data from your connected platforms
            </p>
          </div>
        </div>

        {/* Context Cards Grid */}
        {loadingContext ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="p-4 rounded-xl animate-pulse"
                style={{ backgroundColor: hoverBg }}
              >
                <div className="h-4 w-20 rounded mb-3" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)' }} />
                <div className="h-8 w-28 rounded" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)' }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Recovery Score */}
            <div
              className="p-4 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: context?.whoop
                  ? `${getRecoveryColor(context.whoop.recovery?.score || 0)}10`
                  : hoverBg,
                border: context?.whoop
                  ? `1px solid ${getRecoveryColor(context.whoop.recovery?.score || 0)}25`
                  : `1px solid transparent`
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Heart
                  className="w-4 h-4"
                  style={{ color: context?.whoop ? getRecoveryColor(context.whoop.recovery?.score || 0) : textMuted }}
                />
                <span className="text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                  Recovery
                </span>
              </div>
              {context?.whoop?.recovery ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-2xl font-bold"
                      style={{ color: getRecoveryColor(context.whoop.recovery.score) }}
                    >
                      {context.whoop.recovery.score}%
                    </span>
                    <span className="text-sm" style={{ color: textSecondary }}>
                      {context.whoop.recovery.label}
                    </span>
                  </div>
                  {context.whoop.sleepHours && (
                    <p className="text-xs mt-1" style={{ color: textMuted }}>
                      {context.whoop.sleepHours.toFixed(1)}h sleep last night
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm" style={{ color: textMuted }}>
                  {context?.connectedPlatforms?.whoop ? 'No recent data' : 'Connect Whoop'}
                </p>
              )}
            </div>

            {/* Next Event */}
            <div
              className="p-4 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: context?.calendar ? 'rgba(99, 102, 241, 0.08)' : hoverBg,
                border: context?.calendar ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid transparent'
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar
                  className="w-4 h-4"
                  style={{ color: context?.calendar ? '#6366F1' : textMuted }}
                />
                <span className="text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                  Next Event
                </span>
              </div>
              {context?.calendar ? (
                <>
                  <p className="font-medium truncate" style={{ color: textColor }}>
                    {context.calendar.title}
                  </p>
                  <p className="text-xs mt-1" style={{ color: textMuted }}>
                    {context.calendar.timeUntil || new Date(context.calendar.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </>
              ) : (
                <p className="text-sm" style={{ color: textMuted }}>
                  {context?.connectedPlatforms?.calendar ? 'No upcoming events' : 'Connect Calendar'}
                </p>
              )}
            </div>

            {/* Music Mood */}
            <div
              className="p-4 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: context?.spotify ? 'rgba(29, 185, 84, 0.08)' : hoverBg,
                border: context?.spotify ? '1px solid rgba(29, 185, 84, 0.15)' : '1px solid transparent'
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Music
                  className="w-4 h-4"
                  style={{ color: context?.spotify ? '#1DB954' : textMuted }}
                />
                <span className="text-xs uppercase tracking-wider font-medium" style={{ color: textMuted }}>
                  Music Mood
                </span>
              </div>
              {context?.spotify ? (
                <>
                  <p className="font-medium capitalize" style={{ color: textColor }}>
                    {context.spotify.recentMood || 'Balanced'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: textMuted }}>
                    Energy level: {Math.round((context.spotify.averageEnergy || 0.5) * 100)}%
                  </p>
                </>
              ) : (
                <p className="text-sm" style={{ color: textMuted }}>
                  {context?.connectedPlatforms?.spotify ? 'No recent listening' : 'Connect Spotify'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Context Summary */}
        {context?.summary && (
          <p className="text-sm mt-5 italic px-1" style={{ color: textSecondary }}>
            "{context.summary}"
          </p>
        )}
      </div>

      {/* Purpose Selector */}
      <div
        className="rounded-2xl md:rounded-3xl p-5 md:p-6"
        style={{
          backgroundColor: cardBg,
          border: cardBorder,
          boxShadow: cardShadow
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}
          >
            <Target className="w-5 h-5" style={{ color: '#8B5CF6' }} />
          </div>
          <div>
            <h2 className="text-lg font-medium" style={{ color: textColor }}>
              What's Your Purpose?
            </h2>
            <p className="text-xs" style={{ color: textMuted }}>
              {suggestedPurpose && !userOverridePurpose
                ? 'Auto-selected based on your context — tap another to change'
                : 'Select your activity for tailored recommendations'}
            </p>
          </div>
        </div>

        {/* Suggested Purpose Banner */}
        {suggestedPurpose && !loadingContext && (
          <div
            className="mb-4 p-3 rounded-xl"
            style={{
              backgroundColor: suggestedPurpose.confidence === 'high'
                ? 'rgba(16, 185, 129, 0.08)'
                : suggestedPurpose.confidence === 'medium'
                  ? 'rgba(99, 102, 241, 0.08)'
                  : 'rgba(139, 92, 246, 0.06)',
              border: suggestedPurpose.confidence === 'high'
                ? '1px solid rgba(16, 185, 129, 0.2)'
                : suggestedPurpose.confidence === 'medium'
                  ? '1px solid rgba(99, 102, 241, 0.15)'
                  : '1px solid rgba(139, 92, 246, 0.1)'
            }}
          >
            <div className="flex items-center gap-3">
              <Sparkles
                className="w-4 h-4 flex-shrink-0"
                style={{
                  color: suggestedPurpose.confidence === 'high' ? '#10B981' :
                         suggestedPurpose.confidence === 'medium' ? '#6366F1' : '#8B5CF6'
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium" style={{ color: textColor }}>
                    Suggested for you: <span style={{
                      color: PURPOSES.find(p => p.id === suggestedPurpose.id)?.color || '#8B5CF6'
                    }}>{PURPOSES.find(p => p.id === suggestedPurpose.id)?.label}</span>
                  </p>
                  {/* Personalization indicator */}
                  {suggestedPurpose.feedbackCount !== undefined && suggestedPurpose.feedbackCount > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: suggestedPurpose.source === 'learned_pattern'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(99, 102, 241, 0.15)',
                        color: suggestedPurpose.source === 'learned_pattern'
                          ? '#10B981'
                          : '#6366F1'
                      }}
                    >
                      {suggestedPurpose.source === 'learned_pattern'
                        ? `Pattern: ${suggestedPurpose.patternName?.replace(/_/g, ' ')}`
                        : `Personalized (${suggestedPurpose.feedbackCount} selections)`}
                    </span>
                  )}
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: textMuted }}>
                  {suggestedPurpose.reason}
                </p>
              </div>
              {userOverridePurpose && (
                <button
                  onClick={() => {
                    setUserOverridePurpose(false);
                    setSelectedPurpose(suggestedPurpose.id);
                  }}
                  className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    color: textSecondary
                  }}
                >
                  Use suggestion
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PURPOSES.map(purpose => {
            const Icon = purpose.icon;
            const isSelected = selectedPurpose === purpose.id;
            const isSuggested = suggestedPurpose?.id === purpose.id && !userOverridePurpose;

            return (
              <button
                key={purpose.id}
                onClick={async () => {
                  const previousPurpose = selectedPurpose;
                  setSelectedPurpose(purpose.id);

                  // Mark as manual override if different from suggestion
                  const isOverride = suggestedPurpose && purpose.id !== suggestedPurpose.id;
                  if (isOverride) {
                    setUserOverridePurpose(true);
                  }

                  // Record selection for learning (fire and forget)
                  const token = localStorage.getItem('auth_token');
                  if (token && suggestedPurpose) {
                    fetch(`${API_URL}/twin/purpose-selection`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        suggestedPurpose: suggestedPurpose.id,
                        suggestedConfidence: suggestedPurpose.confidence === 'high' ? 0.8 :
                                             suggestedPurpose.confidence === 'medium' ? 0.5 : 0.3,
                        selectedPurpose: purpose.id
                      })
                    }).catch(err => console.error('Failed to record selection:', err));
                  }
                }}
                className="p-4 rounded-xl text-left transition-all duration-200 hover:scale-[1.02] relative"
                style={{
                  backgroundColor: isSelected ? `${purpose.color}12` : hoverBg,
                  border: isSelected ? `2px solid ${purpose.color}40` : `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                  boxShadow: isSelected ? `0 4px 20px ${purpose.color}15` : 'none'
                }}
              >
                {/* Auto-detected badge */}
                {isSuggested && isSelected && (
                  <div
                    className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      backgroundColor: suggestedPurpose?.confidence === 'high' ? '#10B981' :
                                       suggestedPurpose?.confidence === 'medium' ? '#6366F1' : '#8B5CF6',
                      color: '#ffffff'
                    }}
                  >
                    Auto
                  </div>
                )}
                <Icon
                  className="w-6 h-6 mb-2"
                  style={{ color: isSelected ? purpose.color : textMuted }}
                />
                <p
                  className="font-medium text-sm"
                  style={{ color: isSelected ? purpose.color : textColor }}
                >
                  {purpose.label}
                </p>
                <p className="text-xs mt-0.5 hidden sm:block" style={{ color: textMuted }}>
                  {purpose.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />
          <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
        </div>
      )}

      {/* Recommendations */}
      <div
        className="rounded-2xl md:rounded-3xl p-5 md:p-6"
        style={{
          backgroundColor: cardBg,
          border: cardBorder,
          boxShadow: cardShadow
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(29, 185, 84, 0.1)' }}
            >
              <Headphones className="w-5 h-5" style={{ color: '#1DB954' }} />
            </div>
            <div>
              <h2 className="text-lg font-medium" style={{ color: textColor }}>
                Recommended for You
              </h2>
              <p className="text-xs" style={{ color: textMuted }}>
                Personalized based on your context
              </p>
            </div>
          </div>
          {recommendations?.energyLevel && (
            <span
              className="text-xs px-3 py-1.5 rounded-full font-medium self-start sm:self-auto"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                color: textSecondary
              }}
            >
              Energy: {recommendations.energyLevel}
            </span>
          )}
        </div>

        {/* Why This Music */}
        {recommendations?.reasoning && (
          <div
            className="p-4 rounded-xl mb-5"
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.15)'
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" style={{ color: '#8B5CF6' }} />
              <span className="text-sm font-medium" style={{ color: '#8B5CF6' }}>
                Why This Music?
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: textColor }}>
              {recommendations.reasoning}
            </p>
          </div>
        )}

        {/* Track List */}
        {loadingMusic ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="p-4 rounded-xl animate-pulse"
                style={{ backgroundColor: hoverBg }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)' }} />
                  <div className="flex-1">
                    <div className="h-4 w-40 rounded mb-2" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)' }} />
                    <div className="h-3 w-28 rounded" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : recommendations?.tracks && recommendations.tracks.length > 0 ? (
          <div className="space-y-3">
            {recommendations.tracks.map((track, index) => (
              <div
                key={index}
                className="p-4 rounded-xl flex items-center gap-4 group transition-all duration-200 hover:scale-[1.01]"
                style={{
                  backgroundColor: hoverBg,
                  border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`
                }}
              >
                {/* Album Art or Number */}
                {track.albumArt ? (
                  <img
                    src={track.albumArt}
                    alt={track.name}
                    className="w-14 h-14 rounded-lg object-cover shadow-lg"
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)' }}
                  >
                    <span className="text-lg font-bold" style={{ color: textMuted }}>
                      {index + 1}
                    </span>
                  </div>
                )}

                {/* Track Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: textColor }}>
                    {track.name}
                  </p>
                  <p className="text-sm truncate" style={{ color: textSecondary }}>
                    {track.artists}
                  </p>
                  {track.reason && (
                    <p className="text-xs mt-1 truncate" style={{ color: '#8B5CF6' }}>
                      {track.reason}
                    </p>
                  )}
                </div>

                {/* Energy/Valence Indicators - Hidden on mobile */}
                {(track.energy !== undefined || track.valence !== undefined) && (
                  <div className="hidden md:flex gap-4">
                    {track.energy !== undefined && (
                      <div className="text-center">
                        <div className="text-xs mb-1" style={{ color: textMuted }}>Energy</div>
                        <div
                          className="text-sm font-semibold"
                          style={{ color: track.energy > 0.6 ? '#F59E0B' : track.energy > 0.3 ? '#3B82F6' : '#10B981' }}
                        >
                          {Math.round(track.energy * 100)}%
                        </div>
                      </div>
                    )}
                    {track.valence !== undefined && (
                      <div className="text-center">
                        <div className="text-xs mb-1" style={{ color: textMuted }}>Mood</div>
                        <div
                          className="text-sm font-semibold"
                          style={{ color: track.valence > 0.6 ? '#10B981' : track.valence > 0.3 ? '#F59E0B' : '#6366F1' }}
                        >
                          {Math.round(track.valence * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Play Button */}
                {track.spotifyUrl ? (
                  <a
                    href={track.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-full transition-all duration-200 opacity-60 group-hover:opacity-100 hover:scale-110"
                    style={{ backgroundColor: 'rgba(29, 185, 84, 0.1)' }}
                    title="Play on Spotify"
                  >
                    <PlayCircle className="w-6 h-6" style={{ color: '#1DB954' }} />
                  </a>
                ) : (
                  <div className="w-10" /> // Spacer
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: hoverBg }}
            >
              <Music className="w-8 h-8" style={{ color: textMuted }} />
            </div>
            <p className="text-lg font-medium mb-2" style={{ color: textColor }}>
              {context?.connectedPlatforms?.spotify
                ? 'Select a purpose to get started'
                : 'Connect Spotify for recommendations'}
            </p>
            <p className="text-sm mb-6" style={{ color: textSecondary }}>
              {context?.connectedPlatforms?.spotify
                ? 'Choose an activity above and we\'ll curate the perfect playlist'
                : 'Link your Spotify account to receive personalized music suggestions'}
            </p>
            {!context?.connectedPlatforms?.spotify && (
              <button
                onClick={() => window.location.href = '/get-started'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: '#1DB954',
                  color: '#ffffff'
                }}
              >
                Connect Spotify
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Note */}
      <div
        className="text-center py-4 px-6 rounded-xl"
        style={{
          backgroundColor: hoverBg,
          border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.03)'}`
        }}
      >
        <p className="text-xs" style={{ color: textMuted }}>
          Suggestions learn from your choices and improve over time.
          <br className="hidden sm:block" />
          The more you use Ritual Music, the better it understands your preferences.
        </p>
      </div>
    </div>
  );
};

export default RitualMusicPage;
