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
  Clock,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  XCircle,
} from 'lucide-react';
import GoalProgressChart from './GoalProgressChart';
import { TEXT_PRIMARY, TEXT_SECONDARY, BORDER_COLOR, PILL_STYLE, CATEGORY_LABELS, CATEGORY_ICONS } from './goalStyles';
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
      className="p-5 space-y-4"
      style={{
        borderRadius: '12px',
        background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: `1px solid var(--glass-surface-border, #d9d1cb)`,
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Header: Category badge + title */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: PILL_STYLE.bg,
              border: `1px solid ${PILL_STYLE.border}`,
            }}
          >
            <CategoryIcon className="w-3.5 h-3.5" style={{ color: PILL_STYLE.text }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className="text-sm font-medium leading-snug truncate"
              style={{ color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}
            >
              {goal.title}
            </h4>
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-[11px] mt-1.5"
              style={{
                background: PILL_STYLE.bg,
                color: PILL_STYLE.text,
                border: `1px solid ${PILL_STYLE.border}`,
              }}
            >
              {categoryLabel}
            </span>
          </div>
        </div>

        {isCompleted && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium flex-shrink-0"
            style={{
              background: 'rgba(255, 132, 0, 0.08)',
              color: '#ff8400',
              border: '1px solid rgba(255, 132, 0, 0.15)',
            }}
          >
            <Trophy className="w-3 h-3" />
            Done
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
            Progress
          </span>
          <span className="text-[10px] font-medium" style={{ color: TEXT_PRIMARY }}>
            {progressPercent}%
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--glass-surface-bg-subtle, rgba(218,217,215,0.2))' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ backgroundColor: '#ff8400', width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
            {goal.total_days_met}/{goal.total_days_tracked} days met
          </span>
          {goal.target_value != null && goal.target_unit && (
            <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
              Target: {goal.target_value}{goal.target_unit === 'percent' ? '%' : goal.target_unit === 'ms' ? ' HRV ms' : ` ${goal.target_unit}`}
            </span>
          )}
        </div>
      </div>

      {/* Streak + days remaining row */}
      <div className="flex items-center gap-3 flex-wrap">
        {goal.current_streak > 0 && (
          <div className="flex items-center gap-1">
            <Flame
              className="w-3.5 h-3.5"
              style={{ color: goal.current_streak >= 3 ? '#f97316' : TEXT_SECONDARY }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: goal.current_streak >= 3 ? '#f97316' : TEXT_PRIMARY }}
            >
              {goal.current_streak}d streak
            </span>
          </div>
        )}

        {goal.best_streak > 0 && (
          <div className="flex items-center gap-1">
            <Trophy className="w-3 h-3" style={{ color: TEXT_SECONDARY }} />
            <span className="text-[10px]" style={{ color: TEXT_SECONDARY }}>
              Best: {goal.best_streak}d
            </span>
          </div>
        )}

        {!isCompleted && daysRemaining != null && (
          <div className="flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" style={{ color: TEXT_SECONDARY }} />
            <span
              className="text-[10px]"
              style={{ color: daysRemaining <= 3 ? '#f97316' : TEXT_SECONDARY }}
            >
              {daysRemaining}d left
            </span>
          </div>
        )}
      </div>

      {/* Expandable section */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full pt-1 transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97]"
        style={{ color: TEXT_SECONDARY }}
      >
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        <span className="text-[10px]">
          {expanded ? 'Less' : 'Details'}
        </span>
      </button>

      {expanded && (
        <div
          className="space-y-3 pt-3"
          style={{ borderTop: `1px solid ${BORDER_COLOR}` }}
        >
          {goal.description && (
            <p
              className="text-xs leading-relaxed"
              style={{ color: TEXT_SECONDARY, fontFamily: "'Inter', sans-serif" }}
            >
              {goal.description}
            </p>
          )}

          <div className="pt-1">
            <GoalProgressChart
              progress={progress}
              durationDays={goal.duration_days}
              startDate={goal.start_date}
            />
          </div>

          {!isCompleted && (
            <div className="pt-2">
              {showAbandonConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: TEXT_SECONDARY }}>
                    Are you sure?
                  </span>
                  <button
                    onClick={handleAbandonClick}
                    disabled={isAbandoning}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97] disabled:opacity-40"
                    style={{ color: '#ef4444' }}
                  >
                    {isAbandoning ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    Yes, abandon
                  </button>
                  <button
                    onClick={() => setShowAbandonConfirm(false)}
                    className="px-3 py-1 rounded-lg text-xs transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97]"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAbandonClick}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97]"
                  style={{ color: '#ef4444' }}
                >
                  <XCircle className="w-3 h-3" />
                  Abandon goal
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
