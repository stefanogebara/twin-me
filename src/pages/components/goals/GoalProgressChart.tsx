/**
 * GoalProgressChart
 *
 * Displays a grid of small dots representing tracked days.
 * Green = target met, red = missed, gray = not yet tracked.
 * Shows the last 14-30 days depending on available data.
 */

import React from 'react';
import type { GoalProgress } from '@/services/api/goalsAPI';

// Design tokens
const TEXT_MUTED = 'var(--text-muted)';

interface GoalProgressChartProps {
  progress: GoalProgress[];
  durationDays: number;
  startDate: string | null;
}

const GoalProgressChart: React.FC<GoalProgressChartProps> = ({
  progress,
  durationDays,
  startDate,
}) => {
  // Build a map of tracked_date -> target_met for fast lookup
  const progressMap = new Map<string, boolean>();
  for (const entry of progress) {
    progressMap.set(entry.tracked_date, entry.target_met);
  }

  // Determine how many days to show (last 14-30 days, capped by durationDays)
  const daysToShow = Math.min(Math.max(durationDays, 14), 30);
  const today = new Date();

  // Build the array of day data going backwards from today
  const days: Array<{ date: string; status: 'met' | 'missed' | 'future' }> = [];

  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Check if this date is before the goal start date
    const isBeforeStart = startDate && dateStr < startDate.split('T')[0];
    // Check if this date is in the future
    const isFuture = dateStr > today.toISOString().split('T')[0];

    if (isBeforeStart || isFuture) {
      days.push({ date: dateStr, status: 'future' });
    } else if (progressMap.has(dateStr)) {
      days.push({
        date: dateStr,
        status: progressMap.get(dateStr) ? 'met' : 'missed',
      });
    } else {
      days.push({ date: dateStr, status: 'future' });
    }
  }

  const getColor = (status: 'met' | 'missed' | 'future'): string => {
    switch (status) {
      case 'met':
        return '#10b981';
      case 'missed':
        return '#ef4444';
      case 'future':
        return 'var(--glass-surface-bg)';
    }
  };

  const getLabel = (status: 'met' | 'missed' | 'future'): string => {
    switch (status) {
      case 'met':
        return 'Target met';
      case 'missed':
        return 'Target missed';
      case 'future':
        return 'Not tracked';
    }
  };

  if (days.length === 0) {
    return (
      <div
        className="text-xs py-2"
        style={{ color: TEXT_MUTED }}
      >
        No progress data yet
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {days.map((day) => (
          <div
            key={day.date}
            className="w-3 h-3 rounded-sm transition-colors"
            style={{ backgroundColor: getColor(day.status) }}
            title={`${day.date}: ${getLabel(day.status)}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 pt-0.5">
        <div className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: getColor('met') }}
          />
          <span
            className="text-[10px]"
            style={{ color: TEXT_MUTED }}
          >
            Met
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: getColor('missed') }}
          />
          <span
            className="text-[10px]"
            style={{ color: TEXT_MUTED }}
          >
            Missed
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: getColor('future') }}
          />
          <span
            className="text-[10px]"
            style={{ color: TEXT_MUTED }}
          >
            Not tracked
          </span>
        </div>
      </div>
    </div>
  );
};

export default GoalProgressChart;
