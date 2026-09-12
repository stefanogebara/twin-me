/**
 * PendingProposalsBadge
 *
 * A text link above the chat input showing the count of pending
 * department proposals. Click opens a menu with the list and
 * approve/dismiss buttons for each.
 *
 * Design: the register. An ink underlined link (it was a glass pill with a
 * pulsing dot); the menu is white with a hairline and a 4px corner.
 */

import { useState, useEffect, useCallback } from 'react';
import { Check, X, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { departmentsAPI, type Proposal } from '@/services/api/departmentsAPI';
import { useToast } from '@/components/ui/use-toast';

interface PendingProposalsBadgeProps {
  /** Optional callback when a proposal is approved (to sync inline cards) */
  onProposalApproved?: (id: string) => void;
  /** Optional callback when a proposal is rejected */
  onProposalRejected?: (id: string) => void;
}

export function PendingProposalsBadge({
  onProposalApproved,
  onProposalRejected,
}: PendingProposalsBadgeProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchProposals = useCallback(async () => {
    try {
      const data = await departmentsAPI.getProposals();
      setProposals(data);
    } catch {
      // Silently fail -- badge just won't show
    }
  }, []);

  // Poll for proposals every 30s and on mount
  useEffect(() => {
    fetchProposals();
    const interval = setInterval(fetchProposals, 30000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

  const handleApprove = useCallback(async (id: string) => {
    setLoadingIds(prev => new Set([...prev, id]));
    try {
      await departmentsAPI.approveProposal(id);
      setProposals(prev => prev.filter(p => p.id !== id));
      onProposalApproved?.(id);
    } catch {
      toast({
        title: 'Approval failed',
        description: 'Could not approve this action. Try again.',
      });
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [onProposalApproved, toast]);

  const handleReject = useCallback(async (id: string) => {
    setLoadingIds(prev => new Set([...prev, id]));
    try {
      await departmentsAPI.rejectProposal(id);
      setProposals(prev => prev.filter(p => p.id !== id));
      onProposalRejected?.(id);
    } catch {
      toast({
        title: 'Dismiss failed',
        description: 'Could not dismiss this action. Try again.',
      });
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [onProposalRejected, toast]);

  // Don't render if no pending proposals
  if (proposals.length === 0) return null;

  return (
    <div className="relative">
      {/* Popover dropdown -- positioned above the badge */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop to close on outside click */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute bottom-full mb-2 left-0 right-0 z-50 max-h-[320px] overflow-y-auto"
              style={{
                // A menu in the register: white, a hairline, a 4 corner, no shadow or glass.
                background: 'var(--rg-white)',
                border: '1px solid var(--rg-rule)',
                borderRadius: 'var(--rg-radius)',
                padding: '12px 12px 0',
              }}
            >
              <h4 className="rg-row-title" style={{ margin: '0 0 8px' }}>
                Waiting for your approval
              </h4>

              <ul className="rg-list" style={{ margin: 0 }}>
                {proposals.map((proposal) => {
                  const isLoading = loadingIds.has(proposal.id);
                  return (
                    <li
                      key={proposal.id}
                      className="flex items-start gap-3"
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--rg-rule)',
                        opacity: isLoading ? 0.5 : 1,
                        pointerEvents: isLoading ? 'none' : 'auto',
                      }}
                    >
                      {/* The department's colour is a mark, never the text. */}
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: proposal.departmentColor, marginTop: 6 }}
                      />
                      <span className="rg-row-text flex-1">
                        <span className="rg-row-title">{proposal.department}</span>
                        <span className="rg-row-line">{proposal.description}</span>
                      </span>

                      {/* Approve / Reject: 24px icon buttons */}
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          className="rg-iconbtn"
                          onClick={() => handleApprove(proposal.id)}
                          aria-label={`Approve ${proposal.department} proposal`}
                          title="Approve"
                        >
                          <Check aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="rg-iconbtn"
                          onClick={() => handleReject(proposal.id)}
                          aria-label={`Dismiss ${proposal.department} proposal`}
                          title="Dismiss"
                        >
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* A text link, not a pill: ink, underlined, nothing pulses. */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 transition-opacity duration-200 hover:opacity-70"
        style={{
          background: 'none',
          border: 0,
          padding: '4px 0',
          minHeight: 24,
          font: 'inherit',
          color: 'var(--rg-ink)',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          cursor: 'pointer',
        }}
        aria-expanded={isOpen}
        aria-label={`${proposals.length} pending proposal${proposals.length !== 1 ? 's' : ''}`}
      >
        {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} waiting for you
        <ChevronUp
          aria-hidden="true"
          className="w-4 h-4 transition-transform duration-200"
          style={{ color: 'var(--rg-ink-2)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
    </div>
  );
}
