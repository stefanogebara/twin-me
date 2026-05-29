/**
 * InboxPage
 *
 * Unified proposal stream that replaces /departments. Renders one
 * chronological list of pending + resolved proposals across all departments,
 * with date-section headers and per-tile Do-it / Skip actions.
 *
 * Phase 2 of the /departments → /inbox collapse.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { inboxAPI } from '@/services/api/inboxAPI';
import type { InboxItem } from '@/services/api/inboxAPI';
import { departmentsAPI } from '@/services/api/departmentsAPI';
import InboxTile from './inbox/InboxTile';
import InboxEmptyState from './inbox/InboxEmptyState';
import InboxFilter from './inbox/InboxFilter';
import type { InboxFilterValue } from './inbox/InboxFilter';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Loader2 } from 'lucide-react';

const QUERY_KEY = ['inbox'] as const;

// Mirrors the resolved-badge label in InboxTile.RESOLVED_DONE_LABEL so the
// toast and the persistent tile read the same after approve.
function labelForToast(toolName: string): string {
  if (toolName.includes('mail') || toolName === 'draft') return 'Draft saved';
  if (toolName.includes('calendar') || toolName.includes('event')) return 'Added to calendar';
  if (toolName.includes('doc')) return 'Doc created';
  return 'Did it';
}

const filterMatch = (status: InboxItem['status'], filter: InboxFilterValue): boolean => {
  if (filter === 'all') return status !== 'snoozed';  // hide snoozed from default view
  if (filter === 'pending') return status === 'pending';
  if (filter === 'done') return status === 'done';
  if (filter === 'snoozed') return status === 'snoozed';
  // "Skipped" bucket holds anything the user didn't act on (or rolled back, or failed).
  if (filter === 'skipped') return status === 'skipped' || status === 'expired' || status === 'undone' || status === 'failed';
  return true;
};

type DateBucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier';

function dateBucket(iso: string): DateBucket {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';

  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return 'This week';
  return 'Earlier';
}

const InboxPage: React.FC = () => {
  useDocumentTitle('Inbox | Twin Me');

  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InboxFilterValue>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => inboxAPI.getStream({ limit: 50 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Push-notification entry: when the SW navigates here with ?source=push,
  // tell the server to fire a heartbeat check (cost-gated by the same
  // cooldown as queue-empty trigger). Then strip the param so a reload
  // doesn't refire and the URL stays clean.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('source') !== 'push') return;
    inboxAPI.refreshTrigger().finally(() => {
      url.searchParams.delete('source');
      const cleaned = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
      window.history.replaceState({}, '', cleaned);
      // Kick a refetch slightly later so the new proposals from the heartbeat
      // (if any) show up immediately instead of waiting for the 60s tick.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: ['inbox', 'pending-count'] });
      }, 8000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = data?.items ?? [];

  // Pending tiles pin to the top regardless of date (per spec §3).
  // Within each group, sort by sortAt DESC.
  const { pending, resolvedByBucket } = useMemo(() => {
    const filtered = items.filter((i) => filterMatch(i.status, filter));
    const pendingArr = filtered.filter((i) => i.status === 'pending');
    const resolvedArr = filtered.filter((i) => i.status !== 'pending');

    const buckets: Record<DateBucket, InboxItem[]> = {
      Today: [],
      Yesterday: [],
      'This week': [],
      Earlier: [],
    };
    resolvedArr.forEach((i) => buckets[dateBucket(i.sortAt)].push(i));
    return { pending: pendingArr, resolvedByBucket: buckets };
  }, [items, filter]);

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  const handleApprove = useCallback(
    async (id: string) => {
      setActionLoadingId(id);
      try {
        const response = await departmentsAPI.approveProposal(id);
        // Match the tile copy: "Noted" for advice (toolName=suggest),
        // "Did it" for tool-executing proposals.
        const item = items.find((i) => i.id === id);
        const t = (item?.toolName || '').toLowerCase();
        const isAdvice = t === 'suggest' || t === 'suggestion';

        // Silent-failure check: tool registry returns {success:true,data:{success:false,error}}
        // when the inner Google API call rejects (API disabled, token expired,
        // missing required field, etc). The backend now writes
        // user_response='failed' for these, but we also surface the error
        // immediately in the toast so the user understands why the action
        // didn't happen.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = response.result as any;
        const innerFailed = r?.data && r.data.success === false;
        if (innerFailed) {
          const err = r.data.error || 'unknown error';
          toast.error("Couldn't run this action", {
            description: err.length > 140 ? `${err.slice(0, 140)}…` : err,
            duration: 10000,
          });
          await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          return;
        }

        // When the underlying tool produced a real artifact, surface a
        // "View …" action in the toast so the user can verify without
        // scrolling back to the now-done tile.
        const link = response.outcomeLink;
        const ref = response.outcomeRef;
        if (!isAdvice && link) {
          // Two complementary toasts: the View one is short-lived for
          // visual confirmation; the Undo one runs for the full 60s window
          // so the user has time to react. The server enforces the same
          // 60s cap so a late tap won't actually roll back an artifact
          // that's now in use.
          toast.success(`${labelForToast(t)} · ${link.label}`, {
            description: 'Tap to open',
            action: {
              label: link.label,
              onClick: () => window.open(link.url, '_blank', 'noopener,noreferrer'),
            },
            duration: 6000,
          });
          if (ref) {
            toast('Want to undo?', {
              description: 'You have 60s to roll this back',
              action: {
                label: 'Undo',
                onClick: async () => {
                  const undo = await departmentsAPI.undoProposal(id);
                  if (undo.success) {
                    toast.success('Undone');
                    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
                  } else {
                    toast.error(undo.error === 'undo_window_expired'
                      ? 'Too late to undo — already 60s+'
                      : `Could not undo: ${undo.error || 'unknown error'}`);
                  }
                },
              },
              duration: 60000,
            });
          }
        } else {
          toast.success(isAdvice ? 'Noted' : 'Did it');
        }

        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch (err) {
        toast.error('Could not run this action. Try again?');
      } finally {
        setActionLoadingId(null);
      }
    },
    [queryClient, items],
  );

  const handleSnooze = useCallback(
    async (id: string, hours: number) => {
      setActionLoadingId(id);
      try {
        const r = await departmentsAPI.snoozeProposal(id, hours);
        if (r.success) {
          const label = hours === 1 ? '1 hour' : hours === 24 ? 'tomorrow' : `${hours} hours`;
          toast.success(`Snoozed for ${label}`);
          // Also refresh the sidebar badge count.
          await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          await queryClient.invalidateQueries({ queryKey: ['inbox', 'pending-count'] });
        } else {
          toast.error(r.error || 'Could not snooze. Try again?');
        }
      } catch (err) {
        toast.error('Could not snooze. Try again?');
      } finally {
        setActionLoadingId(null);
      }
    },
    [queryClient],
  );

  const handleSkip = useCallback(
    async (id: string) => {
      setActionLoadingId(id);
      try {
        await departmentsAPI.rejectProposal(id);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        await queryClient.invalidateQueries({ queryKey: ['inbox', 'pending-count'] });
      } catch (err) {
        toast.error('Could not skip this proposal. Try again?');
      } finally {
        setActionLoadingId(null);
      }
    },
    [queryClient],
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 gap-4">
        <div>
          <h1
            className="text-[36px] leading-none mb-1"
            style={{
              fontFamily: "'Instrument Serif', serif",
              color: 'var(--text-primary)',
              letterSpacing: '-0.72px',
            }}
          >
            Inbox
          </h1>
          <p
            className="text-[14px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {pendingCount > 0
              ? `${pendingCount} thing${pendingCount === 1 ? '' : 's'} your twin wants you to look at`
              : 'You\'re all caught up.'}
          </p>
        </div>
        <InboxFilter value={filter} onChange={setFilter} />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: 'var(--text-muted)' }}
          />
        </div>
      )}

      {/* Error */}
      {!!error && !isLoading && (
        <div
          className="px-5 py-4 rounded-[20px] text-[14px]"
          style={{
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.20)',
            color: 'var(--text-primary)',
          }}
        >
          Couldn't load your inbox. Refresh to try again.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && items.length === 0 && <InboxEmptyState />}

      {/* Content */}
      {!isLoading && !error && items.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Pending block — pinned to top */}
          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              {pending.map((item) => (
                <InboxTile
                  key={item.id}
                  item={item}
                  isLoading={actionLoadingId === item.id}
                  onApprove={handleApprove}
                  onSkip={handleSkip}
                  onSnooze={handleSnooze}
                />
              ))}
            </div>
          )}

          {/* Resolved blocks by date bucket */}
          {(['Today', 'Yesterday', 'This week', 'Earlier'] as const).map((bucket) => {
            const bucketItems = resolvedByBucket[bucket];
            if (bucketItems.length === 0) return null;
            return (
              <div key={bucket} className="flex flex-col gap-2">
                <h2
                  className="text-[11px] uppercase tracking-wider mt-3 mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {bucket}
                </h2>
                {bucketItems.map((item) => (
                  <InboxTile
                    key={item.id}
                    item={item}
                    isLoading={actionLoadingId === item.id}
                    onApprove={handleApprove}
                    onSkip={handleSkip}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InboxPage;
