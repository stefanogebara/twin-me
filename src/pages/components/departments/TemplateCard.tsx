/**
 * TemplateCard
 *
 * Compact glass pill for a Life Operating System template.
 * Renders as a small horizontal chip: icon + name + tagline + apply link.
 * Uses same dark glass styling as department cards.
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
  tagline,
  icon,
  color,
  isActive,
  onApply,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const Icon = ICON_MAP[icon] || Zap;

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0 transition-all duration-200 hover:border-[rgba(255,255,255,0.14)]"
      style={{
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: isActive
          ? `1px solid ${color}40`
          : '1px solid rgba(255,255,255,0.08)',
        maxWidth: '280px',
      }}
    >
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}1A` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>

      {/* Name + tagline */}
      <div className="min-w-0 flex-1">
        <h3
          className="text-[12px] font-medium leading-snug truncate"
          style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
        >
          {name}
        </h3>
        <p
          className="text-[10px] truncate"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
        >
          {tagline}
        </p>
      </div>

      {/* Apply / Active */}
      {isActive ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Check className="w-3 h-3" style={{ color }} />
          <span
            className="text-[10px] font-medium"
            style={{ color, fontFamily: "'Inter', sans-serif" }}
          >
            Active
          </span>
        </div>
      ) : (
        <button
          onClick={handleApply}
          disabled={isApplying}
          className="text-[10px] font-medium transition-colors duration-150 flex-shrink-0 disabled:opacity-50"
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          {isApplying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            'Apply'
          )}
        </button>
      )}
    </div>
  );
};

export default TemplateCard;
