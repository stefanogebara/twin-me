import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Brain,
  TrendingUp,
  Calendar,
  Music,
  Target,
  Zap,
  Eye,
  EyeOff,
  Trash2,
  BarChart3,
  Sparkles,
  Clock,
  Hash
} from 'lucide-react';

interface BehavioralPattern {
  id: string;
  pattern_type: string;
  pattern_name: string;
  pattern_description: string;
  confidence_score: number;
  occurrence_count: number;
  consistency_rate: number;
  time_offset_minutes: number;
  response_platform: string;
  response_type: string;
  emotional_state?: string;
  hypothesized_purpose?: string;
  ai_insight?: string;
  is_active: boolean;
  first_observed_at: string;
  last_observed_at: string;
}

interface PatternInsight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence: number;
  insight_data: any;
  suggestions?: string[];
  generated_at: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';

export default function BehavioralPatterns() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [patterns, setPatterns] = useState<BehavioralPattern[]>([]);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPattern, setSelectedPattern] = useState<BehavioralPattern | null>(null);
  const [viewMode, setViewMode] = useState<'patterns' | 'insights' | 'stats'>('patterns');

  useEffect(() => {
    if (user) {
      fetchPatterns();
      fetchInsights();
    }
  }, [user]);

  const fetchPatterns = async () => {
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/behavioral-patterns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPatterns(data.patterns || []);
      }
    } catch (error) {
      console.error('Error fetching patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async () => {
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      const response = await fetch(`${API_URL}/behavioral-patterns/insights`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setInsights(data.insights || []);
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
    }
  };

  const getPatternIcon = (type: string) => {
    switch (type) {
      case 'pre_event_ritual': return <Calendar className="w-5 h-5" />;
      case 'focus_trigger': return <Target className="w-5 h-5" />;
      case 'stress_response': return <Zap className="w-5 h-5" />;
      case 'morning_routine': return <Clock className="w-5 h-5" />;
      default: return <Brain className="w-5 h-5" />;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return theme === 'dark' ? '#10b981' : '#059669';
    if (score >= 60) return theme === 'dark' ? '#f59e0b' : '#d97706';
    return theme === 'dark' ? '#ef4444' : '#dc2626';
  };

  const formatTimeOffset = (minutes: number) => {
    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;

    const timeStr = hours > 0
      ? `${hours}h ${mins}m`
      : `${mins}m`;

    return minutes < 0 ? `${timeStr} before` : `${timeStr} after`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        backgroundColor: theme === 'dark' ? '#0c0a09' : '#FAF9F5'
      }}>
        <div className="flex flex-col items-center gap-4">
          <Brain className="w-12 h-12 animate-pulse" style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }} />
          <p style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            Analyzing your behavioral patterns...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{
      backgroundColor: theme === 'dark' ? '#0c0a09' : '#FAF9F5',
      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
    }}>
      {/* Header */}
      <div className="border-b" style={{
        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
      }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Brain className="w-8 h-8" style={{
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }} />
            <h1 className="text-3xl font-heading font-medium">
              Behavioral Patterns
            </h1>
          </div>
          <p className="font-body" style={{
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)'
          }}>
            Discover temporal correlations in your digital behavior
          </p>

          {/* View Mode Tabs */}
          <div className="flex gap-2 mt-6">
            {[
              { id: 'patterns', label: 'Patterns', icon: TrendingUp },
              { id: 'insights', label: 'Insights', icon: Sparkles },
              { id: 'stats', label: 'Statistics', icon: BarChart3 }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as any)}
                className="px-4 py-2 rounded-lg flex items-center gap-2 transition-all font-ui text-sm"
                style={{
                  backgroundColor: viewMode === tab.id
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(12, 10, 9, 0.06)')
                    : 'transparent',
                  color: viewMode === tab.id
                    ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                    : (theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : 'rgba(12, 10, 9, 0.5)'),
                  border: `1px solid ${viewMode === tab.id
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(12, 10, 9, 0.1)')
                    : 'transparent'}`
                }}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {viewMode === 'patterns' && (
          <div className="grid grid-cols-1 gap-4">
            {patterns.length === 0 ? (
              <div className="text-center py-16">
                <Brain className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-body" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : 'rgba(12, 10, 9, 0.4)'
                }}>
                  No patterns detected yet
                </p>
                <p className="text-sm mt-2" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : 'rgba(12, 10, 9, 0.3)'
                }}>
                  Connect more platforms and interact with your twin to discover patterns
                </p>
              </div>
            ) : (
              patterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className="rounded-2xl p-6 transition-all cursor-pointer hover:scale-[1.01]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.04)' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`,
                    boxShadow: theme === 'dark' ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.03)'
                  }}
                  onClick={() => setSelectedPattern(pattern)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="p-3 rounded-xl" style={{
                        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(12, 10, 9, 0.04)'
                      }}>
                        {getPatternIcon(pattern.pattern_type)}
                      </div>

                      <div className="flex-1">
                        <h3 className="text-lg font-heading font-medium mb-1">
                          {pattern.pattern_name}
                        </h3>
                        <p className="text-sm font-body mb-3" style={{
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)'
                        }}>
                          {pattern.pattern_description}
                        </p>

                        {/* Metrics */}
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4" style={{
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : 'rgba(12, 10, 9, 0.4)'
                            }} />
                            <span style={{
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : 'rgba(12, 10, 9, 0.7)'
                            }}>
                              {pattern.occurrence_count} occurrences
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" style={{
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : 'rgba(12, 10, 9, 0.4)'
                            }} />
                            <span style={{
                              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : 'rgba(12, 10, 9, 0.7)'
                            }}>
                              {formatTimeOffset(pattern.time_offset_minutes)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Confidence Score */}
                    <div className="text-right">
                      <div className="text-2xl font-heading font-medium mb-1" style={{
                        color: getConfidenceColor(pattern.confidence_score)
                      }}>
                        {Math.round(pattern.confidence_score)}%
                      </div>
                      <div className="text-xs font-ui" style={{
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : 'rgba(12, 10, 9, 0.4)'
                      }}>
                        Confidence
                      </div>
                    </div>
                  </div>

                  {/* AI Insight */}
                  {pattern.ai_insight && (
                    <div className="mt-4 pt-4" style={{
                      borderTop: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`
                    }}>
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{
                          color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                        }} />
                        <p className="text-sm font-body" style={{
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.85)' : 'rgba(12, 10, 9, 0.8)'
                        }}>
                          {pattern.ai_insight}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {viewMode === 'insights' && (
          <div className="grid grid-cols-1 gap-4">
            {insights.length === 0 ? (
              <div className="text-center py-16">
                <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-body" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : 'rgba(12, 10, 9, 0.4)'
                }}>
                  No insights generated yet
                </p>
              </div>
            ) : (
              insights.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-2xl p-6"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.04)' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`,
                    boxShadow: theme === 'dark' ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.03)'
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-lg font-heading font-medium mb-2">
                        {insight.title}
                      </h3>
                      <p className="text-sm font-body" style={{
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : 'rgba(12, 10, 9, 0.7)'
                      }}>
                        {insight.description}
                      </p>
                    </div>
                    <div className="text-sm font-ui" style={{
                      color: getConfidenceColor(insight.confidence)
                    }}>
                      {Math.round(insight.confidence)}% confident
                    </div>
                  </div>

                  {/* Suggestions */}
                  {insight.suggestions && insight.suggestions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {insight.suggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-sm p-3 rounded-lg"
                          style={{
                            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.06)' : 'rgba(12, 10, 9, 0.02)'
                          }}
                        >
                          <span className="text-xs mt-0.5">💡</span>
                          <span className="font-body" style={{
                            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.85)' : 'rgba(12, 10, 9, 0.8)'
                          }}>
                            {suggestion}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {viewMode === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl p-6" style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.04)' : '#ffffff',
              border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`,
              boxShadow: theme === 'dark' ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.03)'
            }}>
              <div className="text-4xl font-heading font-medium mb-2">
                {patterns.length}
              </div>
              <div className="text-sm font-ui" style={{
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : 'rgba(12, 10, 9, 0.5)'
              }}>
                Total Patterns
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.04)' : '#ffffff',
              border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`,
              boxShadow: theme === 'dark' ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.03)'
            }}>
              <div className="text-4xl font-heading font-medium mb-2">
                {patterns.filter(p => p.confidence_score >= 70).length}
              </div>
              <div className="text-sm font-ui" style={{
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : 'rgba(12, 10, 9, 0.5)'
              }}>
                High Confidence
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.04)' : '#ffffff',
              border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`,
              boxShadow: theme === 'dark' ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.03)'
            }}>
              <div className="text-4xl font-heading font-medium mb-2">
                {insights.length}
              </div>
              <div className="text-sm font-ui" style={{
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : 'rgba(12, 10, 9, 0.5)'
              }}>
                AI Insights
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
