/**
 * InboxTile
 *
 * Single proposal in the /inbox stream. Two kinds:
 *   - advice: toolName=suggest (or suggestion). Clicking "Got it" only
 *             acknowledges — the twin makes no API call.
 *   - action: toolName=gmail_draft, calendar_create, docs_create, etc.
 *             Clicking "Do it" runs the underlying tool (saves draft to
 *             Gmail, adds event to Calendar, creates a Doc).
 *
 * Resolved tile shows "Noted" badge for advice, "Did it" for action.
 */

import React from 'react';
import { Check, X, Loader2, Clock, Undo2, AlertCircle } from 'lucide-react';
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

type ProposalKind = 'advice' | 'gmail' | 'calendar' | 'doc' | 'action';

function kindOf(toolName: string | null): ProposalKind {
  if (!toolName) return 'action';
  const t = toolName.toLowerCase();
  if (t === 'suggest' || t === 'suggestion') return 'advice';
  if (t.includes('mail') || t === 'draft') return 'gmail';
  if (t.includes('calendar') || t.includes('event')) return 'calendar';
  if (t.includes('doc')) return 'doc';
  return 'action';
}

const PRIMARY_LABEL: Record<ProposalKind, string> = {
  advice: 'Got it',
  gmail: 'Do it',
  calendar: 'Do it',
  doc: 'Do it',
  action: 'Do it',
};

const OUTCOME_HINT: Record<ProposalKind, string | null> = {
  advice: null,
  gmail: 'Will save a draft in Gmail',
  calendar: 'Will add this to your calendar',
  doc: 'Will create a Google Doc',
  action: null,
};

const RESOLVED_DONE_LABEL: Record<ProposalKind, string> = {
  advice: 'Noted',
  gmail: 'Draft saved',
  calendar: 'Added to calendar',
  doc: 'Doc created',
  action: 'Did it',
};

const InboxTile: React.FC<InboxTileProps> = ({ item, isLoading, onApprove, onSkip }) => {
  const isPending = item.status === 'pending';
  const kind = kindOf(item.toolName);
  const primaryLabel = PRIMARY_LABEL[kind];
  const outcomeHint = OUTCOME_HINT[kind];

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

        {/* Evidence — the observation that triggered this proposal */}
        {item.reasoning && (
          <p
            className="text-[12px] mt-1.5 leading-relaxed italic"
            style={{ color: 'var(--text-muted)' }}
          >
            Because: {item.reasoning}
          </p>
        )}

        {/* Outcome hint — only for action tiles in pending state */}
        {isPending && outcomeHint && (
          <p
            className="text-[11px] mt-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            {outcomeHint}
          </p>
        )}

        {/* Failure reason — surfaced when the underlying tool API rejected the action */}
        {item.status === 'failed' && item.failureReason && (
          <p
            className="text-[12px] mt-1.5 leading-relaxed"
            style={{ color: '#dc2626' }}
          >
            {item.failureReason}
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
              <ResolvedBadge status={item.status} kind={kind} />
              {item.status === 'done' && item.outcomeLink && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <a
                    href={item.outcomeLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline-offset-2 hover:underline transition-opacity"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {item.outcomeLink.label}
                  </a>
                </>
              )}
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
            aria-label={`${primaryLabel}: ${item.title}`}
          >
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {primaryLabel}
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

const ResolvedBadge: React.FC<{ status: InboxItem['status']; kind: ProposalKind }> = ({ status, kind }) => {
  const ICON: Record<InboxItem['status'], React.ReactNode> = {
    pending: null,
    done: <Check className="w-3 h-3" />,
    skipped: <X className="w-3 h-3" />,
    expired: <Clock className="w-3 h-3" />,
    undone: <Undo2 className="w-3 h-3" />,
    failed: <AlertCircle className="w-3 h-3" />,
  };
  const COLOR: Record<InboxItem['status'], string> = {
    pending: 'var(--text-muted)',
    done: kind === 'advice' ? 'var(--text-secondary)' : '#10B981',
    skipped: 'var(--text-muted)',
    expired: 'var(--text-muted)',
    undone: 'var(--text-muted)',
    failed: '#dc2626',
  };
  const LABEL: Record<InboxItem['status'], string> = {
    pending: 'Needs decision',
    done: RESOLVED_DONE_LABEL[kind],
    skipped: 'Skipped',
    expired: 'Expired',
    undone: 'Undone',
    failed: 'Failed',
  };
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: COLOR[status] }}
    >
      {ICON[status]}
      {LABEL[status]}
    </span>
  );
};

export default InboxTile;
