/**
 * TemplateCard
 *
 * Selectable tile card for a Life Operating System template.
 * 140px tall, clean border, icon + name + tagline + apply/active.
 * No glass blur — flat dark surface with hairline border.
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
      className="flex flex-col justify-between p-3.5 flex-shrink-0 transition-all duration-200 cursor-pointer"
      style={{
        width: '160px',
        minHeight: '140px',
        borderRadius: '12px',
        background: isActive ? `${color}0D` : 'transparent',
        border: isActive
          ? `1px solid ${color}40`
          : '1px solid rgba(255,255,255,0.08)',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.15)';
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.08)';
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }
      }}
    >
      {/* Top: icon + name */}
      <div>
        <Icon
          className="w-6 h-6 mb-2"
          style={{ color }}
        />
        <h3
          className="text-[14px] font-semibold leading-snug"
          style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
        >
          {name}
        </h3>
        <p
          className="text-[12px] mt-0.5 line-clamp-2"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          {tagline}
        </p>
      </div>

      {/* Bottom: apply / active */}
      {isActive ? (
        <div className="flex items-center gap-1.5">
          <Check className="w-3 h-3" style={{ color }} />
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
          className="text-[12px] font-medium transition-colors duration-150 disabled:opacity-50 text-left"
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
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
