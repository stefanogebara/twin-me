/**
 * TemplateCard
 *
 * Glass card for a Life Operating System template.
 * Shows icon, name, tagline, department count, total budget,
 * and an apply button with active state.
 */

import React, { useState } from 'react';
import {
  Zap,
  HeartPulse,
  PenLine,
  Crown,
  Check,
  Loader2,
  type LucideIcon,
} from 'lucide-react';

interface TemplateCardProps {
  id: string;
  name: string;
  description: string;
  tagline: string;
  icon: string;
  color: string;
  departmentCount: number;
  totalBudget: number;
  isActive: boolean;
  onApply: (id: string) => Promise<void>;
}

const ICON_MAP: Record<string, LucideIcon> = {
  'zap': Zap,
  'heart-pulse': HeartPulse,
  'pen-line': PenLine,
  'crown': Crown,
};

const TemplateCard: React.FC<TemplateCardProps> = ({
  id,
  name,
  description,
  tagline,
  icon,
  color,
  departmentCount,
  totalBudget,
  isActive,
  onApply,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const Icon = ICON_MAP[icon] || Zap;

  const handleApply = async () => {
    if (isActive || isApplying) return;
    setIsApplying(true);
    try {
      await onApply(id);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className="flex flex-col p-5 min-w-[260px] max-w-[300px] flex-shrink-0 transition-all duration-200"
      style={{
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: isActive
          ? `1px solid ${color}40`
          : '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Header: Icon + Name */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: `${color}15`,
            border: `1px solid ${color}30`,
          }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </div>
        <div className="min-w-0">
          <h3
            className="text-sm font-medium leading-snug truncate"
            style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
          >
            {name}
          </h3>
          <p
            className="text-[11px] mt-0.5 truncate"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
          >
            {tagline}
          </p>
        </div>
      </div>

      {/* Description */}
      <p
        className="text-[12px] leading-relaxed mb-4 flex-1"
        style={{
          color: 'rgba(255,255,255,0.35)',
          fontFamily: "'Inter', sans-serif",
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {description}
      </p>

      {/* Meta: department count + budget */}
      <div className="flex items-center gap-3 mb-4">
        <span
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          {departmentCount} {departmentCount === 1 ? 'department' : 'departments'}
        </span>
        <span
          className="w-[3px] h-[3px] rounded-full"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        />
        <span
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          ${totalBudget.toFixed(2)}/mo
        </span>
      </div>

      {/* Apply / Active button */}
      {isActive ? (
        <div
          className="flex items-center justify-center gap-1.5 rounded-[100px] px-3 py-2"
          style={{
            background: `${color}20`,
            border: `1px solid ${color}30`,
          }}
        >
          <Check className="w-3.5 h-3.5" style={{ color }} />
          <span
            className="text-[12px] font-medium"
            style={{ color, fontFamily: "'Inter', sans-serif" }}
          >
            Active
          </span>
        </div>
      ) : (
        <button
          onClick={handleApply}
          disabled={isApplying}
          className="flex items-center justify-center gap-1.5 rounded-[100px] px-3 py-2 transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
          style={{
            background: '#F5F5F4',
            color: '#110f0f',
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {isApplying ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : null}
          {isApplying ? 'Applying...' : 'Apply'}
        </button>
      )}
    </div>
  );
};

export default TemplateCard;
