/**
 * DepartmentProposalBubble
 *
 * Compact inline chat bubble for a single department proposal.
 * Appears in the message stream when the twin mentions a pending action.
 * Left border accent in department color, approve/dismiss buttons.
 */

import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

export type ProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed';

export interface ProposalData {
  id: string;
  department: string;
  departmentColor: string;
  description: string;
  toolName: string;
  estimatedCost: number;
  createdAt: string;
}

interface DepartmentProposalBubbleProps {
  proposal: ProposalData;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  status: ProposalStatus;
}

function formatCost(cost: number): string {
  if (cost <= 0) return '';
  return cost < 0.01 ? '<$0.01 est.' : `$${cost.toFixed(3)} est.`;
}

export function DepartmentProposalBubble({
  proposal,
  onApprove,
  onReject,
  status,
}: DepartmentProposalBubbleProps) {
  const isDimmed = status === 'rejected';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDimmed ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="px-4 py-3 my-2 max-w-[420px]"
      style={{
        // The register: white, a hairline, a 4 corner; the department colour
        // is the left mark and the dot, never the label's text colour.
        backgroundColor: 'var(--rg-white)',
        border: '1px solid var(--rg-rule)',
        borderLeft: `2px solid ${proposal.departmentColor}`,
        borderRadius: 'var(--rg-radius)',
      }}
    >
      {/* Department */}
      <div className="flex items-center gap-1.5 mb-1">
        <div
          aria-hidden="true"
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ backgroundColor: proposal.departmentColor }}
        />
        <span className="rg-row-title">{proposal.department}</span>
      </div>

      {/* Description */}
      <p className="rg-row-line" style={{ marginBottom: 8 }}>
        {proposal.description}
      </p>

      {/* Cost estimate */}
      {proposal.estimatedCost > 0 && (
        <p className="text-[13px] mb-3" style={{ color: 'var(--rg-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          {formatCost(proposal.estimatedCost)}
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2">
        {status === 'pending' && (
          <>
            <button type="button" onClick={() => onApprove(proposal.id)} className="n-btn n-btn--ghost" style={{ fontWeight: 500 }}>
              Approve
            </button>
            <button type="button" onClick={() => onReject(proposal.id)} className="n-btn n-btn--ghost">
              Dismiss
            </button>
          </>
        )}

        {(status === 'approved' || status === 'executing') && (
          <div className="flex items-center gap-1.5">
            <Loader2
              className="w-3 h-3 animate-spin"
              style={{ color: 'var(--text-muted)' }}
            />
            <span
              className="text-[11px] font-medium"
              style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-ui)',
                animation: 'proposal-pulse 2s ease-in-out infinite',
              }}
            >
              Approved -- executing...
            </span>
            <style>{`
              @keyframes proposal-pulse {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 0.7; }
              }
            `}</style>
          </div>
        )}

        {status === 'completed' && (
          <div className="flex items-center gap-1.5">
            <Check
              className="w-3.5 h-3.5"
              style={{ color: 'var(--n-verdigris)' }}
            />
            <span
              className="text-[11px] font-medium"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Done
            </span>
          </div>
        )}

        {status === 'rejected' && (
          <span
            className="text-[11px] font-medium"
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Dismissed
          </span>
        )}
      </div>
    </motion.div>
  );
}
