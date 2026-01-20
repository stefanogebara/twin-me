/**
 * Behavioral Evidence Panel
 *
 * Displays research-backed evidence for personality inferences
 * grouped by Big Five dimensions with citations and confidence scores.
 */

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassPanel } from '@/components/layout/PageLayout';
import {
  ChevronDown,
  ChevronUp,
  Music,
  Calendar,
  Activity,
  BookOpen,
  Sparkles,
  Brain,
  Heart,
  Users,
  Zap
} from 'lucide-react';

// Types
interface EvidenceItem {
  platform: string;
  feature: string;
  value: number;
  raw_value?: Record<string, unknown>;
  correlation: number;
  effect_size: 'small' | 'medium' | 'large';
  description: string;
  citation: string;
}

interface Evidence {
  openness: EvidenceItem[];
  conscientiousness: EvidenceItem[];
  extraversion: EvidenceItem[];
  agreeableness: EvidenceItem[];
  neuroticism: EvidenceItem[];
}

interface Confidence {
  overall: number;
  by_dimension: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

interface Personality {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

interface DataSource {
  days: number;
  events: number;
}

interface BehavioralEvidencePanelProps {
  evidence: Evidence;
  personality: Personality;
  confidence: Confidence;
  dataSources?: Record<string, DataSource>;
  className?: string;
}

// Dimension config with colors and icons
const DIMENSION_CONFIG = {
  openness: {
    label: 'Openness',
    shortLabel: 'O',
    description: 'Creativity, curiosity, and openness to new experiences',
    color: '#8B5CF6', // Purple
    bgColor: 'rgba(139, 92, 246, 0.15)',
    Icon: Sparkles
  },
  conscientiousness: {
    label: 'Conscientiousness',
    shortLabel: 'C',
    description: 'Organization, dependability, and self-discipline',
    color: '#10B981', // Green
    bgColor: 'rgba(16, 185, 129, 0.15)',
    Icon: Brain
  },
  extraversion: {
    label: 'Extraversion',
    shortLabel: 'E',
    description: 'Sociability, assertiveness, and positive emotions',
    color: '#F59E0B', // Amber
    bgColor: 'rgba(245, 158, 11, 0.15)',
    Icon: Users
  },
  agreeableness: {
    label: 'Agreeableness',
    shortLabel: 'A',
    description: 'Cooperation, trust, and empathy',
    color: '#EC4899', // Pink
    bgColor: 'rgba(236, 72, 153, 0.15)',
    Icon: Heart
  },
  neuroticism: {
    label: 'Neuroticism',
    shortLabel: 'N',
    description: 'Emotional sensitivity and stress response',
    color: '#6366F1', // Indigo
    bgColor: 'rgba(99, 102, 241, 0.15)',
    Icon: Zap
  }
};

// Platform icons
const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  spotify: Music,
  calendar: Calendar,
  google_calendar: Calendar,
  whoop: Activity
};

// Effect size badges
const EFFECT_SIZE_CONFIG = {
  small: { label: 'Small', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.2)' },
  medium: { label: 'Medium', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.2)' },
  large: { label: 'Strong', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.2)' }
};

/**
 * Parse citation to extract author and year for user-friendly display
 */
const parseCitation = (citation: string) => {
  // Parse format like "anderson 2021 (r=0.4, n=5,808)"
  const match = citation.match(/^(\w+)\s+(\d{4})\s*\(r=([\d.]+),\s*n=([\d,]+)\)$/i);
  if (match) {
    return {
      author: match[1].charAt(0).toUpperCase() + match[1].slice(1),
      year: match[2],
      correlation: match[3],
      sampleSize: match[4],
      full: citation
    };
  }
  // Fallback for other formats
  return {
    author: citation.split(' ')[0],
    year: citation.match(/\d{4}/)?.[0] || '',
    correlation: null,
    sampleSize: null,
    full: citation
  };
};

/**
 * Single Evidence Card Component
 */
const EvidenceCard: React.FC<{
  item: EvidenceItem;
  dimensionColor: string;
  theme: string;
}> = ({ item, dimensionColor, theme }) => {
  const [showFullCitation, setShowFullCitation] = useState(false);
  const PlatformIcon = PLATFORM_ICONS[item.platform] || BookOpen;
  const effectConfig = EFFECT_SIZE_CONFIG[item.effect_size] || EFFECT_SIZE_CONFIG.small;
  const parsedCitation = parseCitation(item.citation);

  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';

  return (
    <div
      className="p-4 rounded-xl transition-all hover:scale-[1.01]"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',
        border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`
      }}
    >
      {/* Header: Platform + Effect Size */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: dimensionColor + '20' }}
          >
            <PlatformIcon className="w-4 h-4" style={{ color: dimensionColor }} />
          </div>
          <span
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: textSecondary }}
          >
            {item.platform.replace('_', ' ')}
          </span>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: effectConfig.bg,
            color: effectConfig.color
          }}
        >
          {effectConfig.label}
        </span>
      </div>

      {/* Description */}
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: textColor }}
      >
        {item.description}
      </p>

      {/* User-friendly Citation */}
      <div className="relative">
        <button
          onClick={() => setShowFullCitation(!showFullCitation)}
          className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
          style={{ color: textSecondary }}
          title="Click to see research details"
        >
          <BookOpen className="w-3 h-3" />
          <span>
            Based on {parsedCitation.author} {parsedCitation.year} research
          </span>
        </button>

        {/* Expandable research details for curious users */}
        {showFullCitation && parsedCitation.correlation && (
          <div
            className="mt-2 p-2 rounded-lg text-xs"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              color: textSecondary
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="opacity-60">Correlation:</span>{' '}
                <span className="font-medium">r = {parsedCitation.correlation}</span>
              </div>
              <div>
                <span className="opacity-60">Sample size:</span>{' '}
                <span className="font-medium">n = {parsedCitation.sampleSize}</span>
              </div>
            </div>
            <p className="mt-1 opacity-60 text-[10px]">
              Higher correlation (r) means stronger predictive power. Larger sample (n) means more reliable results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Dimension Section Component (collapsible)
 */
const DimensionSection: React.FC<{
  dimension: keyof typeof DIMENSION_CONFIG;
  evidence: EvidenceItem[];
  score: number;
  confidence: number;
  theme: string;
  defaultExpanded?: boolean;
}> = ({ dimension, evidence, score, confidence, theme, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = DIMENSION_CONFIG[dimension];
  const Icon = config.Icon;

  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e';

  // Skip dimensions with no evidence
  if (evidence.length === 0) return null;

  return (
    <div className="mb-4">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 rounded-xl transition-all"
        style={{
          backgroundColor: config.bgColor,
          border: `1px solid ${config.color}30`
        }}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: config.color + '25' }}
          >
            <Icon className="w-5 h-5" style={{ color: config.color }} />
          </div>

          {/* Label + Score */}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span
                className="font-medium"
                style={{ color: textColor }}
              >
                {config.label}
              </span>
              <span
                className="text-lg font-semibold"
                style={{ color: config.color }}
              >
                {score}%
              </span>
            </div>
            <span
              className="text-xs"
              style={{ color: textSecondary }}
            >
              {evidence.length} evidence point{evidence.length !== 1 ? 's' : ''} &middot; {Math.round(confidence * 100)}% confident
            </span>
          </div>
        </div>

        {/* Expand/Collapse */}
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5" style={{ color: textSecondary }} />
          ) : (
            <ChevronDown className="w-5 h-5" style={{ color: textSecondary }} />
          )}
        </div>
      </button>

      {/* Evidence Cards - Collapsible */}
      {isExpanded && (
        <div className="mt-3 space-y-3 pl-2">
          {evidence.map((item, index) => (
            <EvidenceCard
              key={`${item.platform}-${item.feature}-${index}`}
              item={item}
              dimensionColor={config.color}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Confidence Meter Component
 */
const ConfidenceMeter: React.FC<{
  confidence: number;
  theme: string;
}> = ({ confidence, theme }) => {
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e';
  const percentage = Math.round(confidence * 100);

  let label = 'Low';
  let color = '#F59E0B';
  if (percentage >= 70) {
    label = 'High';
    color = '#10B981';
  } else if (percentage >= 50) {
    label = 'Medium';
    color = '#3B82F6';
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs" style={{ color: textSecondary }}>
        Overall Confidence
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color
          }}
        />
      </div>
      <span
        className="text-xs font-medium"
        style={{ color }}
      >
        {percentage}% ({label})
      </span>
    </div>
  );
};

/**
 * Main Component
 */
const BehavioralEvidencePanel: React.FC<BehavioralEvidencePanelProps> = ({
  evidence,
  personality,
  confidence,
  dataSources,
  className = ''
}) => {
  const { theme } = useTheme();
  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e';

  // Count total evidence items
  const totalEvidence = Object.values(evidence).reduce((sum, items) => sum + items.length, 0);

  // Find dimension with most evidence to auto-expand
  const dimensionWithMostEvidence = (Object.entries(evidence) as [keyof Evidence, EvidenceItem[]][])
    .sort((a, b) => b[1].length - a[1].length)[0]?.[0];

  if (totalEvidence === 0) {
    return (
      <GlassPanel className={className}>
        <div className="text-center py-8">
          <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: textSecondary }} />
          <h3 style={{ color: textColor, fontFamily: 'var(--font-heading)' }}>
            No Evidence Yet
          </h3>
          <p className="mt-2 text-sm" style={{ color: textSecondary }}>
            Connect more platforms to see the research-backed evidence behind your personality profile.
          </p>
        </div>
      </GlassPanel>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <GlassPanel className="!p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }}
            >
              <BookOpen className="w-5 h-5" style={{ color: '#8B5CF6' }} />
            </div>
            <div>
              <h3
                className="text-lg"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 500,
                  color: textColor
                }}
              >
                Why These Scores?
              </h3>
              <p className="text-xs" style={{ color: textSecondary }}>
                {totalEvidence} research-backed insights from your data
              </p>
            </div>
          </div>
        </div>

        {/* Confidence Meter */}
        <ConfidenceMeter confidence={confidence.overall} theme={theme} />
      </GlassPanel>

      {/* Dimension Sections */}
      <div className="space-y-2">
        {(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const).map(dim => (
          <DimensionSection
            key={dim}
            dimension={dim}
            evidence={evidence[dim]}
            score={personality[dim]}
            confidence={confidence.by_dimension[dim]}
            theme={theme}
            defaultExpanded={dim === dimensionWithMostEvidence}
          />
        ))}
      </div>

      {/* Footer Note */}
      <div
        className="mt-4 p-3 rounded-lg text-center"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
        }}
      >
        <p className="text-xs" style={{ color: textSecondary }}>
          All correlations are based on peer-reviewed research. Effect sizes indicate how strongly each behavior predicts personality traits.
        </p>
      </div>
    </div>
  );
};

export default BehavioralEvidencePanel;
