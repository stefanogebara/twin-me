/**
 * PendingProposalsBadge
 *
 * Small floating pill badge near the chat input showing the count of
 * pending department proposals. Click opens a popover with the list
 * and approve/dismiss buttons for each.
 *
 * Design: glass surface, rounded-[20px], backdrop-blur per Claura spec.
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
              className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-[20px] px-4 py-3 max-h-[280px] overflow-y-auto"
              style={{
                backgroundColor: 'rgba(30,28,36,0.95)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <h4
                className="text-[12px] font-medium mb-2 uppercase tracking-[0.06em]"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                }}
              >
                Pending proposals
              </h4>

              <div className="space-y-0">
                {proposals.map((proposal, index) => {
                  const isLoading = loadingIds.has(proposal.id);
                  return (
                    <div
                      key={proposal.id}
                      className="flex items-start gap-2.5 py-2.5"
                      style={{
                        borderBottom:
                          index < proposals.length - 1
                            ? '1px solid rgba(255,255,255,0.04)'
                            : undefined,
                        opacity: isLoading ? 0.5 : 1,
                        pointerEvents: isLoading ? 'none' : 'auto',
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
                          className="text-[12px] leading-snug"
                          style={{
                            color: 'rgba(255,255,255,0.55)',
                            fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                          }}
                        >
                          {proposal.description}
                        </p>
                      </div>

                      {/* Approve / Reject buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => handleApprove(proposal.id)}
                          className="p-1 rounded-md transition-all duration-150 hover:scale-110"
                          style={{ color: 'rgba(255,255,255,0.4)' }}
                          aria-label={`Approve ${proposal.department} proposal`}
                          title="Approve"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleReject(proposal.id)}
                          className="p-1 rounded-md transition-all duration-150 hover:scale-110"
                          style={{ color: 'rgba(255,255,255,0.25)' }}
                          aria-label={`Dismiss ${proposal.department} proposal`}
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Badge pill */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[20px] transition-all duration-150 hover:opacity-80"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.10)',
          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
        }}
        aria-label={`${proposals.length} pending proposal${proposals.length !== 1 ? 's' : ''}`}
      >
        {/* Pulsing dot */}
        <div
          className="w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{
            backgroundColor: '#F5F5F4',
            animation: 'proposal-badge-pulse 2s ease-in-out infinite',
          }}
        />
        <span
          className="text-[11px] font-medium"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
        </span>
        <ChevronUp
          className="w-3 h-3 transition-transform duration-200"
          style={{
            color: 'rgba(255,255,255,0.25)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
        <style>{`
          @keyframes proposal-badge-pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}</style>
      </button>
    </div>
  );
}
