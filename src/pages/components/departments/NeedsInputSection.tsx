/**
 * NeedsInputSection -- Proposals requiring user approval
 * Glass cards with department color, status badge, Review/Not now buttons.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, Loader2 } from 'lucide-react';

const DEPT_COLORS: Record<string, string> = {
  communications: '#3B82F6',
  scheduling: '#8B5CF6',
  health: '#EF4444',
  content: '#F59E0B',
  finance: '#10B981',
  research: '#6366F1',
  social: '#EC4899',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Proposal {
  id: string;
  department: string;
  description: string;
  toolName?: string;
  createdAt: string;
}

interface NeedsInputSectionProps {
  proposals: Proposal[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  loadingId: string | null;
}

const NeedsInputSection: React.FC<NeedsInputSectionProps> = ({
  proposals,
  onApprove,
  onReject,
  loadingId,
}) => {
  if (proposals.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider"
          style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316' }}
        >
          Needs input
        </span>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {proposals.length} pending
        </span>
      </div>

      <div className="space-y-2">
        {proposals.map((proposal, i) => {
          const color = DEPT_COLORS[proposal.department] || '#6366F1';
          const isLoading = loadingId === proposal.id;
          const deptName = proposal.department.charAt(0).toUpperCase() + proposal.department.slice(1);

          return (
            <motion.div
              key={proposal.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
              className="rounded-[16px] px-4 py-3"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium" style={{ color }}>
                    {deptName}
                  </span>
                  <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {proposal.description}
                  </p>
                  <span className="text-[11px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(proposal.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                  <button
                    onClick={() => onApprove(proposal.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                    style={{
                      background: '#F5F5F4',
                      color: '#110f0f',
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Review
                  </button>
                  <button
                    onClick={() => onReject(proposal.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default NeedsInputSection;
