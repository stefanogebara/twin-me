import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Music, Calendar, Activity, Brain, BookOpen, Users, Heart, Sparkles, FlaskConical } from 'lucide-react';

// Types for evidence data
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

interface PersonalityEvidence {
  openness: EvidenceItem[];
  conscientiousness: EvidenceItem[];
  extraversion: EvidenceItem[];
  agreeableness: EvidenceItem[];
  neuroticism: EvidenceItem[];
}

interface ConfidenceScores {
  overall: number;
  by_dimension: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

interface BehavioralEvidencePanelProps {
  evidence: PersonalityEvidence;
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  confidence: ConfidenceScores;
  dataSources?: Record<string, { days: number; events: number }>;
}

// Dimension configuration matching Big Five colors from SoulSignatureDashboard
const DIMENSION_CONFIG = {
  openness: {
    label: 'Openness',
    description: 'Intellectual curiosity, creativity, preference for novelty',
    icon: BookOpen,
    color: '#8b5cf6', // Purple
  },
  conscientiousness: {
    label: 'Conscientiousness',
    description: 'Organization, dependability, self-discipline',
    icon: Activity,
    color: '#22c55e', // Green
  },
  extraversion: {
    label: 'Extraversion',
    description: 'Energy, assertiveness, social engagement',
    icon: Users,
    color: '#f59e0b', // Amber
  },
  agreeableness: {
    label: 'Agreeableness',
    description: 'Cooperation, trust, helpfulness',
    icon: Heart,
    color: '#06b6d4', // Cyan
  },
  neuroticism: {
    label: 'Emotional Stability',
    description: 'Calm, resilience, emotional regulation (inverse of Neuroticism)',
    icon: Brain,
    color: '#ef4444', // Red
  },
};

// Platform icons
const PLATFORM_ICONS: Record<string, typeof Music> = {
  spotify: Music,
  calendar: Calendar,
  whoop: Activity,
};

// Evidence card component
const EvidenceCard: React.FC<{ item: EvidenceItem; theme: string }> = ({ item, theme }) => {
  const PlatformIcon = PLATFORM_ICONS[item.platform] || Brain;
  const correlationSign = item.correlation >= 0 ? '+' : '';
  const correlationPercent = Math.abs(item.correlation * 100).toFixed(0);

  const effectSizeColor = {
    small: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
    medium: '#6366F1',
    large: '#10B981',
  }[item.effect_size];

  return (
    <div
      className="p-3 rounded-xl transition-all hover:scale-[1.01]"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(0, 0, 0, 0.02)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <PlatformIcon className="w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }} />
          <span className="text-sm font-medium capitalize" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            {item.platform}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${effectSizeColor}20`,
                    color: effectSizeColor,
                  }}
                >
                  {item.effect_size}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Effect size: {item.effect_size}</p>
                <p className="text-xs opacity-70">
                  {item.effect_size === 'small' && 'r = 0.10-0.29'}
                  {item.effect_size === 'medium' && 'r = 0.30-0.49'}
                  {item.effect_size === 'large' && 'r >= 0.50'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
            }}
          >
            {correlationSign}{correlationPercent}%
          </span>
        </div>
      </div>

      <p className="text-sm mb-2" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c' }}>
        {item.description}
      </p>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            className="text-xs cursor-help"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
          >
            📚 {item.citation}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">Research source: {item.citation}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

// Dimension section component
const DimensionSection: React.FC<{
  dimension: keyof typeof DIMENSION_CONFIG;
  score: number;
  evidence: EvidenceItem[];
  confidence: number;
  theme: string;
}> = ({ dimension, score, evidence, confidence, theme }) => {
  const config = DIMENSION_CONFIG[dimension];
  const Icon = config.icon;

  // For neuroticism, show as "Emotional Stability" (inverted)
  const displayScore = dimension === 'neuroticism' ? 100 - score : score;

  return (
    <AccordionItem
      value={dimension}
      className="rounded-xl mb-3 overflow-hidden"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.01)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)',
      }}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${config.color}15` }}
            >
              <Icon className="w-5 h-5" style={{ color: config.color }} />
            </div>
            <div className="text-left">
              <div className="font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
                {config.label}
              </div>
              <div className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
                {evidence.length} evidence items
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xl font-bold" style={{ color: config.color }}>
                {Math.round(displayScore)}%
              </div>
              <div className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
                {confidence > 0.7 ? 'High' : confidence > 0.4 ? 'Medium' : 'Low'} confidence
              </div>
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-2">
        <div className="mb-3">
          <div className="h-1.5 rounded-full overflow-hidden" style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
          }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${displayScore}%`,
                backgroundColor: config.color,
                opacity: 0.7
              }}
            />
          </div>
        </div>

        <p className="text-sm mb-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e' }}>
          {config.description}
        </p>

        {evidence.length > 0 ? (
          <div className="space-y-2">
            <div
              className="text-sm font-medium mb-2 flex items-center gap-2"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c' }}
            >
              <Sparkles className="w-4 h-4" style={{ color: config.color }} />
              Supporting Evidence
            </div>
            {evidence.map((item, index) => (
              <EvidenceCard key={`${item.platform}-${item.feature}-${index}`} item={item} theme={theme} />
            ))}
          </div>
        ) : (
          <div
            className="text-sm text-center py-4 rounded-lg"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e',
            }}
          >
            Connect platforms to see behavioral evidence for this dimension.
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

// Main component
export const BehavioralEvidencePanel: React.FC<BehavioralEvidencePanelProps> = ({
  evidence,
  personality,
  confidence,
  dataSources,
}) => {
  const { theme } = useTheme();
  const totalEvidence = Object.values(evidence).flat().length;
  const connectedPlatforms = Object.keys(dataSources || {}).length;

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" style={{ color: '#8b5cf6' }} />
          <h3 className="text-lg font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            Research-Backed Evidence
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
            }}
          >
            {totalEvidence} insights
          </span>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
            }}
          >
            {connectedPlatforms} platforms
          </span>
        </div>
      </div>

      <p className="text-sm mb-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}>
        Personality insights backed by peer-reviewed research from your behavioral data.
      </p>

      {/* Overall confidence */}
      <div
        className="p-4 rounded-xl mb-6"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)',
          border: theme === 'dark' ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid rgba(139, 92, 246, 0.15)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c' }}>
            Overall Confidence
          </span>
          <span className="text-sm font-bold" style={{ color: '#8b5cf6' }}>
            {Math.round(confidence.overall * 100)}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
        }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${confidence.overall * 100}%`,
              backgroundColor: '#8b5cf6',
              opacity: 0.7
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
          Based on {totalEvidence} behavioral signals from {connectedPlatforms} connected platform(s).
        </p>
      </div>

      {/* Dimension accordions */}
      <Accordion type="multiple" defaultValue={['openness']} className="space-y-0">
        {(Object.keys(DIMENSION_CONFIG) as Array<keyof typeof DIMENSION_CONFIG>).map((dim) => (
          <DimensionSection
            key={dim}
            dimension={dim}
            score={personality[dim]}
            evidence={evidence[dim]}
            confidence={confidence.by_dimension[dim]}
            theme={theme}
          />
        ))}
      </Accordion>

      {/* Data sources info */}
      {dataSources && Object.keys(dataSources).length > 0 && (
        <div
          className="mt-4 p-4 rounded-xl"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)',
          }}
        >
          <div className="text-sm font-medium mb-2" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c' }}>
            Data Sources
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.entries(dataSources).map(([platform, info]) => {
              const Icon = PLATFORM_ICONS[platform] || Brain;
              return (
                <div
                  key={platform}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="capitalize">{platform}</span>
                  <span style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
                    {info.days}d / {info.events} events
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BehavioralEvidencePanel;
