/**
 * Soul Insights Component
 * Displays Claude AI-generated insights about the user's soul signature
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Brain, Heart, Lightbulb, Target, Users, TrendingUp, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface SoulInsight {
  id: string;
  user_id: string;
  platforms: string[];
  insight_type: 'personality' | 'interests' | 'behavior_patterns' | 'skills' | 'social_style';
  title: string;
  description: string;
  analysis: {
    fullAnalysis?: string;
    keyPoints?: string[];
    patterns?: string[];
    crossPlatform?: boolean;
  };
  confidence_score: number;
  evidence: Array<{
    dataType?: string;
    platform: string;
    recordId?: string;
  }>;
  created_at: string;
  analyzed_at: string;
}

interface InsightsResponse {
  success: boolean;
  totalInsights: number;
  insights: {
    personality: SoulInsight[];
    interests: SoulInsight[];
    behavior_patterns: SoulInsight[];
    skills: SoulInsight[];
    social_style: SoulInsight[];
    all: SoulInsight[];
  };
  platforms: string[];
}

interface SoulInsightsProps {
  userId: string;
}

const insightTypeConfig = {
  personality: {
    icon: Heart,
    label: 'Personality',
    color: 'text-stone-600',
    bgColor: 'bg-stone-50',
    borderColor: 'border-stone-200'
  },
  interests: {
    icon: Sparkles,
    label: 'Interests',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  behavior_patterns: {
    icon: TrendingUp,
    label: 'Behavior Patterns',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  skills: {
    icon: Target,
    label: 'Skills',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  social_style: {
    icon: Users,
    label: 'Social Style',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200'
  }
};

const platformColors: Record<string, string> = {
  github: 'bg-gray-900 text-white',
  spotify: 'bg-green-600 text-white',
  discord: 'bg-indigo-600 text-white',
  reddit: 'bg-orange-600 text-white',
  twitch: 'bg-purple-600 text-white',
  youtube: 'bg-red-600 text-white',
  google_youtube: 'bg-red-600 text-white'
};

export function SoulInsights({ userId }: SoulInsightsProps) {
  const { theme } = useTheme();
  const { data: insights, isLoading, error, refetch } = useQuery<InsightsResponse>({
    queryKey: ['soul-insights', userId],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/soul-signature/insights/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--claude-accent))] mx-auto mb-4" />
          <p className="text-[hsl(var(--claude-text-muted))] font-ui">Loading your soul insights...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-6"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)'
        }}
      >
        <p className="text-red-600 font-ui">Failed to load insights. Please try again.</p>
      </div>
    );
  }

  if (!insights || insights.totalInsights === 0) {
    return (
      <div className="rounded-lg border border-[hsl(var(--claude-border))] bg-[hsl(var(--claude-surface))] p-8 text-center">
        <Brain className="h-12 w-12 text-[hsl(var(--claude-text-muted))] mx-auto mb-4" />
        <h3 className="font-heading text-xl font-medium text-[hsl(var(--claude-text))] mb-2">
          No Insights Yet
        </h3>
        <p className="text-[hsl(var(--claude-text-muted))] font-ui mb-4">
          Connect platforms to unlock your soul signature analysis
        </p>
      </div>
    );
  }

  const insightTypes: Array<keyof typeof insightTypeConfig> = [
    'personality',
    'interests',
    'behavior_patterns',
    'skills',
    'social_style'
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl font-medium text-[hsl(var(--claude-text))] mb-1">
            Your Soul Signature
          </h2>
          <p className="text-[hsl(var(--claude-text-muted))] font-ui">
            {insights.totalInsights} insights discovered from {insights.platforms.join(', ')}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-[hsl(var(--claude-accent))] text-white font-ui text-sm hover:bg-[hsl(var(--claude-accent-hover))] transition-colors"
        >
          Refresh Insights
        </button>
      </div>

      {/* Insights Grid */}
      <div className="space-y-6">
        {insightTypes.map((type) => {
          const typeInsights = insights.insights[type];
          if (!typeInsights || typeInsights.length === 0) return null;

          const config = insightTypeConfig[type];
          const Icon = config.icon;

          return (
            <div key={type} className="space-y-3">
              {/* Section Header */}
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${config.color}`} />
                <h3 className="font-heading text-lg font-medium text-[hsl(var(--claude-text))]">
                  {config.label}
                </h3>
                <span className="text-sm text-[hsl(var(--claude-text-muted))] font-ui">
                  ({typeInsights.length})
                </span>
              </div>

              {/* Insights Cards */}
              <div className="grid gap-4 md:grid-cols-2">
                {typeInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} config={config} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface InsightCardProps {
  insight: SoulInsight;
  config: typeof insightTypeConfig[keyof typeof insightTypeConfig];
}

function InsightCard({ insight, config }: InsightCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const { theme } = useTheme();

  return (
    <div
      className="rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-5 transition-all hover:shadow-lg cursor-pointer"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)'
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="mb-3">
        <h4 className="font-heading text-base font-medium text-[hsl(var(--claude-text))] mb-2">
          {insight.title}
        </h4>

        {/* Platform badges */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {insight.platforms.map((platform) => (
            <span
              key={platform}
              className={`px-2 py-0.5 rounded text-xs font-ui font-medium ${
                platformColors[platform] || 'bg-gray-200 text-gray-800'
              }`}
            >
              {platform}
            </span>
          ))}
          {insight.analysis.crossPlatform && (
            <span className="px-2 py-0.5 rounded text-xs font-ui font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              Cross-Platform
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-[hsl(var(--claude-text-muted))] font-body leading-relaxed mb-3">
        {insight.description}
      </p>

      {/* Confidence Score with Label */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-ui font-medium text-[hsl(var(--claude-text))]">
            Confidence
          </span>
          <span className={`text-xs font-ui font-medium ${
            (insight.confidence_score || 0.75) >= 0.85 ? 'text-green-600' :
            (insight.confidence_score || 0.75) >= 0.70 ? 'text-blue-600' :
            'text-orange-600'
          }`}>
            {Math.round((insight.confidence_score || 0.75) * 100)}% {
              (insight.confidence_score || 0.75) >= 0.85 ? 'High' :
              (insight.confidence_score || 0.75) >= 0.70 ? 'Moderate' :
              'Developing'
            }
          </span>
        </div>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${config.color.replace('text', 'bg')} transition-all`}
            style={{ width: `${(insight.confidence_score || 0.75) * 100}%` }}
          />
        </div>
        <p className="text-xs text-[hsl(var(--claude-text-muted))] font-ui mt-1">
          Based on {insight.evidence.length} data {insight.evidence.length === 1 ? 'source' : 'sources'} from {insight.platforms.join(', ')}
        </p>
      </div>

      {/* Key Points (Expandable) */}
      {expanded && insight.analysis.keyPoints && insight.analysis.keyPoints.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h5 className="text-xs font-ui font-medium text-[hsl(var(--claude-text))] mb-2 uppercase tracking-wide">
            Key Points
          </h5>
          <ul className="space-y-1.5">
            {insight.analysis.keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Lightbulb className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${config.color}`} />
                <span className="text-xs text-[hsl(var(--claude-text-muted))] font-body">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Patterns (Expandable) */}
      {expanded && insight.analysis.patterns && insight.analysis.patterns.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <h5 className="text-xs font-ui font-medium text-[hsl(var(--claude-text))] mb-2 uppercase tracking-wide">
            Observed Patterns
          </h5>
          <ul className="space-y-1.5">
            {insight.analysis.patterns.map((pattern, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <TrendingUp className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${config.color}`} />
                <span className="text-xs text-[hsl(var(--claude-text-muted))] font-body">
                  {pattern}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand indicator */}
      <div className="mt-3 text-center">
        <span className="text-xs text-[hsl(var(--claude-text-muted))] font-ui">
          {expanded ? 'Click to collapse' : 'Click to expand'}
        </span>
      </div>
    </div>
  );
}
