/**
 * Today's Twin - Main MVP Landing Experience
 * Shows your next important event and personalized ritual suggestion
 * Demonstrates core value: "You have interesting patterns about yourself you don't even know"
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { GlassPanel } from '../components/layout/PageLayout';
import {
  Calendar,
  Music,
  Clock,
  AlertCircle,
  Sparkles,
  Users,
  Timer,
  ChevronRight,
  Play,
  Activity,
  Zap,
  Brain,
  ArrowRight,
  CheckCircle,
  XCircle,
  Headphones,
  Volume2,
  Radio,
  Disc
} from 'lucide-react';

interface NextEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: number;
  importanceScore: number;
  type: string;
}

interface RitualSuggestion {
  startTime: string;
  minutesBeforeEvent: number;
  suggestedTracks: Array<{
    name: string;
    artist: string;
    duration: number;
    energy: number;
  }>;
  genre: string;
  mood: string;
  confidence: number;
  basedOnPattern: string;
}

export default function TodaysTwin() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  const [ritual, setRitual] = useState<RitualSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ritualStarted, setRitualStarted] = useState(false);
  const [timeToEvent, setTimeToEvent] = useState<string>('');
  const [timeToRitual, setTimeToRitual] = useState<string>('');

  useEffect(() => {
    fetchNextEvent();
  }, []);

  useEffect(() => {
    // Update countdown timers every minute
    const timer = setInterval(() => {
      if (nextEvent) {
        updateCountdowns();
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [nextEvent, ritual]);

  const updateCountdowns = () => {
    if (!nextEvent) return;

    const now = new Date();
    const eventTime = new Date(nextEvent.start);
    const diffMs = eventTime.getTime() - now.getTime();

    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeToEvent(`${days} day${days > 1 ? 's' : ''}`);
      } else if (hours > 0) {
        setTimeToEvent(`${hours}h ${minutes}m`);
      } else {
        setTimeToEvent(`${minutes} minutes`);
      }

      if (ritual) {
        const ritualTime = new Date(ritual.startTime);
        const ritualDiffMs = ritualTime.getTime() - now.getTime();

        if (ritualDiffMs > 0) {
          const ritualHours = Math.floor(ritualDiffMs / (1000 * 60 * 60));
          const ritualMinutes = Math.floor((ritualDiffMs % (1000 * 60 * 60)) / (1000 * 60));

          if (ritualHours > 0) {
            setTimeToRitual(`Start in ${ritualHours}h ${ritualMinutes}m`);
          } else {
            setTimeToRitual(`Start in ${ritualMinutes} minutes`);
          }
        } else {
          setTimeToRitual('Start now');
        }
      }
    } else {
      setTimeToEvent('Event in progress');
      setTimeToRitual('');
    }
  };

  const fetchNextEvent = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('http://localhost:3001/api/presentation-ritual/next', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch next event');
      }

      const data = await response.json();

      if (data.success && data.nextEvent) {
        setNextEvent(data.nextEvent);
        setRitual(data.ritualSuggestion);
        updateCountdowns();
      } else {
        // No upcoming events
        setNextEvent(null);
        setRitual(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const startRitual = () => {
    setRitualStarted(true);
    // In a real implementation, this would connect to Spotify and start playing
    // For MVP, we'll just show a confirmation
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA',
      }}
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Subtle Background - matching platform style */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: theme === 'dark'
                ? 'radial-gradient(ellipse at top, rgba(193, 192, 182, 0.08) 0%, transparent 50%)'
                : 'radial-gradient(ellipse at top, rgba(200, 180, 220, 0.08) 0%, transparent 50%)'
            }}
          />
        </div>

        <div className="relative max-w-[1200px] mx-auto px-6 lg:px-[60px] pt-20 pb-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
              style={{
                backgroundColor: theme === 'dark'
                  ? 'rgba(193, 192, 182, 0.1)'
                  : 'rgba(0, 0, 0, 0.04)',
                border: '1px solid',
                borderColor: theme === 'dark'
                  ? 'rgba(193, 192, 182, 0.15)'
                  : 'rgba(0, 0, 0, 0.08)'
              }}
            >
              <Brain className="w-4 h-4" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
              <span
                className="text-[13px] font-medium"
                style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
                  fontFamily: 'var(--font-body)'
                }}
              >
                Today's Twin Intelligence
              </span>
            </div>

            <h1
              className="text-[clamp(2.5rem,5vw,4rem)] leading-[1.1] mb-6"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
              }}
            >
              Your Twin Knows
              <br />
              What You Need
            </h1>

            <p
              className="text-[16px] lg:text-[17px] leading-[1.7] max-w-[500px] mx-auto"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark'
                  ? 'rgba(193, 192, 182, 0.7)'
                  : '#57534e',
              }}
            >
              Based on your patterns, we've prepared your personalized ritual for today's important events
            </p>
          </div>

          {/* Main Content */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="relative">
                <Sparkles
                  className="w-16 h-16 animate-pulse"
                  style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                />
                <div className="absolute inset-0 animate-ping">
                  <Sparkles
                    className="w-16 h-16 opacity-30"
                    style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                  />
                </div>
              </div>
            </div>
          ) : error ? (
            <GlassPanel className="max-w-2xl mx-auto">
              <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                <p
                  className="text-[16px]"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
                  }}
                >
                  {error}
                </p>
                <button
                  onClick={fetchNextEvent}
                  className="mt-6 px-6 py-3 rounded-full text-[14px] font-medium transition-all duration-200"
                  style={{
                    backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    color: theme === 'dark' ? '#232320' : '#FAFAFA',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  Try Again
                </button>
              </div>
            </GlassPanel>
          ) : nextEvent && ritual ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Next Event Card */}
              <GlassPanel className="relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{
                    background: theme === 'dark'
                      ? `linear-gradient(to right, transparent, rgba(193, 192, 182, ${nextEvent.importanceScore * 0.5}), transparent)`
                      : `linear-gradient(to right, transparent, rgba(0, 0, 0, ${nextEvent.importanceScore * 0.2}), transparent)`
                  }}
                />

                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{
                          backgroundColor: theme === 'dark'
                            ? 'rgba(193, 192, 182, 0.1)'
                            : 'rgba(0, 0, 0, 0.04)'
                        }}
                      >
                        <Calendar className="w-6 h-6" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
                      </div>
                      <div>
                        <p
                          className="text-[12px] font-medium uppercase tracking-wide"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                          }}
                        >
                          Next Important Event
                        </p>
                        <p
                          className="text-[18px] font-semibold"
                          style={{
                            fontFamily: 'var(--font-heading)',
                            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                          }}
                        >
                          {formatDate(nextEvent.start)}
                        </p>
                      </div>
                    </div>
                    <div
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        fontFamily: 'var(--font-ui)'
                      }}
                    >
                      {timeToEvent}
                    </div>
                  </div>

                  <h3
                    className="text-2xl font-medium mb-4"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    {nextEvent.title}
                  </h3>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }} />
                      <span
                        className="text-[14px]"
                        style={{
                          fontFamily: 'var(--font-ui)',
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                        }}
                      >
                        {formatTime(nextEvent.start)} - {formatTime(nextEvent.end)}
                      </span>
                    </div>

                    {nextEvent.attendees > 0 && (
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }} />
                        <span
                          className="text-[14px]"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                          }}
                        >
                          {nextEvent.attendees} attendees
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }} />
                      <span
                        className="text-[14px]"
                        style={{
                          fontFamily: 'var(--font-ui)',
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                        }}
                      >
                        Importance: {Math.round(nextEvent.importanceScore * 100)}%
                      </span>
                    </div>
                  </div>

                  <div
                    className="mt-6 p-4 rounded-xl"
                    style={{
                      backgroundColor: theme === 'dark'
                        ? 'rgba(193, 192, 182, 0.03)'
                        : 'rgba(0, 0, 0, 0.02)',
                      border: '1px solid',
                      borderColor: theme === 'dark'
                        ? 'rgba(193, 192, 182, 0.1)'
                        : 'rgba(0, 0, 0, 0.06)'
                    }}
                  >
                    <p
                      className="text-[13px] leading-relaxed"
                      style={{
                        fontFamily: 'var(--font-ui)',
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                      }}
                    >
                      This event matches your pattern for {nextEvent.type || 'important meetings'}.
                      Your twin has prepared your ritual.
                    </p>
                  </div>
                </div>
              </GlassPanel>

              {/* Ritual Suggestion Card */}
              <GlassPanel className="relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{
                    background: theme === 'dark'
                      ? `linear-gradient(to right, transparent, rgba(193, 192, 182, ${ritual.confidence * 0.5}), transparent)`
                      : `linear-gradient(to right, transparent, rgba(0, 0, 0, ${ritual.confidence * 0.2}), transparent)`
                  }}
                />

                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{
                          backgroundColor: theme === 'dark'
                            ? 'rgba(193, 192, 182, 0.1)'
                            : 'rgba(0, 0, 0, 0.04)'
                        }}
                      >
                        <Headphones className="w-6 h-6" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
                      </div>
                      <div>
                        <p
                          className="text-[12px] font-medium uppercase tracking-wide"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                          }}
                        >
                          Your Ritual
                        </p>
                        <p
                          className="text-[18px] font-semibold"
                          style={{
                            fontFamily: 'var(--font-heading)',
                            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                          }}
                        >
                          {ritual.genre} Vibes
                        </p>
                      </div>
                    </div>
                    <div
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium"
                      style={{
                        backgroundColor: theme === 'dark'
                          ? 'rgba(193, 192, 182, 0.1)'
                          : 'rgba(0, 0, 0, 0.04)',
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
                        fontFamily: 'var(--font-ui)'
                      }}
                    >
                      {ritualStarted ? 'Active' : timeToRitual}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div
                      className="p-4 rounded-xl"
                      style={{
                        backgroundColor: theme === 'dark'
                          ? 'rgba(193, 192, 182, 0.05)'
                          : 'rgba(0, 0, 0, 0.02)',
                        border: '1px solid',
                        borderColor: theme === 'dark'
                          ? 'rgba(193, 192, 182, 0.1)'
                          : 'rgba(0, 0, 0, 0.06)'
                      }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <Timer className="w-5 h-5" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }} />
                        <p
                          className="text-[14px] font-medium"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                          }}
                        >
                          Start {ritual.minutesBeforeEvent} minutes before
                        </p>
                      </div>
                      <p
                        className="text-[13px]"
                        style={{
                          fontFamily: 'var(--font-ui)',
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                        }}
                      >
                        Optimal preparation window: {formatTime(ritual.startTime)}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }} />
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                          }}
                        >
                          Mood: {ritual.mood}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }} />
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                          }}
                        >
                          Based on: {ritual.basedOnPattern}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }} />
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                          }}
                        >
                          Confidence: {Math.round(ritual.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Suggested Tracks Preview */}
                    {ritual.suggestedTracks && ritual.suggestedTracks.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <p
                          className="text-[12px] font-medium uppercase tracking-wide"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                          }}
                        >
                          Suggested Tracks
                        </p>
                        {ritual.suggestedTracks.slice(0, 3).map((track, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-2 rounded-lg"
                            style={{
                              backgroundColor: theme === 'dark'
                                ? 'rgba(193, 192, 182, 0.03)'
                                : 'rgba(0, 0, 0, 0.02)'
                            }}
                          >
                            <Disc className="w-3.5 h-3.5" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }} />
                            <div className="flex-1">
                              <p
                                className="text-[13px] font-medium"
                                style={{
                                  fontFamily: 'var(--font-ui)',
                                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#0c0a09'
                                }}
                              >
                                {track.name}
                              </p>
                              <p
                                className="text-[11px]"
                                style={{
                                  fontFamily: 'var(--font-ui)',
                                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c'
                                }}
                              >
                                {track.artist}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={startRitual}
                      disabled={ritualStarted}
                      className="w-full mt-6 px-6 py-3 rounded-full text-[14px] font-medium transition-all duration-200 flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: ritualStarted
                          ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                          : (theme === 'dark' ? '#C1C0B6' : '#0c0a09'),
                        color: ritualStarted
                          ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e')
                          : (theme === 'dark' ? '#232320' : '#FAFAFA'),
                        fontFamily: 'var(--font-ui)',
                        cursor: ritualStarted ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {ritualStarted ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Ritual Active
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Start Ritual
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </GlassPanel>
            </div>
          ) : (
            // No Events State
            <div className="max-w-2xl mx-auto">
              <GlassPanel>
                <div className="p-12 text-center">
                  <div className="relative inline-block mb-6">
                    <Calendar
                      className="w-16 h-16 opacity-20"
                      style={{
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                      }}
                    />
                    <XCircle
                      className="w-8 h-8 absolute -bottom-2 -right-2"
                      style={{ color: '#ef4444' }}
                    />
                  </div>

                  <h3
                    className="text-2xl font-medium mb-4"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    No Important Events Today
                  </h3>

                  <p
                    className="text-[16px] mb-8 max-w-md mx-auto"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                    }}
                  >
                    Your twin hasn't detected any important events coming up.
                    We'll notify you when there's something to prepare for.
                  </p>

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => navigate('/rituals')}
                      className="px-6 py-3 rounded-full text-[14px] font-medium transition-all duration-200 flex items-center gap-2"
                      style={{
                        backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                        color: theme === 'dark' ? '#232320' : '#FAFAFA',
                        fontFamily: 'var(--font-ui)',
                      }}
                    >
                      View Past Patterns
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={fetchNextEvent}
                      className="px-6 py-3 rounded-full text-[14px] font-medium transition-all duration-200"
                      style={{
                        backgroundColor: theme === 'dark'
                          ? 'rgba(193, 192, 182, 0.1)'
                          : 'rgba(0, 0, 0, 0.05)',
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                        fontFamily: 'var(--font-ui)',
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </GlassPanel>
            </div>
          )}
        </div>
      </div>

      {/* Insight Section */}
      {!loading && !error && (
        <div className="max-w-[1200px] mx-auto px-6 lg:px-[60px] pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: 'Pattern Recognition',
                description: 'Your twin learns from every event, continuously improving ritual predictions'
              },
              {
                icon: Sparkles,
                title: 'Personalized Rituals',
                description: 'Music selections tailored to your preferences and event requirements'
              },
              {
                icon: Zap,
                title: 'Performance Boost',
                description: 'Enter important events in your optimal mental state'
              }
            ].map((feature, idx) => (
              <GlassPanel key={idx} hover className="group">
                <div className="p-6">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      backgroundColor: theme === 'dark'
                        ? 'rgba(193, 192, 182, 0.1)'
                        : 'rgba(0, 0, 0, 0.04)'
                    }}
                  >
                    <feature.icon
                      className="w-6 h-6"
                      style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                    />
                  </div>
                  <h4
                    className="text-[16px] font-medium mb-2"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    {feature.title}
                  </h4>
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-ui)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                    }}
                  >
                    {feature.description}
                  </p>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}