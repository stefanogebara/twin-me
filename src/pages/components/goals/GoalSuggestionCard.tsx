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
      className="-mx-1 px-1 py-3 rounded-[4px] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <CategoryIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: PILL_STYLE.text }} />

        <div className="flex-1 min-w-0">
          {/* Title + actions row */}
          <div className="flex items-start justify-between gap-3">
            <h3
              className="text-sm font-medium leading-snug"
              style={{ color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}
            >
              {goal.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onAccept(goal.id)}
                disabled={isLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] disabled:opacity-40"
                style={{
                  background: 'rgba(120,200,170,0.12)',
                  border: '1px solid rgba(120,200,170,0.2)',
                  color: 'rgba(120,200,170,0.9)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {isAccepting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Accept
              </button>
              <button
                onClick={() => onDismiss(goal.id)}
                disabled={isLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.96] disabled:opacity-40"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.35)',
                }}
              >
                {isDismissing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Description */}
          {goal.description && (
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {goal.description}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {goal.target_value != null && goal.target_unit && (
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Target: {goal.target_operator === '>=' ? '' : goal.target_operator + ' '}
                {goal.target_value} {goal.target_unit === 'ms' ? 'HRV ms' : goal.target_unit}
              </span>
            )}
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {goal.duration_days}d
            </span>
            {goal.source_platform && (
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                via {formatPlatformName(goal.source_platform)}
              </span>
            )}
            {goal.source_observation && (
              <span className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {goal.source_observation}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

GoalSuggestionCard.displayName = 'GoalSuggestionCard';

export default GoalSuggestionCard;
