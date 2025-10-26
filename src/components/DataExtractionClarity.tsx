/**
 * Data Extraction Clarity Component
 * Provides complete transparency about what data is being extracted and analyzed
 */

import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Database,
  Brain,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Info,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Heart,
  Music,
  Video,
  Book,
  MessageCircle,
  Calendar,
  Mail,
  Activity
} from 'lucide-react';
import { StandardCard, CardHeader, CardContent } from './ui/StandardCard';
import { StandardBadge } from './ui/StandardBadge';
import { StandardButton } from './ui/StandardButton';
import { PlatformIcon, getPlatformColor } from './PlatformIcons';
import { cn } from '@/lib/utils';

// Data categories and their extraction details
const dataCategories = {
  entertainment: {
    name: 'Entertainment & Media',
    icon: <Video className="w-5 h-5" />,
    color: 'text-purple-600',
    platforms: ['spotify', 'youtube', 'netflix', 'twitch'],
    dataPoints: [
      { type: 'Watch History', description: 'Shows, movies, and videos you\'ve watched' },
      { type: 'Listening Patterns', description: 'Music genres, artists, and playlists' },
      { type: 'Engagement Metrics', description: 'Likes, saves, and repeat consumption' },
      { type: 'Time Patterns', description: 'When you engage with content' },
    ],
    insights: [
      'Emotional preferences and mood patterns',
      'Content genre affinities',
      'Discovery vs. comfort viewing habits',
      'Peak engagement times',
    ],
  },
  communication: {
    name: 'Communication Style',
    icon: <MessageCircle className="w-5 h-5" />,
    color: 'text-blue-600',
    platforms: ['gmail', 'discord', 'slack'],
    dataPoints: [
      { type: 'Message Patterns', description: 'Response times and message lengths' },
      { type: 'Language Style', description: 'Vocabulary, formality, and tone' },
      { type: 'Interaction Frequency', description: 'Who you communicate with most' },
      { type: 'Topic Analysis', description: 'Common subjects and themes' },
    ],
    insights: [
      'Communication personality type',
      'Professional vs. casual tone preferences',
      'Collaboration patterns',
      'Response urgency levels',
    ],
  },
  productivity: {
    name: 'Work & Productivity',
    icon: <Calendar className="w-5 h-5" />,
    color: 'text-green-600',
    platforms: ['github', 'calendar', 'notion'],
    dataPoints: [
      { type: 'Work Schedule', description: 'Meeting patterns and availability' },
      { type: 'Project Activity', description: 'Code commits and documentation' },
      { type: 'Task Management', description: 'How you organize and prioritize' },
      { type: 'Collaboration Style', description: 'Team interaction patterns' },
    ],
    insights: [
      'Peak productivity hours',
      'Work-life balance indicators',
      'Technical skill progression',
      'Leadership and teamwork traits',
    ],
  },
  learning: {
    name: 'Learning & Interests',
    icon: <Book className="w-5 h-5" />,
    color: 'text-orange-600',
    platforms: ['youtube', 'reddit', 'medium'],
    dataPoints: [
      { type: 'Content Consumption', description: 'Articles, videos, and discussions' },
      { type: 'Topic Interests', description: 'Subjects you explore and follow' },
      { type: 'Learning Pace', description: 'How quickly you dive deep into topics' },
      { type: 'Knowledge Sharing', description: 'Comments, posts, and contributions' },
    ],
    insights: [
      'Learning style preferences',
      'Curiosity patterns',
      'Expertise areas',
      'Information processing speed',
    ],
  },
  health: {
    name: 'Lifestyle & Wellness',
    icon: <Activity className="w-5 h-5" />,
    color: 'text-red-600',
    platforms: ['strava', 'fitbit', 'myfitnesspal'],
    dataPoints: [
      { type: 'Activity Patterns', description: 'Exercise frequency and types' },
      { type: 'Sleep Patterns', description: 'Rest and recovery habits' },
      { type: 'Nutrition Tracking', description: 'Dietary preferences and goals' },
      { type: 'Wellness Goals', description: 'Health objectives and progress' },
    ],
    insights: [
      'Motivation patterns',
      'Consistency and discipline levels',
      'Health consciousness',
      'Stress and recovery indicators',
    ],
  },
};

// Privacy levels
const privacyLevels = [
  { level: 'minimal', label: 'Essential Only', description: 'Basic profile data only' },
  { level: 'balanced', label: 'Balanced', description: 'Common activities and preferences' },
  { level: 'comprehensive', label: 'Comprehensive', description: 'Deep personality insights' },
];

