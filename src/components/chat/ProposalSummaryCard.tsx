/**
 * ProposalSummaryCard
 *
 * Multi-proposal summary card for the chat stream.
 * Shows when several departments have pending proposals at once
 * (e.g. during a morning briefing). Glass card aesthetic with
 * per-proposal approve/reject and a bulk "Approve All" action.
 */

import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

interface SummaryProposal {
  id: string;
  department: string;
  departmentColor: string;
  description: string;
}

interface ProposalSummaryCardProps {
  proposals: SummaryProposal[];
  onApproveAll: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewInDepartments?: () => void;
}

export function ProposalSummaryCard({
  proposals,
  onApproveAll,
  onApprove,
  onReject,
  onReviewInDepartments,
}: ProposalSummaryCardProps) {
  if (proposals.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-[20px] px-5 py-4 my-2 w-full max-w-[520px]"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow:
          '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <h3
        className="text-[14px] font-medium mb-3"
        style={{
          color: '#F5F5F4',
          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          letterSpacing: '-0.01em',
        }}
      >
        Pending from your departments
      </h3>

      {/* Proposal list */}
      <div className="space-y-0">
        {proposals.map((proposal, index) => (
          <div
            key={proposal.id}
            className="flex items-start gap-2.5 py-2.5"
            style={{
              borderBottom:
                index < proposals.length - 1
                  ? '1px solid rgba(255,255,255,0.04)'
                  : undefined,
            }}
          >
            {/* Department dot + text */}
            <div
              className="w-[6px] h-[6px] rounded-full mt-1.5 flex-shrink-0"
              style={{ backgroundColor: proposal.departmentColor }}
            />
            <div className="flex-1 min-w-0">
              <span
                className="text-[10px] font-medium uppercase tracking-[0.06em] block mb-0.5"
                style={{
                  color: proposal.departmentColor,
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                }}
              >
                {proposal.department}
              </span>
              <p
                className="text-[13px] leading-snug"
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                }}
              >
                {proposal.description}
              </p>
            </div>

            {/* Per-item approve/reject icons */}
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <button
                onClick={() => onApprove(proposal.id)}
                className="p-1 rounded-md transition-all duration-150 hover:scale-110"
                style={{ color: 'rgba(255,255,255,0.35)' }}
                aria-label={`Approve ${proposal.department} proposal`}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onReject(proposal.id)}
                className="p-1 rounded-md transition-all duration-150 hover:scale-110"
                style={{ color: 'rgba(255,255,255,0.25)' }}
                aria-label={`Reject ${proposal.department} proposal`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div
        className="flex items-center gap-3 mt-3 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={onApproveAll}
          className="flex items-center gap-1 px-3 py-1.5 rounded-[100px] text-[11px] font-medium transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
          style={{
            backgroundColor: '#F5F5F4',
            color: '#110f0f',
            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          }}
        >
          Approve All
        </button>
        {onReviewInDepartments && (
          <button
            onClick={onReviewInDepartments}
            className="text-[11px] font-medium transition-opacity duration-150 hover:opacity-60"
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            Review in Departments
          </button>
        )}
      </div>
    </motion.div>
  );
}
