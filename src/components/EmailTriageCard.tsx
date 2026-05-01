/**
 * EmailTriageCard
 * Renders the inbox intelligence brief: scored emails with summaries and
 * pre-drafted replies. Supports on-demand refresh, per-email dismiss, and
 * sending the draft reply via Gmail. Falls back to clear empty/error states
 * instead of silently hiding when there's nothing to surface.
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, ChevronDown, Copy, ExternalLink, RefreshCw, X, Send } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

interface EmailItem {
  id: string;
  from: string;
  subject: string;
  summary: string;
  draft: string | null;
  score: number;
  category: 'lead' | 'relationship' | 'action_required' | 'fyi' | string;
}

interface InboxBriefMetadata {
  emails?: EmailItem[];
  count?: number;
  dismissed?: string[];
  sent?: string[];
  on_demand?: boolean;
}

interface InboxBrief {
  id: string;
  insight: string;
  created_at: string;
  metadata: InboxBriefMetadata | null;
}

interface InboxResponse {
  success: boolean;
  brief: InboxBrief | null;
  // Present when refresh returned an empty-state brief
  status?: 'ok' | 'gmail_not_connected' | 'no_unread' | 'all_noise' | 'all_low_priority' | 'unknown';
  message?: string;
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.split('@')[0].replace(/[._]/g, ' ').trim();
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

function categoryLabel(cat: string): string {
  return { lead: 'Lead', relationship: 'Relationship', action_required: 'Action needed', fyi: 'FYI' }[cat] ?? cat;
}

function categoryColor(cat: string): string {
  return {
    lead: 'rgba(193,126,44,0.25)',
    relationship: 'rgba(100,160,100,0.25)',
    action_required: 'rgba(200,80,80,0.25)',
  }[cat] ?? 'rgba(255,255,255,0.08)';
}

interface EmailRowProps {
  email: EmailItem;
  onDismiss: (id: string) => Promise<void>;
  onSend: (id: string, body: string) => Promise<void>;
}

const EmailRow: React.FC<EmailRowProps> = ({ email, onDismiss, onSend }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [draftBody, setDraftBody] = useState(email.draft ?? '');
  const [sending, setSending] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const name = extractName(email.from);
  const addr = extractEmail(email.from);
  const replyUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(addr)}&su=${encodeURIComponent(`Re: ${email.subject || ''}`)}&body=${encodeURIComponent(draftBody)}`;

  const copyDraft = async () => {
    if (!draftBody) return;
    await navigator.clipboard.writeText(draftBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      await onDismiss(email.id);
    } finally {
      setDismissing(false);
    }
  };

  const handleSend = async () => {
    if (sending || !draftBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(email.id, draftBody.trim());
      setConfirmSend(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      data-testid="email-row"
      data-email-id={email.id}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px',
        padding: '12px 14px',
        opacity: dismissing ? 0.4 : 1,
        transition: 'opacity 150ms ease-out',
      }}
    >
      {/* Top row: name + category + dismiss + chevron */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: categoryColor(email.category), color: 'rgba(255,255,255,0.7)' }}
            >
              {categoryLabel(email.category)}
            </span>
          </div>
          {email.subject && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {email.subject}
            </p>
          )}
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {email.summary}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            data-testid="email-dismiss-btn"
            className="p-1 rounded transition-opacity hover:opacity-100 opacity-50 disabled:cursor-not-allowed"
            title="Dismiss"
            aria-label={`Dismiss email from ${name}`}
          >
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
          {draftBody && (
            <button
              type="button"
              onClick={() => setOpen(p => !p)}
              data-testid="email-expand-btn"
              className="p-1 rounded transition-opacity hover:opacity-100 opacity-60"
              title={open ? 'Hide draft' : 'Show draft'}
              aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Show'} draft reply to ${name}`}
            >
              <ChevronDown
                className="w-4 h-4 transition-transform duration-200"
                style={{ color: 'rgba(255,255,255,0.5)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Draft section */}
      {open && (
        <div
          className="mt-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Draft reply</p>
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            data-testid="email-draft-textarea"
            rows={Math.min(8, Math.max(3, draftBody.split('\n').length + 1))}
            className="w-full text-sm leading-relaxed bg-transparent resize-y focus:outline-none focus:ring-1 focus:ring-white/20 rounded p-1"
            style={{ color: 'rgba(255,255,255,0.85)' }}
          />
          {sendError && (
            <p className="text-xs mt-2" style={{ color: 'rgba(220,80,80,0.85)' }}>{sendError}</p>
          )}
          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={copyDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={replyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Open in Gmail
            </a>
            <button
              type="button"
              onClick={() => setConfirmSend(true)}
              disabled={!draftBody.trim()}
              data-testid="email-send-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--foreground)',
                color: 'var(--background)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Send className="w-3 h-3" />
              Send
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmSend && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmSend(false); }}
          data-testid="send-confirm-modal"
        >
          <div
            className="max-w-md w-full"
            style={{
              background: 'rgba(20,20,20,0.95)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '12px',
              padding: '20px',
              backdropFilter: 'blur(42px)',
            }}
          >
            <h3 className="text-base mb-3" style={{ color: 'var(--foreground)' }}>Send reply to {name}?</h3>
            <div className="text-xs space-y-1 mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <p>To: <span style={{ color: 'rgba(255,255,255,0.8)' }}>{addr}</span></p>
              <p>Subject: <span style={{ color: 'rgba(255,255,255,0.8)' }}>Re: {email.subject || '(no subject)'}</span></p>
            </div>
            <div
              className="text-sm whitespace-pre-wrap mb-4 max-h-64 overflow-y-auto p-3 rounded"
              style={{ color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.03)' }}
            >
              {draftBody}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmSend(false)}
                className="px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--foreground)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                data-testid="send-confirm-btn"
                className="px-4 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--foreground)',
                  color: 'var(--background)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface EmptyStateProps {
  status: string;
  message: string;
  onRefresh: () => void;
  refreshing: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ status, message, onRefresh, refreshing }) => {
  const isDisconnected = status === 'gmail_not_connected';

  return (
    <div
      data-testid="email-empty-state"
      data-status={status}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px',
        padding: '14px 16px',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{message}</p>
        {isDisconnected ? (
          <a
            href="/connect"
            className="text-xs px-3 py-1.5 rounded-full font-medium flex-shrink-0"
            style={{
              background: 'var(--foreground)',
              color: 'var(--background)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            Connect Gmail
          </a>
        ) : (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="email-refresh-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--foreground)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking…' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
};

export const EmailTriageCard: React.FC = () => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [emptyStatus, setEmptyStatus] = useState<{ status: string; message: string } | null>(null);

  const { data, isLoading, isError } = useQuery<InboxResponse>({
    queryKey: ['inbox-brief'],
    queryFn: async () => {
      const resp = await authFetch('/insights/inbox');
      return resp.json() as Promise<InboxResponse>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const resp = await authFetch('/insights/inbox/refresh', { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok) {
        if (resp.status === 429) {
          setRefreshError('Just refreshed — try again in a minute.');
        } else {
          setRefreshError(json?.error || 'Refresh failed.');
        }
        return;
      }
      // Empty-state response: synthetic brief with status + message
      if (json.brief == null) {
        setEmptyStatus({ status: json.status || 'unknown', message: json.message || 'Nothing to surface.' });
      } else {
        setEmptyStatus(null);
      }
      // Always invalidate so GET /inbox refetches the persisted record (if any)
      await queryClient.invalidateQueries({ queryKey: ['inbox-brief'] });
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const dismissEmail = async (gmailMessageId: string) => {
    const resp = await authFetch(`/insights/inbox/email/${gmailMessageId}/dismiss`, { method: 'POST' });
    if (!resp.ok) throw new Error('Dismiss failed');
    await queryClient.invalidateQueries({ queryKey: ['inbox-brief'] });
  };

  const sendEmail = async (gmailMessageId: string, body: string) => {
    const resp = await authFetch(`/insights/inbox/email/${gmailMessageId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json?.error || 'Send failed');
    await queryClient.invalidateQueries({ queryKey: ['inbox-brief'] });
  };

  const brief = data?.brief ?? null;
  const dismissedSet = useMemo(() => new Set(brief?.metadata?.dismissed ?? []), [brief]);
  const sentSet = useMemo(() => new Set(brief?.metadata?.sent ?? []), [brief]);
  const emails = useMemo(
    () => (brief?.metadata?.emails ?? []).filter(e => !dismissedSet.has(e.id) && !sentSet.has(e.id)),
    [brief, dismissedSet, sentSet]
  );

  // Hide entirely on first load to avoid layout shift — other dashboard
  // widgets handle their own skeletons.
  if (isLoading) return null;

  const briefTimestamp = brief?.created_at;
  const showEmpty = emails.length === 0;

  return (
    <div className="space-y-3" data-testid="email-triage-card">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-1 h-5 rounded-full"
          style={{ background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(255,255,255,0.10))' }}
        />
        <Mail className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Inbox
        </h3>
        {emails.length > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--glass-surface-bg)', color: 'rgba(255,255,255,0.4)' }}
            data-testid="email-count-badge"
          >
            {emails.length}
          </span>
        )}
        {briefTimestamp && (
          <span className="ml-auto text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {formatRelativeTime(briefTimestamp)}
          </span>
        )}
        {(showEmpty || isError) && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            data-testid="email-refresh-icon-btn"
            className="ml-auto p-1 rounded transition-opacity hover:opacity-100 opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
            aria-label="Refresh inbox"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        )}
      </div>

      {/* Empty / error / content states */}
      {refreshError && (
        <div
          className="text-xs px-3 py-2 rounded"
          style={{ background: 'rgba(220,80,80,0.10)', color: 'rgba(220,140,140,0.9)' }}
          data-testid="email-refresh-error"
        >
          {refreshError}
        </div>
      )}

      {isError && !brief && (
        <EmptyState
          status="error"
          message="Couldn't load inbox brief. Check your connection."
          onRefresh={refresh}
          refreshing={refreshing}
        />
      )}

      {showEmpty && !isError && (
        <EmptyState
          status={emptyStatus?.status ?? (brief ? 'all_handled' : 'no_brief')}
          message={
            emptyStatus?.message ||
            (brief
              ? 'You handled everything in this brief. Nice.'
              : 'No inbox brief yet today. Hit refresh to scan now.')
          }
          onRefresh={refresh}
          refreshing={refreshing}
        />
      )}

      {!showEmpty && (
        <div className="space-y-2">
          {emails.map((email) => (
            <EmailRow
              key={email.id || email.from}
              email={email}
              onDismiss={dismissEmail}
              onSend={sendEmail}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default EmailTriageCard;
