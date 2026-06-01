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
import { Check, X, Loader2, Clock, Undo2, AlertCircle, Moon, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { InboxItem } from '@/services/api/inboxAPI';
import { departmentsAPI } from '@/services/api/departmentsAPI';

interface InboxTileProps {
  item: InboxItem;
  isLoading: boolean;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
  onSnooze?: (id: string, hours: number) => void;
}

/**
 * Map a tool's failureReason to a reconnect CTA when the error is a stale
 * OAuth token. Backend tools surface "Token decryption failed - user must
 * reconnect google_<platform>" when the encrypted refresh token in
 * platform_connections can't be decrypted (key rotation, deletion, etc).
 * In that case the only fix is for the user to redo the OAuth flow — we
 * link straight to the Settings reconnect URL pattern that handles this.
 */
function detectReconnect(reason: string): { label: string; url: string } | null {
  if (!reason) return null;
  const lower = reason.toLowerCase();
  if (!lower.includes('reconnect')) return null;
  const RECONNECT_TARGETS: Array<{ key: string; label: string; url: string }> = [
    { key: 'google_gmail', label: 'Reconnect Gmail', url: '/settings?reconnect=gmail' },
    { key: 'google_calendar', label: 'Reconnect Calendar', url: '/settings?reconnect=calendar' },
  ];
  const match = RECONNECT_TARGETS.find((t) => lower.includes(t.key));
  if (match) return { label: match.label, url: match.url };
  // Fallback: generic connections anchor when we can't infer the platform.
  if (lower.includes('token decryption') || lower.includes('reconnect')) {
    return { label: 'Reconnect platform', url: '/settings#connections' };
  }
  return null;
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

const InboxTile: React.FC<InboxTileProps> = ({ item, isLoading, onApprove, onSkip, onSnooze }) => {
  const isPending = item.status === 'pending';
  const isSnoozed = item.status === 'snoozed';
  const [snoozeMenuOpen, setSnoozeMenuOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
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

        {/* Preview — collapsed by default. Shows the actual draft body /
            event time / doc title BEFORE the user clicks Do it so they can
            decide informed. Only renders on pending/snoozed tiles. */}
        {(isPending || isSnoozed) && item.preview && (
          <div className="mt-1.5">
            <button
              onClick={() => setPreviewOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] transition-opacity hover:opacity-80"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0 }}
              aria-expanded={previewOpen}
              aria-label={previewOpen ? 'Hide preview' : 'Show preview'}
            >
              {previewOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Preview
            </button>
            {previewOpen && <PreviewBody itemId={item.id} preview={item.preview} editable={isPending} />}
          </div>
        )}

        {/* Failure reason — surfaced when the underlying tool API rejected the action */}
        {item.status === 'failed' && item.failureReason && (
          <div className="mt-1.5">
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: '#dc2626' }}
            >
              {item.failureReason}
            </p>
            {(() => {
              const recon = detectReconnect(item.failureReason);
              return recon ? (
                <a
                  href={recon.url}
                  className="inline-block mt-1.5 px-2.5 py-1 rounded-[100px] text-[11px] font-medium transition-opacity hover:opacity-90"
                  style={{ background: '#F5F5F4', color: '#110f0f' }}
                >
                  {recon.label}
                </a>
              ) : null;
            })()}
          </div>
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
              {isSnoozed && item.snoozedUntil && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    until {new Date(item.snoozedUntil).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </>
              )}
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
          {onSnooze && (
            <div className="relative">
              <button
                onClick={() => setSnoozeMenuOpen((v) => !v)}
                disabled={isLoading}
                className="flex items-center gap-0.5 px-2 py-1.5 rounded-[6px] text-[12px] transition-opacity hover:opacity-70"
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                aria-label={`Snooze: ${item.title}`}
                aria-haspopup="menu"
                aria-expanded={snoozeMenuOpen}
              >
                Later
                <ChevronDown className="w-3 h-3" />
              </button>
              {snoozeMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-10 rounded-[12px] backdrop-blur-[42px] py-1 min-w-[140px]"
                  style={{
                    background: 'rgba(40,37,36,0.95)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                  role="menu"
                >
                  {[
                    { hours: 1,  label: '1 hour'   },
                    { hours: 4,  label: '4 hours'  },
                    { hours: 24, label: 'Tomorrow' },
                  ].map(({ hours, label }) => (
                    <button
                      key={hours}
                      onClick={() => {
                        setSnoozeMenuOpen(false);
                        onSnooze(item.id, hours);
                      }}
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      role="menuitem"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
    snoozed: <Moon className="w-3 h-3" />,
  };
  const COLOR: Record<InboxItem['status'], string> = {
    pending: 'var(--text-muted)',
    done: kind === 'advice' ? 'var(--text-secondary)' : '#10B981',
    skipped: 'var(--text-muted)',
    expired: 'var(--text-muted)',
    undone: 'var(--text-muted)',
    failed: '#dc2626',
    snoozed: 'var(--text-secondary)',
  };
  const LABEL: Record<InboxItem['status'], string> = {
    pending: 'Needs decision',
    done: RESOLVED_DONE_LABEL[kind],
    skipped: 'Skipped',
    expired: 'Expired',
    undone: 'Undone',
    failed: 'Failed',
    snoozed: 'Snoozed',
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

/**
 * Renders the unfolded preview of a proposal's payload.
 *
 * - gmail_draft on pending rows is editable inline (to/subject/body).
 *   Edit mode persists field state locally; Save calls the PATCH route
 *   and refetches the inbox stream. Cancel reverts to the server value.
 * - Calendar event / doc previews remain read-only.
 */
const PreviewBody: React.FC<{
  itemId: string;
  preview: NonNullable<InboxItem['preview']>;
  editable: boolean;
}> = ({ itemId, preview, editable }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [draftTo, setDraftTo] = React.useState('');
  const [draftSubject, setDraftSubject] = React.useState('');
  const [draftBody, setDraftBody] = React.useState('');

  const fmtDateTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const containerStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'var(--text-secondary)',
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--text-primary)',
  };

  const startEdit = () => {
    if (preview.kind !== 'gmail_draft') return;
    setDraftTo(preview.to || '');
    setDraftSubject(preview.subject || '');
    setDraftBody(preview.body || '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (preview.kind !== 'gmail_draft') return;
    setSaving(true);
    // Only send fields that actually changed — keeps the PATCH minimal
    // and avoids sending null over a field the user didn't touch.
    const updates: { to?: string; subject?: string; body?: string } = {};
    if (draftTo !== (preview.to || '')) updates.to = draftTo;
    if (draftSubject !== (preview.subject || '')) updates.subject = draftSubject;
    if (draftBody !== (preview.body || '')) updates.body = draftBody;
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      setSaving(false);
      return;
    }
    try {
      const r = await departmentsAPI.editProposalPreview(itemId, updates);
      if (r.success) {
        toast.success('Draft updated');
        setEditing(false);
        await queryClient.invalidateQueries({ queryKey: ['inbox'] });
      } else {
        toast.error(r.error || 'Could not save edits');
      }
    } catch {
      toast.error('Could not save edits. Try again?');
    } finally {
      setSaving(false);
    }
  };

  if (preview.kind === 'gmail_draft') {
    if (editing) {
      return (
        <div className="mt-1.5 px-3 py-2.5 rounded-[10px] text-[12px] leading-relaxed" style={containerStyle}>
          <label className="block">
            <span style={{ color: 'var(--text-muted)' }}>To</span>
            <input
              type="email"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="mt-1 w-full rounded-[6px] px-2.5 py-1.5 text-[12px]"
              style={inputStyle}
              maxLength={320}
              placeholder="recipient@example.com"
            />
          </label>
          <label className="block mt-2">
            <span style={{ color: 'var(--text-muted)' }}>Subject</span>
            <input
              type="text"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
              className="mt-1 w-full rounded-[6px] px-2.5 py-1.5 text-[12px]"
              style={inputStyle}
              maxLength={200}
            />
          </label>
          <label className="block mt-2">
            <span style={{ color: 'var(--text-muted)' }}>Body</span>
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-[6px] px-2.5 py-1.5 text-[12px] resize-y"
              style={inputStyle}
              maxLength={4000}
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={saveEdit}
              disabled={saving}
              className="px-3 py-1 rounded-[100px] text-[12px] font-medium transition-opacity hover:opacity-90 active:scale-[0.97]"
              style={{ background: '#F5F5F4', color: '#110f0f' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="px-2 py-1 text-[12px] transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-1.5 px-3 py-2.5 rounded-[10px] text-[12px] leading-relaxed" style={containerStyle}>
        {preview.to && (
          <div><span style={{ color: 'var(--text-muted)' }}>To: </span>{preview.to}</div>
        )}
        {preview.subject && (
          <div className="mt-0.5"><span style={{ color: 'var(--text-muted)' }}>Subject: </span>{preview.subject}</div>
        )}
        {preview.body && (
          <div className="mt-1.5 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {preview.body}
          </div>
        )}
        {editable && (
          <button
            onClick={startEdit}
            className="mt-2 inline-flex items-center gap-1 text-[11px] transition-opacity hover:opacity-80"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0 }}
            aria-label="Edit draft"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>
    );
  }

  if (preview.kind === 'calendar_event') {
    return (
      <div className="mt-1.5 px-3 py-2.5 rounded-[10px] text-[12px] leading-relaxed" style={containerStyle}>
        {preview.summary && (
          <div style={{ color: 'var(--text-primary)' }}>{preview.summary}</div>
        )}
        {(preview.start || preview.end) && (
          <div className="mt-0.5"><span style={{ color: 'var(--text-muted)' }}>When: </span>{fmtDateTime(preview.start)}{preview.end ? ` → ${fmtDateTime(preview.end)}` : ''}</div>
        )}
        {preview.location && (
          <div className="mt-0.5"><span style={{ color: 'var(--text-muted)' }}>Where: </span>{preview.location}</div>
        )}
      </div>
    );
  }

  if (preview.kind === 'doc') {
    return (
      <div className="mt-1.5 px-3 py-2.5 rounded-[10px] text-[12px] leading-relaxed" style={containerStyle}>
        {preview.title && (
          <div><span style={{ color: 'var(--text-muted)' }}>Title: </span><span style={{ color: 'var(--text-primary)' }}>{preview.title}</span></div>
        )}
      </div>
    );
  }

  return null;
};

export default InboxTile;
