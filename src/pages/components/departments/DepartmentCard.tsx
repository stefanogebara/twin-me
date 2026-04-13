/**
 * DepartmentCard
 *
 * Hairline-border row design (dimension.dev style).
 * Left: colored dot + icon + name/description.
 * Right: autonomy label + budget cost + toggle.
 * Expands inline (no card) to reveal full autonomy selector + budget bar.
 */

import React, { useState } from 'react';
import {
  Brain,
  Heart,
  TrendingUp,
  Calendar,
  Users,
  Shield,
  Lightbulb,
  Mail,
  HeartPulse,
  PenLine,
  Wallet,
  Search,
  type LucideIcon,
} from 'lucide-react';
import AutonomySelector from './AutonomySelector';

interface DepartmentStats {
  totalProposals: number;
  approved: number;
  rejected: number;
  approvalRate: number;
}

interface DepartmentCardProps {
  name: string;
  config: {
    name: string;
    description: string;
    icon: string;
    color: string;
  };
  autonomyLevel: number;
  budget: { spent: number; total: number };
  actionsThisWeek: number;
  isEnabled: boolean;
  observationOnly?: boolean; // true if department has no executable tools
  stats?: DepartmentStats;
  expandedContent?: React.ReactNode;
  onAutonomyChange: (level: number) => void;
  onToggle: (enabled: boolean) => void;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Brain,
  Heart,
  TrendingUp,
  Calendar,
  Users,
  Shield,
  Lightbulb,
  Mail,
  HeartPulse,
  PenLine,
  Wallet,
  Search,
};

const AUTONOMY_LABELS: Record<number, string> = {
  0: 'Observe',
  1: 'Suggest',
  2: 'Draft',
  3: 'Act',
  4: 'Auto',
};

const DepartmentCard: React.FC<DepartmentCardProps> = ({
  config,
  autonomyLevel,
  budget,
  isEnabled,
  stats,
  expandedContent,
  onAutonomyChange,
  onToggle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = ICON_MAP[config.icon] || Brain;

  const budgetPercent = budget.total > 0
    ? Math.min((budget.spent / budget.total) * 100, 100)
    : 0;

  const formatCost = (value: number): string => `$${value.toFixed(2)}`;

  const budgetBarColor =
    budgetPercent < 50
      ? 'rgba(34,197,94,0.5)'
      : budgetPercent < 80
        ? 'rgba(245,158,11,0.5)'
        : 'rgba(239,68,68,0.5)';

  return (
    <div
      style={{
        opacity: isEnabled ? 1 : 0.55,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Main row */}
      <div
        className="flex items-center justify-between gap-3 py-4 cursor-pointer transition-colors duration-150"
        style={{ fontFamily: "'Inter', sans-serif" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        {/* Left: dot + icon + name/description */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Colored status dot */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: isEnabled ? config.color : 'rgba(255,255,255,0.15)',
            }}
          />
          {/* 18px icon, no background */}
          <Icon
            className="w-[18px] h-[18px] flex-shrink-0"
            style={{ color: isEnabled ? config.color : 'rgba(255,255,255,0.3)' }}
          />
          <div className="min-w-0 flex-1">
            <span
              className="text-[14px] font-medium leading-snug"
              style={{ color: 'var(--foreground)' }}
            >
              {config.name}
            </span>
            <p
              className="text-[12px] mt-0.5 line-clamp-2 sm:truncate"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              {config.description}
            </p>
          </div>
        </div>

        {/* Right rail */}
        <div
          className="flex items-center gap-4 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Autonomy label */}
          <span
            className="hidden sm:inline text-[12px]"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            {AUTONOMY_LABELS[autonomyLevel] ?? 'Observe'}
          </span>

          {/* Budget */}
          <span
            className="hidden sm:inline text-[12px]"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            title="Monthly API cost for this department"
          >
            {formatCost(budget.spent)}/{formatCost(budget.total)}
          </span>

          {/* Toggle switch — min-h-[44px] wrapper gives adequate touch target */}
          <button
            role="switch"
            aria-checked={isEnabled}
            aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${config.name}`}
            onClick={() => onToggle(!isEnabled)}
            className="relative flex items-center justify-center min-h-[44px] min-w-[44px] flex-shrink-0"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div
              className="relative w-9 h-[18px] rounded-full transition-colors duration-200 ease-out"
              style={{ backgroundColor: isEnabled ? config.color : 'rgba(255,255,255,0.10)' }}
            >
              <div
                className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-200 ease-out"
                style={{ left: isEnabled ? '20px' : '2px' }}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Expanded section — clean indented panel, no card */}
      {isExpanded && (
        <div
          className="pb-4 pl-7"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pt-4 space-y-4">
            {/* Autonomy selector */}
            <div>
              <span
                className="text-[11px] font-medium tracking-[0.08em] uppercase block mb-2"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
              >
                Autonomy Level
              </span>
              <AutonomySelector
                level={autonomyLevel}
                color={config.color}
                onChange={onAutonomyChange}
                disabled={!isEnabled}
              />
            </div>

            {/* Budget bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-[11px] font-medium tracking-[0.08em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
                >
                  Budget
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
                >
                  {formatCost(budget.spent)} / {formatCost(budget.total)}
                </span>
              </div>
              <div
                className="h-[3px] rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${budgetPercent}%`, backgroundColor: budgetBarColor }}
                />
              </div>
            </div>

            {/* Stats line */}
            {stats && stats.totalProposals > 0 && (
              <p
                className="text-[11px]"
                style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
              >
                {stats.totalProposals} proposal{stats.totalProposals !== 1 ? 's' : ''}
                {' · '}
                {stats.approved} approved
                {' · '}
                {formatCost(budget.spent)} spent
              </p>
            )}

            {/* Special department content (e.g. InboxSummary) */}
            {expandedContent && (
              <div
                className="pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
              >
                {expandedContent}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentCard;
