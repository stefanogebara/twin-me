/**
 * InboxTile
 *
 * Single proposal in the /inbox stream. Renders 4 states:
 *   - pending: shows "Do it" + "Skip" actions
 *   - done   : shows ✓ "Did it" badge (user approved)
 *   - skipped: shows × "Skipped" badge
 *   - expired: shows muted "Expired" badge
 *
 * Phase 2 of the /departments → /inbox collapse.
 */

import React from 'react';
import { Check, X, Loader2, Clock } from 'lucide-react';
import type { InboxItem } from '@/services/api/inboxAPI';

interface InboxTileProps {
  item: InboxItem;
  isLoading: boolean;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_LABEL: Record<InboxItem['status'], string> = {
  pending: 'Needs decision',
  done: 'Did it',
  skipped: 'Skipped',
  expired: 'Expired',
};

const InboxTile: React.FC<InboxTileProps> = ({ item, isLoading, onApprove, onSkip }) => {
  const isPending = item.status === 'pending';

  return (
    <div
      className="relative flex gap-3 px-5 py-4 rounded-[20px] backdrop-blur-[42px] transition-opacity"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        opacity: isLoading ? 0.5 : 1,
      }}
    >
      {/* Department color stripe (left, 3px) */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: item.departmentColor }}
        aria-hidden
      />

      <div className="flex-1 min-w-0 pl-2">
        <p
          className="text-[14px] leading-snug font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {item.title}
        </p>

        {item.why && item.why !== item.title && (
          <p
            className="text-[13px] mt-1 leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {item.why}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <span
            className="text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {timeAgo(item.sortAt)}
          </span>
          {!isPending && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <ResolvedBadge status={item.status} />
            </>
          )}
        </div>
      </div>

      {/* Action buttons (pending only) */}
      {isPending && (
        <div className="flex items-start gap-2 flex-shrink-0">
          <button
            onClick={() => onApprove(item.id)}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-[100px] text-[12px] font-medium transition-opacity hover:opacity-90 active:scale-[0.97]"
            style={{ background: '#F5F5F4', color: '#110f0f' }}
            aria-label={`Approve: ${item.title}`}
          >
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Do it
          </button>
          <button
            onClick={() => onSkip(item.id)}
            disabled={isLoading}
            className="px-2 py-1.5 rounded-[6px] text-[12px] transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
            aria-label={`Skip: ${item.title}`}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
};

const ResolvedBadge: React.FC<{ status: InboxItem['status'] }> = ({ status }) => {
  const ICON: Record<InboxItem['status'], React.ReactNode> = {
    pending: null,
    done: <Check className="w-3 h-3" />,
    skipped: <X className="w-3 h-3" />,
    expired: <Clock className="w-3 h-3" />,
  };
  const COLOR: Record<InboxItem['status'], string> = {
    pending: 'var(--text-muted)',
    done: '#10B981',
    skipped: 'var(--text-muted)',
    expired: 'var(--text-muted)',
  };
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: COLOR[status] }}
    >
      {ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  );
};

export default InboxTile;
