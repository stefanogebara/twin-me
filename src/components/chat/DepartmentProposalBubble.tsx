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
      className="rounded-[20px] px-4 py-3 my-2 max-w-[420px]"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderLeft: `2px solid ${proposal.departmentColor}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Department label pill */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ backgroundColor: proposal.departmentColor }}
        />
        <span
          className="text-[10px] font-medium uppercase tracking-[0.08em]"
          style={{
            color: proposal.departmentColor,
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          {proposal.department}
        </span>
      </div>

      {/* Description */}
      <p
        className="text-[13px] leading-relaxed mb-2"
        style={{
          color: '#D1D5DB',
          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
        }}
      >
        {proposal.description}
      </p>

      {/* Cost estimate */}
      {proposal.estimatedCost > 0 && (
        <p
          className="text-[10px] mb-3"
          style={{
            color: 'rgba(255,255,255,0.25)',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          {formatCost(proposal.estimatedCost)}
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2">
        {status === 'pending' && (
          <>
            <button
              onClick={() => onApprove(proposal.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-[100px] text-[11px] font-medium transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
              style={{
                backgroundColor: '#F5F5F4',
                color: '#110f0f',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              Approve
            </button>
            <button
              onClick={() => onReject(proposal.id)}
              className="text-[11px] font-medium transition-opacity duration-150 hover:opacity-60"
              style={{
                color: 'rgba(255,255,255,0.35)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              Dismiss
            </button>
          </>
        )}

        {(status === 'approved' || status === 'executing') && (
          <div className="flex items-center gap-1.5">
            <Loader2
              className="w-3 h-3 animate-spin"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            />
            <span
              className="text-[11px] font-medium"
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
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
              style={{ color: '#10b77f' }}
            />
            <span
              className="text-[11px] font-medium"
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
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
              color: 'rgba(255,255,255,0.25)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            Dismissed
          </span>
        )}
      </div>
    </motion.div>
  );
}
