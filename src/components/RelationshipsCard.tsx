/**
 * RelationshipsCard
 * Surfaces people waiting on you — Gmail threads where the last message is
 * from someone else and you haven't replied. Renan's parked "never-miss-
 * relationships" idea, V2 with per-person Open in Gmail + Dismiss actions.
 *
 * Reads from GET /api/insights/relationships, mutates via POST .../refresh
 * and POST .../dismiss. Hides client-side based on metadata.dismissed[].
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, ExternalLink, X, RefreshCw } from 'lucide-react';
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

interface RelationshipItem {
  from: string;
  name: string;
  email: string;
  thread_count: number;
  days_unanswered: number;
  last_subject: string;
  last_thread_id: string;
  gmail_url: string;
  score: number;
}

interface RelationshipsBriefMetadata {
  relationships?: RelationshipItem[];
  count?: number;
  dismissed?: string[];
  on_demand?: boolean;
}

interface RelationshipsBrief {
  id: string;
  insight: string;
  created_at: string;
  metadata: RelationshipsBriefMetadata | null;
}

interface RelationshipsResponse {
  success: boolean;
  brief: RelationshipsBrief | null;
  status?: string;
}

interface RelRowProps {
  rel: RelationshipItem;
  onDismiss: (email: string) => Promise<void>;
}

const RelRow: React.FC<RelRowProps> = ({ rel, onDismiss }) => {
  const [dismissing, setDismissing] = useState(false);

  const dismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      await onDismiss(rel.email);
    } finally {
      setDismissing(false);
    }
  };

  const ageColor =
    rel.days_unanswered >= 14 ? 'rgba(220,80,80,0.9)' :
    rel.days_unanswered >= 7 ? 'rgba(220,160,80,0.9)' :
    'rgba(255,255,255,0.55)';

  return (
    <div
      data-testid="relationship-row"
      data-email={rel.email}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px',
        padding: '12px 14px',
        opacity: dismissing ? 0.4 : 1,
        transition: 'opacity 150ms ease-out',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{rel.name}</span>
            {rel.thread_count > 1 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(193,126,44,0.25)', color: 'rgba(255,255,255,0.7)' }}
              >
                {rel.thread_count} msgs
              </span>
            )}
            <span className="text-xs" style={{ color: ageColor }}>
              {rel.days_unanswered}d unanswered
            </span>
          </div>
          {rel.last_subject && (
            <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {rel.last_subject}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <a
            href={rel.gmail_url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="relationship-open-gmail"
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--foreground)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            title="Open in Gmail"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            data-testid="relationship-dismiss-btn"
            className="p-1 rounded transition-opacity hover:opacity-100 opacity-50 disabled:cursor-not-allowed"
            title="Dismiss"
            aria-label={`Dismiss ${rel.name}`}
          >
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
      </div>
    </div>
  );
};

interface EmptyStateProps {
  status: string;
  onRefresh: () => void;
  refreshing: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ status, onRefresh, refreshing }) => {
  const message =
    status === 'gmail_not_connected' ? 'Connect Gmail to see who is waiting on you.' :
    status === 'no_unanswered' ? "You're caught up — no unanswered threads older than 3 days." :
    status === 'all_handled' ? "You've handled everyone in this brief." :
    'No relationship brief yet. Hit refresh to scan your inbox.';

  return (
    <div
      data-testid="relationship-empty-state"
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
        {status === 'gmail_not_connected' ? (
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
            data-testid="relationship-refresh-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--foreground)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Scanning…' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
};

export const RelationshipsCard: React.FC = () => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [emptyStatus, setEmptyStatus] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<RelationshipsResponse>({
    queryKey: ['relationships-brief'],
    queryFn: async () => {
      const resp = await authFetch('/insights/relationships');
      return resp.json() as Promise<RelationshipsResponse>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const brief = data?.brief ?? null;
  const dismissedSet = useMemo(
    () => new Set((brief?.metadata?.dismissed ?? []).map(e => e.toLowerCase())),
    [brief]
  );
  const relationships = useMemo(
    () => (brief?.metadata?.relationships ?? []).filter(r => !dismissedSet.has((r.email || '').toLowerCase())),
    [brief, dismissedSet]
  );

  if (isLoading) return null;

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const resp = await authFetch('/insights/relationships/refresh', { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok) {
        if (resp.status === 429) setRefreshError('Just refreshed — try again in a minute.');
        else setRefreshError(json?.error || 'Refresh failed.');
        return;
      }
      if (json.brief == null) setEmptyStatus(json.status || 'unknown');
      else setEmptyStatus(null);
      await queryClient.invalidateQueries({ queryKey: ['relationships-brief'] });
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const dismissRelationship = async (email: string) => {
    const resp = await authFetch('/insights/relationships/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) throw new Error('Dismiss failed');
    await queryClient.invalidateQueries({ queryKey: ['relationships-brief'] });
  };

  const briefTimestamp = brief?.created_at;
  const showEmpty = relationships.length === 0;

  return (
    <div className="space-y-3" data-testid="relationships-card">
      <div className="flex items-center gap-2">
        <div
          className="w-1 h-5 rounded-full"
          style={{ background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(255,255,255,0.10))' }}
        />
        <Users className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <h3 className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
          People waiting
        </h3>
        {relationships.length > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--glass-surface-bg)', color: 'rgba(255,255,255,0.4)' }}
            data-testid="relationship-count-badge"
          >
            {relationships.length}
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
            data-testid="relationship-refresh-icon-btn"
            className="ml-auto p-1 rounded transition-opacity hover:opacity-100 opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
            aria-label="Refresh relationships"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        )}
      </div>

      {refreshError && (
        <div
          className="text-xs px-3 py-2 rounded"
          style={{ background: 'rgba(220,80,80,0.10)', color: 'rgba(220,140,140,0.9)' }}
          data-testid="relationship-refresh-error"
        >
          {refreshError}
        </div>
      )}

      {isError && !brief && (
        <EmptyState status="error" onRefresh={refresh} refreshing={refreshing} />
      )}

      {showEmpty && !isError && (
        <EmptyState
          status={emptyStatus ?? (brief ? 'all_handled' : 'no_brief')}
          onRefresh={refresh}
          refreshing={refreshing}
        />
      )}

      {!showEmpty && (
        <div className="space-y-2">
          {relationships.map((rel) => (
            <RelRow key={rel.email || rel.from} rel={rel} onDismiss={dismissRelationship} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RelationshipsCard;
