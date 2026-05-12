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
 */

import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';

export interface PlatformsSummary {
  total: number;
  active: number;
  expired: number;
  stale: number;
  breakdown: Array<{ platform: string; state: 'active' | 'expired' | 'stale' }>;
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
    enabled: options?.enabled !== false,
  });
}
