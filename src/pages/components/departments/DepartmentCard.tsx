/**
 * DepartmentCard
 *
 * Glass card for a single AI department.
 * Shows icon, name, colored status dot, autonomy selector,
 * budget bar, action count, and enable/disable toggle.
 */

import React from 'react';
import {
  Brain,
  Heart,
  TrendingUp,
  Calendar,
  Users,
  Shield,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import AutonomySelector from './AutonomySelector';
import BudgetBar from './BudgetBar';

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
};

const DepartmentCard: React.FC<DepartmentCardProps> = ({
  config,
  autonomyLevel,
  budget,
  actionsThisWeek,
  isEnabled,
  onAutonomyChange,
  onToggle,
}) => {
  const Icon = ICON_MAP[config.icon] || Brain;

  return (
    <div
      className="p-5 space-y-5 transition-all duration-200 hover:-translate-y-[2px] hover:border-[rgba(255,255,255,0.14)]"
      style={{
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.08)',
        opacity: isEnabled ? 1 : 0.5,
      }}
    >
      {/* Header: Icon + name + dot + toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: `${config.color}1A`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>
          <div className="min-w-0">
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

        {/* Toggle switch */}
        <button
          role="switch"
          aria-checked={isEnabled}
          aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${config.name}`}
          onClick={() => onToggle(!isEnabled)}
          className="relative w-9 h-[18px] rounded-full transition-colors duration-200 ease-out flex-shrink-0 mt-1"
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

      {/* Autonomy selector */}
      <div>
        <span
          className="text-[10px] block mb-2"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          Autonomy
        </span>
        <AutonomySelector
          level={autonomyLevel}
          color={config.color}
          onChange={onAutonomyChange}
          disabled={!isEnabled}
        />
      </div>

      {/* Budget bar */}
      <BudgetBar spent={budget.spent} total={budget.total} color={config.color} />

      {/* Actions this week */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px]"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          {actionsThisWeek} {actionsThisWeek === 1 ? 'action' : 'actions'} this week
        </span>
      </div>
    </div>
  );
};

export default DepartmentCard;
