/**
 * usePlatformsSummary — canonical "how many platforms is the user connected to"
 * hook. Single source of truth so /wiki, /identity, /connect, /dashboard,
 * /talk-to-twin, and the settings sidebar always agree.
 *
 * The audit 2026-05-12 (H1) flagged that the same user saw 9 on /wiki,
 * 10 on /identity + /connect + /dashboard, and 11 on /talk-to-twin +
 * settings sidebar because each surface computed the count locally from a
 * different data source. This hook calls the unified /api/platforms/summary
 * endpoint which derives the counts from the platform_connections table.
 *
 * Batch-3 state unification (audit-2026-06-10): richer breakdown entries
 * (connectedAt, lastSyncAt, source), pure selectors, and
 * invalidatePlatformState() so connect/disconnect flows can bust the cache
 * immediately instead of waiting out staleTime.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authFetch } from '@/services/api/apiBase';

export type PlatformState = 'active' | 'expired' | 'stale';

export interface PlatformBreakdownEntry {
  platform: string;
  state: PlatformState;
  /** ISO timestamp the user connected the platform (null for legacy rows). */
  connectedAt?: string | null;
  /** ISO timestamp of the last sync attempt (null if never synced). */
  lastSyncAt?: string | null;
  /** Which connection pipeline owns this platform. */
  source?: 'oauth' | 'nango';
}

export interface PlatformsSummary {
  total: number;
  active: number;
  expired: number;
  stale: number;
  breakdown: PlatformBreakdownEntry[];
}

const EMPTY_SUMMARY: PlatformsSummary = {
  total: 0,
  active: 0,
  expired: 0,
  stale: 0,
  breakdown: [],
};

async function fetchPlatformsSummary(): Promise<PlatformsSummary> {
  const res = await authFetch('/platforms/summary');
  if (!res.ok) return EMPTY_SUMMARY;
  const json = await res.json();
  if (!json.success) return EMPTY_SUMMARY;
  return {
    total: json.total ?? 0,
    active: json.active ?? 0,
    expired: json.expired ?? 0,
    stale: json.stale ?? 0,
    breakdown: json.breakdown ?? [],
  };
}

export function usePlatformsSummary(options?: { enabled?: boolean }) {
  return useQuery<PlatformsSummary>({
    queryKey: ['platforms', 'summary'],
    queryFn: fetchPlatformsSummary,
    staleTime: 60 * 1000, // 1 minute — platform connect/disconnect invalidates this
    refetchInterval: 60 * 1000, // background freshness for long-lived pages (chat, dashboard)
    enabled: options?.enabled !== false,
  });
}

// ---------------------------------------------------------------------------
// Pure selectors — accept the (possibly undefined) summary so callers can use
// them directly on the useQuery data without guards.
// ---------------------------------------------------------------------------

/** Map of platform id -> breakdown entry for O(1) per-platform lookups. */
export function byPlatform(
  summary: PlatformsSummary | undefined
): Record<string, PlatformBreakdownEntry> {
  if (!summary) return {};
  return summary.breakdown.reduce<Record<string, PlatformBreakdownEntry>>((acc, entry) => {
    acc[entry.platform] = entry;
    return acc;
  }, {});
}

/** True if the platform has a connection row in ANY state (incl. expired/stale). */
export function isConnected(summary: PlatformsSummary | undefined, platform: string): boolean {
  return !!summary?.breakdown.some((entry) => entry.platform === platform);
}

/**
 * True only for genuine auth failures the USER must fix by reconnecting.
 * Stale (no recent sync) is NOT a reconnect signal.
 */
export function needsReconnect(summary: PlatformsSummary | undefined, platform: string): boolean {
  return !!summary?.breakdown.some(
    (entry) => entry.platform === platform && entry.state === 'expired'
  );
}

/** All connected platform ids (any state), for "connected set" consumers. */
export function connectedProviders(summary: PlatformsSummary | undefined): string[] {
  return summary?.breakdown.map((entry) => entry.platform) ?? [];
}

/**
 * Invalidate every platform-state query (['platforms'] prefix). Call after
 * any connect/disconnect mutation so counts update immediately — the audit
 * 2026-06-10 found nothing invalidated ['platforms','summary'] after OAuth
 * returns, leaving counts wrong for up to 60s+.
 */
export function invalidatePlatformState(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['platforms'] });
}

/**
 * Immutably remove one platform from a summary, decrementing total and the
 * per-state count of the removed entry. Returns the input unchanged when the
 * platform has no breakdown entry. Used for the optimistic disconnect below.
 */
export function removePlatformFromSummary(
  summary: PlatformsSummary,
  platform: string
): PlatformsSummary {
  const entry = summary.breakdown.find((e) => e.platform === platform);
  if (!entry) return summary;
  return {
    ...summary,
    total: Math.max(0, summary.total - 1),
    active: entry.state === 'active' ? Math.max(0, summary.active - 1) : summary.active,
    expired: entry.state === 'expired' ? Math.max(0, summary.expired - 1) : summary.expired,
    stale: entry.state === 'stale' ? Math.max(0, summary.stale - 1) : summary.stale,
    breakdown: summary.breakdown.filter((e) => e.platform !== platform),
  };
}

/**
 * Canonical disconnect mutation (batch-3 state unification). Optimistically
 * removes the platform from the ['platforms','summary'] cache so the row
 * disappears instantly (spec: disconnect must keep the instant-removal feel),
 * reverts + toasts on failure, and invalidates the ['platforms'] prefix on
 * settle so every surface reconverges on server truth.
 */
export function useDisconnectPlatform(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, { previous?: PlatformsSummary }>({
    mutationFn: async (provider: string) => {
      if (!userId) throw new Error('Not signed in');
      const res = await authFetch(`/connectors/${provider}/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Disconnect failed (${res.status})`);
    },
    onMutate: async (provider) => {
      await queryClient.cancelQueries({ queryKey: ['platforms', 'summary'] });
      const previous = queryClient.getQueryData<PlatformsSummary>(['platforms', 'summary']);
      if (previous) {
        queryClient.setQueryData(
          ['platforms', 'summary'],
          removePlatformFromSummary(previous, provider)
        );
      }
      return { previous };
    },
    onError: (_err, provider, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['platforms', 'summary'], context.previous);
      }
      toast.error(`Could not disconnect ${provider}. Please try again.`);
    },
    onSettled: () => invalidatePlatformState(queryClient),
  });
}
