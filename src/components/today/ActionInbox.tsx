/**
 * ActionInbox — the M1 action inbox on the Today home.
 *
 * Lists the twin's pending voice-reply drafts. For each, the user reads the
 * draft (and the "why" chips that explain the twin's choices) and decides:
 * Send as-is, Edit and send, or Reject with a reason. Edit/reject teach the
 * twin (see voiceReplyLearning). The twin never sends on its own.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Pencil, X, Loader2, Inbox, Mail, MessageSquare } from 'lucide-react';
import { actionsAPI, type TwinAction } from '@/services/api/actionsAPI';
import { isAbortError } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';

const QUERY_KEY = ['twin-actions', 'pending'] as const;

const glass = 'bg-[var(--surface)] border border-[var(--glass-surface-border)] rounded-[20px] backdrop-blur-[42px]';

const ActionInbox: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery<TwinAction[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        return await actionsAPI.listPending(controller.signal);
      } finally {
        clearTimeout(timer);
      }
    },
    staleTime: 60_000,
  });

  // Instrumentation (M1): supply-side signal — the inbox was opened and how many
  // drafts were waiting (a proxy for draft_generated, no server posthog needed).
  const { trackEvent } = useAnalytics();
  const viewedRef = useRef(false);
  useEffect(() => {
    if (data && !viewedRef.current) {
      viewedRef.current = true;
      trackEvent('inbox_viewed', { pending_count: data.length });
    }
  }, [data, trackEvent]);

  if (isLoading) {
    return (
      <section aria-busy="true" className="flex flex-col gap-3">
        <InboxHeading count={null} />
        {[0, 1].map((i) => (
          <div key={i} className={`${glass} px-5 py-5 animate-pulse`} style={{ height: 148 }} />
        ))}
      </section>
    );
  }

  if (isError && !isAbortError(error)) {
    return (
      <section className={`${glass} px-5 py-6 text-center`}>
        <p className="text-[#A8A29E] text-sm">Couldn't load your inbox.</p>
        <button
          onClick={() => refetch()}
          className="mt-3 text-[var(--foreground)] text-sm underline underline-offset-4 hover:opacity-80"
        >
          Try again
        </button>
      </section>
    );
  }

  const actions = data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <InboxHeading count={actions.length} />
      {actions.length === 0 ? (
        <div className={`${glass} px-5 py-8 flex flex-col items-center text-center gap-2`}>
          <Inbox size={22} className="text-[#57534E]" aria-hidden />
          <p className="text-[#A8A29E] text-sm">Inbox zero. Your twin has nothing waiting on you.</p>
        </div>
      ) : (
        actions.map((action) => <ActionCard key={action.id} action={action} />)
      )}
    </section>
  );
};

const InboxHeading: React.FC<{ count: number | null }> = ({ count }) => (
  <div className="flex items-baseline justify-between px-1">
    <h2 className="text-[var(--foreground)] text-[15px] font-medium tracking-tight">Waiting on you</h2>
    {count !== null && count > 0 && (
      <span className="text-[#9C9590] text-xs tabular-nums">{count} draft{count === 1 ? '' : 's'}</span>
    )}
  </div>
);

const channelIcon = (channel: string) =>
  channel === 'whatsapp' ? <MessageSquare size={13} aria-hidden /> : <Mail size={13} aria-hidden />;

type Mode = 'view' | 'editing' | 'rejecting';

const ActionCard: React.FC<{ action: TwinAction }> = ({ action }) => {
  const queryClient = useQueryClient();
  const { trackEvent } = useAnalytics();
  const [mode, setMode] = useState<Mode>('view');
  const [editText, setEditText] = useState(action.draft_text);
  const [reason, setReason] = useState('');

  const onSettled = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const whyCount = action.why_signals?.length ?? 0;

  // The M1 decision events — action_rejected carries the reason ("why they say
  // no"), the single most valuable signal for the roadmap.
  const sendM = useMutation({
    mutationFn: () => actionsAPI.send(action.id),
    onSuccess: () => { trackEvent('action_approved', { channel: action.channel, why_count: whyCount }); onSettled(); },
  });
  const editM = useMutation({
    mutationFn: (text: string) => actionsAPI.edit(action.id, text),
    onSuccess: (_data, text) => { trackEvent('action_edited', { channel: action.channel, why_count: whyCount, chars: text.length }); onSettled(); },
  });
  const rejectM = useMutation({
    mutationFn: (r: string) => actionsAPI.reject(action.id, r),
    onSuccess: (_data, r) => { trackEvent('action_rejected', { channel: action.channel, why_count: whyCount, reason: r.slice(0, 120) }); onSettled(); },
  });

  const busy = sendM.isPending || editM.isPending || rejectM.isPending;
  const failed = sendM.isError || editM.isError || rejectM.isError;

  return (
    <article className={`${glass} px-5 py-4 flex flex-col gap-3`}>
      <header className="flex items-center gap-2 text-[#9C9590] text-xs">
        {channelIcon(action.channel)}
        <span className="tracking-tight">Reply to {action.recipient || 'a contact'}</span>
      </header>

      {mode === 'editing' ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={5}
          autoFocus
          aria-label="Edit the reply"
          className="w-full resize-y rounded-[12px] bg-[var(--surface)] border border-[var(--border-glass)] px-3 py-2.5 text-[var(--foreground)] text-[14.5px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.25)]"
        />
      ) : (
        <p className="text-[var(--foreground)] text-[14.5px] leading-relaxed whitespace-pre-wrap">{action.draft_text}</p>
      )}

      {mode === 'view' && action.why_signals?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {action.why_signals.map((w, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-[46px] bg-[var(--surface)] border border-[var(--glass-surface-border)] px-2.5 py-1 text-[11px] text-[#A8A29E]"
            >
              <span className="text-[#c17e2c] mr-1.5 uppercase tracking-wide text-[9px]">{w.kind}</span>
              {w.note}
            </span>
          ))}
        </div>
      )}

      {mode === 'rejecting' && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          placeholder="What was off? (e.g. too formal)"
          aria-label="Reason for rejecting"
          className="w-full rounded-[6px] bg-[var(--surface)] border border-[var(--border-glass)] px-3 py-2.5 text-[var(--foreground)] text-sm placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.25)]"
        />
      )}

      <div className="flex items-center gap-2 pt-0.5">
        {mode === 'view' && (
          <>
            <PrimaryButton busy={sendM.isPending} onClick={() => sendM.mutate()} disabled={busy}>
              <Send size={14} aria-hidden /> Send
            </PrimaryButton>
            <GhostButton onClick={() => { setEditText(action.draft_text); setMode('editing'); }} disabled={busy}>
              <Pencil size={13} aria-hidden /> Edit
            </GhostButton>
            <GhostButton onClick={() => { setReason(''); setMode('rejecting'); }} disabled={busy}>
              <X size={14} aria-hidden /> Reject
            </GhostButton>
          </>
        )}

        {mode === 'editing' && (
          <>
            <PrimaryButton
              busy={editM.isPending}
              onClick={() => editM.mutate(editText.trim())}
              disabled={busy || !editText.trim() || editText.trim() === action.draft_text.trim()}
            >
              <Send size={14} aria-hidden /> Send edit
            </PrimaryButton>
            <GhostButton onClick={() => setMode('view')} disabled={busy}>Cancel</GhostButton>
          </>
        )}

        {mode === 'rejecting' && (
          <>
            <PrimaryButton busy={rejectM.isPending} onClick={() => rejectM.mutate(reason.trim())} disabled={busy}>
              Confirm reject
            </PrimaryButton>
            <GhostButton onClick={() => setMode('view')} disabled={busy}>Cancel</GhostButton>
          </>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-[#dc6b6b] text-xs">Something went wrong — please try again.</p>
      )}
    </article>
  );
};

const PrimaryButton: React.FC<React.PropsWithChildren<{ onClick: () => void; disabled?: boolean; busy?: boolean }>> = ({
  onClick, disabled, busy, children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 bg-[image:var(--claura-bone)] text-[var(--claura-bone-ink)] rounded-[12px] px-3.5 py-2 text-[13px] font-medium disabled:opacity-50 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.4)] transition-opacity"
  >
    {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : children}
  </button>
);

const GhostButton: React.FC<React.PropsWithChildren<{ onClick: () => void; disabled?: boolean }>> = ({
  onClick, disabled, children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-medium text-[#A8A29E] hover:text-[var(--foreground)] disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.25)] transition-colors"
  >
    {children}
  </button>
);

export default ActionInbox;
