/**
 * TwinReflection Component
 *
 * Displays a conversational reflection from the digital twin.
 * Redesigned to be visual and engaging - NOT like a textbook.
 *
 * Features:
 * - No quote marks - natural, conversational tone
 * - Visual variety with different section styles
 * - Specific data highlights when available
 */

import React from 'react';
import { Sparkles, TrendingUp, Heart, Lightbulb } from 'lucide-react';

interface TwinReflectionProps {
  reflection: string;
  timestamp?: Date | string;
  confidence?: 'high' | 'medium' | 'low';
  isNew?: boolean;
  className?: string;
}

/**
 * Format time ago in a human-friendly way
 */
function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Observed just now';
  if (diffHours < 24) return `Observed ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Observed ${diffDays}d ago`;
  return `Observed on ${then.toLocaleDateString()}`;
}

export const TwinReflection: React.FC<TwinReflectionProps> = ({
  reflection,
  timestamp,
  confidence,
  isNew = false,
  className = ''
}) => {
  const colors = {
    text: 'var(--foreground)',
    textMuted: 'rgba(255,255,255,0.3)',
    iconBg: 'rgba(139, 92, 246, 0.1)',
    iconColor: '#8B5CF6',
    highlight: 'rgba(139, 92, 246, 0.1)'
  };

  return (
    <div
      className={`p-5 rounded-[20px] ${className}`}
      style={{
        border: '1px solid var(--border-glass)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)'
      }}
    >
      <div className="space-y-4">
        {/* Header with Twin Icon */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: colors.iconBg }}
          >
            <Sparkles
              className="w-4 h-4"
              style={{ color: colors.iconColor }}
            />
          </div>
          <div className="flex-1 flex items-center justify-between">
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: colors.iconColor }}
            >
              Your Twin's Observation
            </span>
            {timestamp && (
              <span
                className="text-xs"
                style={{ color: colors.textMuted }}
              >
                {formatTimeAgo(timestamp)}
              </span>
            )}
          </div>
        </div>

        {/* Main Reflection - No quotes, natural text */}
        <p
          className="text-base leading-relaxed"
          style={{
            color: colors.text,
            fontFamily: "'Inter', sans-serif"
          }}
        >
          {reflection}
        </p>

        {/* Confidence indicator */}
        {confidence && (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: confidence === 'high' ? '#4ade80' :
                  confidence === 'medium' ? '#fbbf24' : '#94a3b8'
              }}
            />
            <span
              className="text-xs"
              style={{ color: colors.textMuted }}
            >
              {confidence === 'high' ? 'High confidence observation' :
                confidence === 'medium' ? 'Emerging pattern' : 'Early observation'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Pattern observation - visual card style instead of quoted text
 */
interface PatternObservationProps {
  text: string;
  occurrences?: 'often' | 'sometimes' | 'noticed';
  className?: string;
}

export const PatternObservation: React.FC<PatternObservationProps> = ({
  text,
  occurrences = 'noticed',
  className = ''
}) => {
  const colors = {
    text: 'var(--foreground)',
    textMuted: 'rgba(255,255,255,0.3)',
    iconColor: occurrences === 'often' ? '#8B5CF6' :
      occurrences === 'sometimes' ? '#06b6d4' : '#a78bfa'
  };

  // Icon based on occurrence type
  const Icon = occurrences === 'often' ? TrendingUp :
    occurrences === 'sometimes' ? Heart : Lightbulb;

  const occurrenceLabel = {
    often: 'Recurring pattern',
    sometimes: 'Sometimes noticed',
    noticed: 'New observation'
  };

  return (
    <div
      className={`p-4 rounded-xl flex items-start gap-3 ${className}`}
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border-glass)'
      }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: `${colors.iconColor}15`
        }}
      >
        <Icon
          className="w-4 h-4"
          style={{ color: colors.iconColor }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-relaxed"
          style={{ color: colors.text }}
        >
          {text}
        </p>
        <span
          className="text-xs mt-1 inline-block"
          style={{ color: colors.textMuted }}
        >
          {occurrenceLabel[occurrences]}
        </span>
      </div>
    </div>
  );
};

/**
 * DataHighlight - Shows specific data in a visual, engaging way
 */
interface DataHighlightProps {
  label: string;
  items: string[];
  icon?: React.ReactNode;
  accentColor?: string;
  className?: string;
}

