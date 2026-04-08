/**
 * BudgetBar
 *
 * Thin progress bar showing department budget usage.
 * Color shifts from green to amber to red based on spend threshold.
 */

import React from 'react';

interface BudgetBarProps {
  spent: number;
  total: number;
  color: string;
}

const BudgetBar: React.FC<BudgetBarProps> = ({ spent, total }) => {
  const percent = total > 0 ? Math.min((spent / total) * 100, 100) : 0;

  const barColor =
    percent < 50
      ? 'rgba(34,197,94,0.7)'   // green
      : percent < 80
        ? 'rgba(245,158,11,0.7)' // amber
        : 'rgba(239,68,68,0.7)'; // red

  const formatCost = (value: number): string => {
    return value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(2)}`;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span
          className="text-[10px]"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          {formatCost(spent)} / {formatCost(total)}
        </span>
      </div>
      <div
        className="h-[4px] rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ backgroundColor: barColor, width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default BudgetBar;
