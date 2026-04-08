/**
 * ProposalCard
 *
 * Displays a pending proposal from a department.
 * Approve = filled pill, Reject = ghost button.
 */

import React from 'react';
import { Check, X } from 'lucide-react';

interface ProposalCardProps {
  id: string;
  department: string;
  departmentColor: string;
  description: string;
  estimatedCost: number;
  createdAt: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({
  id,
  department,
  departmentColor,
  description,
  estimatedCost,
  createdAt,
  onApprove,
  onReject,
}) => {
  const timeAgo = (() => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  })();

  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Department color dot */}
      <div
        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        style={{ backgroundColor: departmentColor }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-snug"
          style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
        >
          {description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[10px]"
            style={{ color: departmentColor, fontFamily: "'Inter', sans-serif" }}
          >
            {department}
          </span>
          {estimatedCost > 0 && (
            <span
              className="text-[10px]"
              style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
            >
              ~${estimatedCost.toFixed(2)}
            </span>
          )}
          <span
            className="text-[10px]"
            style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}
          >
            {timeAgo}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onApprove(id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-[100px] text-[11px] font-medium transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
          }}
          aria-label="Approve proposal"
        >
          <Check className="w-3 h-3" />
          Approve
        </button>
        <button
          onClick={() => onReject(id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-all duration-150 ease-out hover:opacity-60 active:scale-[0.97]"
          style={{
            color: 'rgba(255,255,255,0.4)',
          }}
          aria-label="Reject proposal"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default ProposalCard;