interface DataExtractionClarityProps {
  userId?: string;
  connectedPlatforms?: string[];
  onPrivacyChange?: (category: string, level: number) => void;
  className?: string;
}

export const DataExtractionClarity: React.FC<DataExtractionClarityProps> = ({
  userId,
  connectedPlatforms = [],
  onPrivacyChange,
  className = ''
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showDataPoints, setShowDataPoints] = useState(true);
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] = useState('balanced');
  const [categoryPrivacy, setCategoryPrivacy] = useState<Record<string, number>>({});

  // Initialize privacy levels
  useEffect(() => {
    const initial: Record<string, number> = {};
    Object.keys(dataCategories).forEach(key => {
      initial[key] = 50; // Default to 50% revelation
    });
    setCategoryPrivacy(initial);
  }, []);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handlePrivacyChange = (category: string, value: number) => {
    setCategoryPrivacy(prev => ({ ...prev, [category]: value }));
    if (onPrivacyChange) {
      onPrivacyChange(category, value);
    }
  };

  const getExtractionStatus = (platforms: string[]) => {
    const connected = platforms.filter(p => connectedPlatforms.includes(p));
    if (connected.length === 0) return 'none';
    if (connected.length === platforms.length) return 'complete';
    return 'partial';
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header Card */}
      <StandardCard variant="bordered">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-heading font-semibold text-[hsl(var(--claude-text))] mb-2">
                Your Soul Signature Extraction
              </h2>
              <p className="text-[hsl(var(--claude-text-muted))]">
                Complete transparency about what we analyze to create your digital twin
              </p>
            </div>
            <StandardBadge variant="info" icon={<Eye className="w-3 h-3" />}>
              Full Transparency
            </StandardBadge>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="flex items-center gap-3 p-3 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
              <Database className="w-5 h-5 text-[hsl(var(--claude-accent))]" />
              <div>
                <p className="text-sm text-[hsl(var(--claude-text-muted))]">Data Categories</p>
                <p className="font-semibold text-[hsl(var(--claude-text))]">
                  {Object.keys(dataCategories).length} Types
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
              <Sparkles className="w-5 h-5 text-[hsl(var(--claude-accent))]" />
              <div>
                <p className="text-sm text-[hsl(var(--claude-text-muted))]">Insights Generated</p>
                <p className="font-semibold text-[hsl(var(--claude-text))]">
                  {Object.values(dataCategories).reduce((acc, cat) => acc + cat.insights.length, 0)} Patterns
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
              <Lock className="w-5 h-5 text-[hsl(var(--claude-accent))]" />
              <div>
                <p className="text-sm text-[hsl(var(--claude-text-muted))]">Privacy Control</p>
                <p className="font-semibold text-[hsl(var(--claude-text))]">You Decide</p>
              </div>
            </div>
          </div>
        </CardContent>
      </StandardCard>

      {/* Privacy Level Selector */}
      <StandardCard>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-medium text-[hsl(var(--claude-text))]">
              Global Privacy Level
            </h3>
            <StandardButton
              variant="ghost"
              size="sm"
              leftIcon={showDataPoints ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              onClick={() => setShowDataPoints(!showDataPoints)}
            >
              {showDataPoints ? 'Hide Details' : 'Show Details'}
            </StandardButton>
          </div>
          <div className="flex gap-2">
            {privacyLevels.map(level => (
              <button
                key={level.level}
                onClick={() => setSelectedPrivacyLevel(level.level)}
                className={cn(
                  'flex-1 p-3 rounded-lg border-2 transition-all',
                  selectedPrivacyLevel === level.level
                    ? 'border-[hsl(var(--claude-accent))] bg-[hsl(var(--claude-accent))]/10'
                    : 'border-[hsl(var(--claude-border))] hover:border-[hsl(var(--claude-border-hover))]'
                )}
              >
                <p className="font-medium text-[hsl(var(--claude-text))]">{level.label}</p>
                <p className="text-xs text-[hsl(var(--claude-text-muted))] mt-1">{level.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </StandardCard>

      {/* Data Categories */}
      <div className="space-y-4">
        {Object.entries(dataCategories).map(([key, category]) => {
          const isExpanded = expandedCategories.has(key);
          const status = getExtractionStatus(category.platforms);
          const privacyValue = categoryPrivacy[key] || 50;

          return (
            <StandardCard key={key} variant={isExpanded ? 'bordered' : 'default'}>
              <CardContent className="p-4">
                {/* Category Header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleCategory(key)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg bg-gray-100', category.color)}>
                      {category.icon}
                    </div>
                    <div>
                      <h3 className="font-heading font-medium text-[hsl(var(--claude-text))]">
                        {category.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {category.platforms.slice(0, 3).map(platform => (
                          <PlatformIcon
                            key={platform}
                            platform={platform}
                            size="sm"
                            colored
                            className={cn(
                              !connectedPlatforms.includes(platform) && 'opacity-30'
                            )}
                          />
                        ))}
                        {category.platforms.length > 3 && (
                          <span className="text-xs text-[hsl(var(--claude-text-muted))]">
                            +{category.platforms.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Status Badge */}
                    {status === 'complete' && (
                      <StandardBadge variant="success" icon={<CheckCircle2 className="w-3 h-3" />} size="sm">
                        All Connected
                      </StandardBadge>
                    )}
                    {status === 'partial' && (
                      <StandardBadge variant="warning" icon={<Clock className="w-3 h-3" />} size="sm">
                        Partial Data
                      </StandardBadge>
                    )}
                    {status === 'none' && (
                      <StandardBadge variant="default" icon={<AlertCircle className="w-3 h-3" />} size="sm">
                        Not Connected
                      </StandardBadge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-[hsl(var(--claude-text-muted))]" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-[hsl(var(--claude-text-muted))]" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-4 space-y-4">
                    {/* Privacy Control Slider */}
                    <div className="p-3 bg-[hsl(var(--claude-surface-raised))] rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
                          Data Revelation Level
                        </span>
                        <span className="text-sm font-medium text-[hsl(var(--claude-accent))]">
                          {privacyValue}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={privacyValue}
                        onChange={(e) => handlePrivacyChange(key, parseInt(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, hsl(var(--claude-accent)) 0%, hsl(var(--claude-accent)) ${privacyValue}%, #e5e7eb ${privacyValue}%, #e5e7eb 100%)`
                        }}
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-[hsl(var(--claude-text-muted))]">Private</span>
                        <span className="text-xs text-[hsl(var(--claude-text-muted))]">Full Sharing</span>
                      </div>
                    </div>

                    {showDataPoints && (
                      <>
                        {/* Data Points */}
                        <div>
                          <h4 className="text-sm font-medium text-[hsl(var(--claude-text))] mb-2 flex items-center gap-1">
                            <Database className="w-4 h-4" />
                            What We Extract
                          </h4>
                          <div className="space-y-2">
                            {category.dataPoints.map((point, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-sm">
                                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--claude-accent))] mt-1.5" />
                                <div>
                                  <span className="font-medium text-[hsl(var(--claude-text))]">
                                    {point.type}:
                                  </span>
                                  <span className="text-[hsl(var(--claude-text-muted))] ml-1">
                                    {point.description}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Insights Generated */}
                        <div>
                          <h4 className="text-sm font-medium text-[hsl(var(--claude-text))] mb-2 flex items-center gap-1">
                            <Brain className="w-4 h-4" />
                            Insights We Generate
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {category.insights.map((insight, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 p-2 bg-[hsl(var(--claude-surface))] rounded text-sm"
                              >
                                <Sparkles className="w-3 h-3 text-[hsl(var(--claude-accent))]" />
                                <span className="text-[hsl(var(--claude-text-muted))]">{insight}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Connected Platforms */}
                    <div>
                      <h4 className="text-sm font-medium text-[hsl(var(--claude-text))] mb-2">
                        Platform Status
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {category.platforms.map(platform => {
                          const isConnected = connectedPlatforms.includes(platform);
                          return (
                            <div
                              key={platform}
                              className={cn(
                                'flex items-center gap-1.5 px-2 py-1 rounded-lg border',
                                isConnected
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-gray-50 border-gray-200'
                              )}
                            >
                              <PlatformIcon platform={platform} size="sm" colored />
                              <span className="text-sm capitalize">{platform}</span>
                              {isConnected ? (
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                              ) : (
                                <Lock className="w-3 h-3 text-muted-foreground" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </StandardCard>
          );
        })}
      </div>

      {/* Privacy Promise */}
      <StandardCard variant="bordered">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading font-medium text-[hsl(var(--claude-text))] mb-2">
                Our Privacy Promise
              </h3>
              <ul className="space-y-2 text-sm text-[hsl(var(--claude-text-muted))]">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Your data is encrypted end-to-end and never sold to third parties</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>You can delete any data point or entire categories at any time</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Export your complete soul signature data whenever you want</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Set different privacy levels for different contexts (work, social, etc.)</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </StandardCard>
    </div>
  );
};

export default DataExtractionClarity;