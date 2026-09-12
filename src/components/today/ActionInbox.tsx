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
import { Section, List, Row, Empty } from '@/components/register';

const QUERY_KEY = ['twin-actions', 'pending'] as const;

/* The register: the inbox is a section, each draft an item under the list's
   ink rule (no glass cards). A draft holds a paragraph and three buttons, so it
   is an item with the row's padding and hairline rather than a one-line Row. */
const item: React.CSSProperties = {
  padding: '20px 12px',
  borderBottom: '1px solid var(--rg-rule)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const inboxLine = (count: number | null) =>
  count !== null && count > 0 ? `${count} draft${count === 1 ? '' : 's'} to send, edit or reject.` : undefined;

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
      <Section title="Waiting on you">
        <List>
          {[0, 1].map((i) => (
            <li key={i} aria-busy="true" style={item}>
              <span className="block rounded-[4px] animate-pulse" style={{ height: 12, width: '30%', background: 'var(--rg-field)' }} />
              <span className="block rounded-[4px] animate-pulse" style={{ height: 12, width: '80%', background: 'var(--rg-field)' }} />
            </li>
          ))}
        </List>
      </Section>
    );
  }

  if (isError && !isAbortError(error)) {
    return (
      <Section title="Waiting on you">
        <List>
          <Row icon={<Inbox aria-hidden />} title="Couldn't load your inbox" line="Try again in a moment." onClick={() => refetch()} />
        </List>
      </Section>
    );
  }

  const actions = data ?? [];

  return (
    <Section title="Waiting on you" line={inboxLine(actions.length)}>
      <List>
        {actions.length === 0 ? (
          // Was #A8A29E (2.52:1); the register's quiet ink is 5.3:1.
          <li><Empty>Inbox zero. Your twin has nothing waiting on you.</Empty></li>
        ) : (
          actions.map((action) => <ActionCard key={action.id} action={action} />)
        )}
      </List>
    </Section>
  );
};

const channelIcon = (channel: string) =>
  channel === 'whatsapp' ? <MessageSquare size={16} aria-hidden /> : <Mail size={16} aria-hidden />;

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
    <li style={item}>
      <header className="flex items-center gap-4">
        <span className="rg-row-icon" aria-hidden="true">{channelIcon(action.channel)}</span>
        <span className="rg-row-title">Reply to {action.recipient || 'a contact'}</span>
      </header>

      {mode === 'editing' ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={5}
          autoFocus
          aria-label="Edit the reply"
          className="n-input w-full resize-y focus-visible:outline-2 focus-visible:outline-[var(--rg-ink)]"
          style={{ height: 'auto' }}
        />
      ) : (
        <p className="whitespace-pre-wrap" style={{ margin: 0, color: 'var(--rg-ink)' }}>{action.draft_text}</p>
      )}

      {mode === 'view' && action.why_signals?.length > 0 && (
        // Why the twin wrote it this way: badges on the field, sentence case.
        <div className="flex flex-wrap gap-1.5">
          {action.why_signals.map((w, i) => (
            <span key={i} className="n-badge" style={{ fontWeight: 350, color: 'var(--rg-ink-2)' }}>
              <span style={{ fontWeight: 500, color: 'var(--rg-ink)' }}>{w.kind}</span>
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
          className="n-input w-full focus-visible:outline-2 focus-visible:outline-[var(--rg-ink)]"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
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
        <p role="alert" style={{ margin: 0, color: 'var(--rg-danger)' }}>That did not go through. Try again.</p>
      )}
    </li>
  );
};

/* A draft's deciding button. The composer's send is the screen's one ink
   primary and several drafts can be waiting, so a draft's buttons are the
   register's secondary (white, a hairline, ink): 32 tall, a 4 corner. */
const PrimaryButton: React.FC<React.PropsWithChildren<{ onClick: () => void; disabled?: boolean; busy?: boolean }>> = ({
  onClick, disabled, busy, children,
}) => (
  <button type="button" onClick={onClick} disabled={disabled} className="n-btn n-btn--ghost" style={{ fontWeight: 500 }}>
    {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : children}
  </button>
);

const GhostButton: React.FC<React.PropsWithChildren<{ onClick: () => void; disabled?: boolean }>> = ({
  onClick, disabled, children,
}) => (
  <button type="button" onClick={onClick} disabled={disabled} className="n-btn n-btn--ghost">
    {children}
  </button>
);

export default ActionInbox;
