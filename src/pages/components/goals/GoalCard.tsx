/**
 * GoalCard
 *
 * Displays an active or completed goal with progress bar, streaks,
 * days remaining, and an abandon action with confirmation.
 * Typography-driven dark design — no glass cards, no motion.
 */

import React, { useState } from 'react';
import {
  Flame,
  Trophy,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  XCircle,
} from 'lucide-react';
import GoalProgressChart from './GoalProgressChart';
import { TEXT_PRIMARY, TEXT_SECONDARY, PILL_STYLE, CATEGORY_LABELS, CATEGORY_ICONS } from './goalStyles';
import type { Goal, GoalProgress } from '@/services/api/goalsAPI';

interface GoalCardProps {
  goal: Goal;
  progress?: GoalProgress[];
  onAbandon: (id: string) => void;
  isAbandoning: boolean;
  index: number;
}

const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  progress = [],
  onAbandon,
  isAbandoning,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const categoryLabel = CATEGORY_LABELS[goal.category] ?? 'Balance';
  const CategoryIcon = CATEGORY_ICONS[goal.category] ?? Sparkles;

  const progressPercent =
    goal.total_days_tracked > 0
      ? Math.round((goal.total_days_met / goal.total_days_tracked) * 100)
      : 0;

  const daysRemaining = (() => {
    if (!goal.end_date) return null;
    const end = new Date(goal.end_date);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  })();

  const isCompleted = goal.status === 'completed';

  const handleAbandonClick = () => {
    if (showAbandonConfirm) {
      onAbandon(goal.id);
      setShowAbandonConfirm(false);
    } else {
      setShowAbandonConfirm(true);
    }
  };

  return (
    <div
      className="-mx-1 px-1 py-3 rounded-[4px] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {/* Header row: icon + title + right-rail */}
      <div className="flex items-center gap-3">
        <CategoryIcon className="w-4 h-4 flex-shrink-0" style={{ color: PILL_STYLE.text }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3
              className="text-sm font-medium leading-snug truncate"
              style={{ color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}
            >
              {goal.title}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isCompleted && (
                <Trophy className="w-3.5 h-3.5" style={{ color: 'var(--accent-vibrant)' }} />
              )}
              <span
                className="text-sm font-medium tabular-nums"
                style={{
                  color: progressPercent >= 70 ? 'rgba(120,200,170,0.9)'
                    : progressPercent >= 30 ? 'rgba(255,183,130,0.9)'
                    : 'rgba(255,255,255,0.5)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {progressPercent}%
              </span>
            </div>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {categoryLabel}
            {goal.current_streak > 0 && (
              <> · <Flame className="w-3 h-3 inline -mt-0.5" style={{ color: goal.current_streak >= 3 ? '#D4CBBE' : undefined }} /> {goal.current_streak}d</>
            )}
            {!isCompleted && daysRemaining != null && (
              <> · {daysRemaining}d left</>
            )}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 ml-7">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              background: progressPercent >= 70
                ? 'rgba(120,200,170,0.5)'
                : progressPercent >= 30
                ? 'rgba(255,183,130,0.5)'
                : 'rgba(255,255,255,0.2)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {goal.total_days_met}/{goal.total_days_tracked} days
          </span>
          {goal.target_value != null && goal.target_unit && (
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Target: {goal.target_value}{goal.target_unit === 'percent' ? '%' : goal.target_unit === 'ms' ? ' HRV ms' : ` ${goal.target_unit}`}
            </span>
          )}
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 ml-7 mt-1.5 transition-all duration-150 ease-out hover:opacity-70"
        style={{ color: 'rgba(255,255,255,0.25)' }}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${goal.title}` : `Expand ${goal.title}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span className="text-[10px]">{expanded ? 'Less' : 'Details'}</span>
      </button>

      {expanded && (
        <div className="mt-2 ml-7 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
          {goal.description && (
            <p className="text-xs leading-relaxed" style={{ color: TEXT_SECONDARY }}>
              {goal.description}
            </p>
          )}

          {goal.best_streak > 0 && (
            <div className="flex items-center gap-1">
              <Trophy className="w-3 h-3" style={{ color: TEXT_SECONDARY }} />
              <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>Best streak: {goal.best_streak}d</span>
            </div>
          )}

          <GoalProgressChart
            progress={progress}
            durationDays={goal.duration_days}
            startDate={goal.start_date}
          />

          {!isCompleted && (
            <div>
              {showAbandonConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: TEXT_SECONDARY }}>Are you sure?</span>
                  <button
                    onClick={handleAbandonClick}
                    disabled={isAbandoning}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs transition-all hover:opacity-70 disabled:opacity-40"
                    style={{ color: '#ef4444' }}
                  >
                    {isAbandoning ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    Yes, abandon
                  </button>
                  <button
                    onClick={() => setShowAbandonConfirm(false)}
                    className="px-2 py-0.5 text-xs transition-all hover:opacity-70"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAbandonClick}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs transition-all hover:opacity-70"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  <XCircle className="w-3 h-3" />
                  Abandon
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoalCard;