export const DataHighlight: React.FC<DataHighlightProps> = ({
  label,
  items,
  icon,
  accentColor = '#8B5CF6',
  className = ''
}) => {
  const colors = {
    text: 'var(--foreground)',
    textMuted: 'rgba(255,255,255,0.3)',
    itemBg: 'var(--glass-surface-bg)'
  };

  if (!items || items.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <span style={{ color: accentColor }}>{icon}</span>
        )}
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.textMuted }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 5).map((item) => (
          <span
            key={item}
            className="px-3 py-1.5 rounded-full text-sm"
            style={{
              backgroundColor: colors.itemBg,
              color: colors.text
            }}
          >
            {item}
          </span>
        ))}
        {items.length > 5 && (
          <span
            className="px-3 py-1.5 rounded-full text-sm"
            style={{
              backgroundColor: `${accentColor}20`,
              color: accentColor
            }}
          >
            +{items.length - 5} more
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * StatCard - Mini card showing a key stat
 */
interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accentColor?: string;
  subtitle?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  accentColor = '#8B5CF6',
  subtitle,
  className = ''
}) => {
  const colors = {
    text: 'var(--foreground)',
    textMuted: 'rgba(255,255,255,0.3)',
    bg: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.04)'
  };

  return (
    <div
      className={`p-4 rounded-xl ${className}`}
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <span style={{ color: accentColor }}>{icon}</span>
        )}
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.textMuted }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-xl font-medium"
        style={{ color: colors.text }}
      >
        {value}
      </div>
      {subtitle && (
        <div
          className="text-xs mt-1"
          style={{ color: colors.textMuted }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};

/**
 * TrackCard - Shows a specific song/track visually
 */
interface TrackCardProps {
  name: string;
  artist: string;
  context?: string;
  className?: string;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  name,
  artist,
  context,
  className = ''
}) => {
  const colors = {
    text: 'var(--foreground)',
    textMuted: 'rgba(255,255,255,0.3)',
    spotifyGreen: '#1DB954',
    bg: 'rgba(29, 185, 84, 0.05)',
    border: 'rgba(29, 185, 84, 0.1)'
  };

  return (
    <div
      className={`p-3 rounded-lg flex items-center gap-3 ${className}`}
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`
      }}
    >
      {/* Music icon placeholder */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${colors.spotifyGreen}20` }}
      >
        <span style={{ color: colors.spotifyGreen, fontSize: '18px' }}>♪</span>
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: colors.text }}
        >
          {name}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: colors.textMuted }}
        >
          {artist}
        </div>
      </div>

      {context && (
        <span
          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: `${colors.spotifyGreen}15`,
            color: colors.spotifyGreen
          }}
        >
          {context}
        </span>
      )}
    </div>
  );
};

/**
 * EventCard - Shows a calendar event visually
 */
interface EventCardProps {
  title: string;
  time: string;
  type?: 'meeting' | 'focus' | 'personal' | 'other';
  className?: string;
}

export const EventCard: React.FC<EventCardProps> = ({
  title,
  time,
  type = 'other',
  className = ''
}) => {
  const typeConfig: Record<string, { color: string; icon: string; label: string }> = {
    meeting: { color: '#4285F4', icon: 'M', label: 'Meeting' },
    focus: { color: '#34A853', icon: 'F', label: 'Focus' },
    personal: { color: '#EA4335', icon: 'P', label: 'Personal' },
    presentation: { color: '#FBBC04', icon: 'PR', label: 'Presentation' },
    workout: { color: '#EA4335', icon: 'W', label: 'Workout' },
    interview: { color: '#4285F4', icon: 'I', label: 'Interview' },
    other: { color: '#9AA0A6', icon: '·', label: 'Event' }
  };

  // Default to 'other' if type is not recognized
  const config = typeConfig[type || 'other'] || typeConfig.other;

  const colors = {
    text: 'var(--foreground)',
    textMuted: 'rgba(255,255,255,0.3)',
    bg: `${config.color}10`,
    border: `${config.color}20`
  };

  return (
    <div
      className={`p-3 rounded-lg flex items-center gap-3 ${className}`}
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`
      }}
    >
      {/* Event icon */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${config.color}20` }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: config.color, fontFamily: 'Geist, Inter, sans-serif' }}>{config.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: colors.text }}
        >
          {title}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: colors.textMuted }}
        >
          {time}
        </div>
      </div>

      <span
        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: `${config.color}15`,
          color: config.color
        }}
      >
        {config.label}
      </span>
    </div>
  );
};

export default TwinReflection;
