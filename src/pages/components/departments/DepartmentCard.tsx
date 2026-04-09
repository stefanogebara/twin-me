/**
 * DepartmentCard
 *
 * Compact single-row glass card for a department.
 * Shows icon + name + description on left, autonomy dropdown + toggle on right.
 * Budget bar as a barely-visible thin line at bottom.
 * Expands on click to reveal full autonomy selector.
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

  const formatCost = (value: number): string =>
    `$${value.toFixed(2)}`;

  return (
    <div
      className="transition-all duration-200 hover:border-[rgba(255,255,255,0.14)]"
      style={{
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.08)',
        opacity: isEnabled ? 1 : 0.5,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      onClick={() => setIsExpanded((prev) => !prev)}
    >
      {/* Main row: icon + name/desc | autonomy dropdown + budget + toggle */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Left: icon + text */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: `${config.color}1A` }}
          >
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className="text-sm font-medium leading-snug truncate"
                style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
              >
                {config.name}
              </h3>
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: isEnabled ? config.color : 'rgba(255,255,255,0.15)',
                }}
              />
            </div>
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}
            >
              {config.description}
            </p>
          </div>
        </div>

        {/* Right: autonomy label + budget text + toggle */}
        <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Compact autonomy dropdown */}
          <AutonomySelector
            level={autonomyLevel}
            color={config.color}
            onChange={onAutonomyChange}
            disabled={!isEnabled}
            compact
          />

          {/* Budget inline */}
          <span
            className="text-[10px] hidden sm:inline"
            style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
          >
            {formatCost(budget.spent)}/{formatCost(budget.total)}
          </span>

          {/* Toggle switch */}
          <button
            role="switch"
            aria-checked={isEnabled}
            aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${config.name}`}
            onClick={() => onToggle(!isEnabled)}
            className="relative w-9 h-[18px] rounded-full transition-colors duration-200 ease-out flex-shrink-0"
            style={{
              backgroundColor: isEnabled ? config.color : 'rgba(255,255,255,0.10)',
            }}
          >
            <div
              className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-200 ease-out"
              style={{ left: isEnabled ? '20px' : '2px' }}
            />
          </button>
        </div>
      </div>

      {/* Budget bar */}
      <div
        className="h-[4px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            backgroundColor: budgetPercent < 50
              ? 'rgba(34,197,94,0.5)'
              : budgetPercent < 80
                ? 'rgba(245,158,11,0.5)'
                : 'rgba(239,68,68,0.5)',
            width: `${budgetPercent}%`,
          }}
        />
      </div>

      {/* Department stats line */}
      {stats && stats.totalProposals > 0 && (
        <div
          className="px-4 py-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}
        >
          <span
            className="text-[11px]"
            style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
          >
            {stats.totalProposals} proposal{stats.totalProposals !== 1 ? 's' : ''}
            {' | '}
            {stats.approved} approved
            {' | '}
            {formatCost(budget.spent)} spent
          </span>
        </div>
      )}

      {/* Expanded: full autonomy selector */}
      {isExpanded && (
        <div
          className="px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="text-[10px] block mb-2"
            style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
          >
            Autonomy Level
          </span>
          <AutonomySelector
            level={autonomyLevel}
            color={config.color}
            onChange={onAutonomyChange}
            disabled={!isEnabled}
          />
          {expandedContent && (
            <div
              className="mt-3 pt-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              {expandedContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DepartmentCard;
