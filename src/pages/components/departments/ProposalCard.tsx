/**
 * ProposalCard
 *
 * Clean hairline-border row for a pending proposal.
 * Dept dot + description + approve/dismiss on the right.
 * No glass card — just a bottom-border row.
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
      className="flex items-start gap-3 py-3 transition-colors duration-150"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontFamily: "'Inter', sans-serif",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {/* Department color dot */}
      <div
        className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
        style={{ backgroundColor: departmentColor }}
      />

      {/* Description + meta */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] leading-snug"
          style={{ color: 'var(--foreground)' }}
        >
          {description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {estimatedCost > 0 && (
            <span
              className="text-[11px]"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              ~${estimatedCost.toFixed(2)}
            </span>
          )}
          <span
            className="text-[11px]"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            {timeAgo}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onApprove(id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-[100px] text-[11px] font-medium transition-opacity duration-150 hover:opacity-90 active:scale-[0.97]"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
          }}
          aria-label="Approve and run proposal"
          title="Execute this action now"
        >
          <Check className="w-3 h-3" />
          Approve
        </button>
        <button
          onClick={() => onReject(id)}
          className="p-1.5 rounded-[6px] text-[11px] transition-opacity duration-150 hover:opacity-70 active:scale-[0.97]"
          style={{
            color: 'rgba(255,255,255,0.35)',
            background: 'none',
            border: 'none',
          }}
          aria-label="Dismiss proposal"
          title="Dismiss this proposal"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ProposalCard;
