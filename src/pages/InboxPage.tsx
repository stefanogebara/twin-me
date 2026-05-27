/**
 * InboxPage
 *
 * Unified proposal stream that replaces /departments. Renders one
 * chronological list of pending + resolved proposals across all departments,
 * with date-section headers and per-tile Do-it / Skip actions.
 *
 * Phase 2 of the /departments → /inbox collapse.
 */

import React, { useCallback, useMemo, useState } from 'react';
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

const filterMatch = (status: InboxItem['status'], filter: InboxFilterValue): boolean => {
  if (filter === 'all') return true;
  if (filter === 'pending') return status === 'pending';
  if (filter === 'done') return status === 'done';
  if (filter === 'skipped') return status === 'skipped' || status === 'expired';
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
        await departmentsAPI.approveProposal(id);
        toast.success('Did it');
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch (err) {
        toast.error('Could not run this action. Try again?');
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
