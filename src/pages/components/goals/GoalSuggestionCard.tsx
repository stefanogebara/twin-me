/**
 * GoalSuggestionCard
 *
 * Displays a goal suggestion from the twin with accept/dismiss actions.
 * Typography-driven dark design — no glass cards, no motion.
 */

import React from 'react';
import {
  Sparkles,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { TEXT_PRIMARY, TEXT_SECONDARY, BORDER_COLOR, PILL_STYLE, CATEGORY_ICONS } from './goalStyles';
import type { Goal } from '@/services/api/goalsAPI';

const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  google_calendar: 'Google Calendar',
  youtube: 'YouTube',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  reddit: 'Reddit',
  twitch: 'Twitch',
  whoop: 'Whoop',
  gmail: 'Gmail',
};

const formatPlatformName = (platform: string): string =>
  PLATFORM_LABELS[platform] || platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

interface GoalSuggestionCardProps {
  goal: Goal;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  isAccepting: boolean;
  isDismissing: boolean;
  index: number;
}

const GoalSuggestionCard = React.forwardRef<HTMLDivElement, GoalSuggestionCardProps>(({
  goal,
  onAccept,
  onDismiss,
  isAccepting,
  isDismissing,
}, ref) => {
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Sparkles;
  const isLoading = isAccepting || isDismissing;

  return (
    <div
      ref={ref}
      className="p-5 mb-4"
      style={{
        borderRadius: '20px',
        background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '0.67px solid var(--glass-surface-border, #d9d1cb)',
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: PILL_STYLE.bg,
            border: `1px solid ${PILL_STYLE.border}`,
          }}
        >
          <CategoryIcon className="w-4 h-4" style={{ color: PILL_STYLE.text }} />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          <h4
            className="text-sm font-medium leading-snug"
            style={{ color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}
          >
            {goal.title}
          </h4>

          {/* Description */}
          {goal.description && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
            >
              {goal.description}
            </p>
          )}

          {/* Source observation */}
          {goal.source_observation && (
            <p
              className="text-[11px] italic"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Based on: {goal.source_observation}
            </p>
          )}

          {/* Goal details pills */}
          <div className="flex flex-wrap items-center gap-2">
            {goal.target_value != null && goal.target_unit && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  background: PILL_STYLE.bg,
                  color: PILL_STYLE.text,
                  border: `1px solid ${PILL_STYLE.border}`,
                }}
              >
                Target: {goal.target_operator === '>=' ? '' : goal.target_operator + ' '}
                {goal.target_value} {goal.target_unit === 'ms' ? 'HRV ms' : goal.target_unit}
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded-full text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: TEXT_SECONDARY,
                border: `1px solid ${BORDER_COLOR}`,
              }}
            >
              {goal.duration_days} days
            </span>
            {goal.source_platform && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] capitalize"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: TEXT_SECONDARY,
                  border: `1px solid ${BORDER_COLOR}`,
                }}
              >
                via {formatPlatformName(goal.source_platform)}
              </span>
            )}
          </div>

          {/* Accept / Dismiss buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onAccept(goal.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:opacity-40"
              style={{
                backgroundColor: '#ff8400',
                color: '#0a0f0a',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {isAccepting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Accept
            </button>
            <button
              onClick={() => onDismiss(goal.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.96] disabled:opacity-40"
              style={{ color: TEXT_SECONDARY }}
            >
              {isDismissing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

GoalSuggestionCard.displayName = 'GoalSuggestionCard';

export default GoalSuggestionCard;
