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
      className="px-4 py-3 my-2 w-full max-w-[520px]"
      style={{
        // The register: white, a hairline, a 4 corner. No glass, no shadow.
        backgroundColor: 'var(--rg-white)',
        border: '1px solid var(--rg-rule)',
        borderRadius: 'var(--rg-radius)',
      }}
    >
      {/* Header */}
      <h3
        className="text-[14px] font-medium mb-3"
        style={{
          color: 'var(--foreground)',
          fontFamily: 'var(--font-ui)',
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
                  ? '1px solid var(--border-glass)'
                  : undefined,
            }}
          >
            {/* Department dot + text */}
            <div
              className="w-[6px] h-[6px] rounded-full mt-1.5 flex-shrink-0"
              style={{ backgroundColor: proposal.departmentColor }}
            />
            <div className="flex-1 min-w-0">
              <span className="rg-row-title block">{proposal.department}</span>
              <p className="rg-row-line">{proposal.description}</p>
            </div>

            {/* Per-item approve/reject icons */}
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <button
                onClick={() => onApprove(proposal.id)}
                className="p-1 rounded-md transition-all duration-150 hover:scale-110"
                style={{ color: 'var(--text-muted)' }}
                aria-label={`Approve ${proposal.department} proposal`}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onReject(proposal.id)}
                className="p-1 rounded-md transition-all duration-150 hover:scale-110"
                style={{ color: 'var(--text-muted)' }}
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
        style={{ borderTop: '1px solid var(--border-glass)' }}
      >
        <button type="button" onClick={onApproveAll} className="n-btn n-btn--ghost" style={{ fontWeight: 500 }}>
          Approve all
        </button>
        {onReviewInDepartments && (
          <button type="button" onClick={onReviewInDepartments} className="n-btn n-btn--ghost">
            Review in departments
          </button>
        )}
      </div>
    </motion.div>
  );
}
