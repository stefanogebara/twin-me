import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import type { DashboardContext } from '@/types/dashboard';

const DEMO_DATA: DashboardContext = {
  greeting: {
    firstName: 'Explorer',
    timeLabel: 'evening',
    insightCount: 3,
    streak: 5,
  },
  heroInsight: {
    body: 'You tend to listen to more introspective music on Sunday evenings — it might be your way of mentally preparing for the week ahead.',
    source: 'Spotify listening patterns',
    insightId: 'demo-insight-1',
    createdAt: new Date().toISOString(),
  },
  twinStats: {
    readiness: { score: 72, label: 'Growing', trend: 0 },
    memoryCount: 4218,
    memoriesThisWeek: 127,
    streak: 5,
  },
  heatmap: Array.from({ length: 90 }, (_, i) => ({
    date: new Date(Date.now() - (89 - i) * 86400000).toISOString().slice(0, 10),
    count: Math.floor(Math.random() * 8),
  })),
  nextEvents: [
    { title: 'Team standup', startTime: new Date(Date.now() + 3600000).toISOString(), endTime: new Date(Date.now() + 5400000).toISOString() },
    { title: 'Lunch with Ana', startTime: new Date(Date.now() + 14400000).toISOString(), endTime: new Date(Date.now() + 18000000).toISOString() },
  ],
  platforms: [
    { name: 'Spotify', provider: 'spotify', lastSync: new Date(Date.now() - 1800000).toISOString(), status: 'active' },
    { name: 'Google Calendar', provider: 'google_calendar', lastSync: new Date(Date.now() - 7200000).toISOString(), status: 'active' },
    { name: 'YouTube', provider: 'youtube', lastSync: new Date(Date.now() - 86400000).toISOString(), status: 'stale' },
  ],
};

/**
 * Map platform status from the API's "connected"/"disconnected" to the
 * more granular status the frontend expects, using lastSync recency.
 */
function derivePlatformStatus(apiStatus: string, lastSync: string | null): 'active' | 'stale' | 'disconnected' {
  if (apiStatus === 'disconnected') return 'disconnected';
  if (!lastSync) return 'stale';
  const hoursSinceSync = (Date.now() - new Date(lastSync).getTime()) / 3_600_000;
  return hoursSinceSync < 48 ? 'active' : 'stale';
}

/**
 * Transform raw API response into the DashboardContext shape expected by V2 components.
 * The API returns slightly different field names/structures than the frontend types.
 */
function transformApiResponse(raw: Record<string, unknown>): DashboardContext {
  const greeting = raw.greeting as Record<string, unknown> | null;
  const stats = raw.twinStats as Record<string, unknown> | null;
  const readiness = stats?.readiness as Record<string, unknown> | null;
  const hero = raw.heroInsight as Record<string, unknown> | null;
  const heatmap = (raw.heatmap as Array<{ date: string; count: number }>) ?? [];
  const rawEvents = (raw.nextEvents as Array<Record<string, unknown>> | null) ?? [];
  const rawPlatforms = (raw.platforms as Array<Record<string, unknown>> | null) ?? [];

  return {
    greeting: {
      firstName: (greeting?.name as string) ?? (greeting?.firstName as string) ?? 'there',
      timeLabel: ((greeting?.timeOfDay as string) ?? (greeting?.timeLabel as string) ?? 'evening') as 'morning' | 'afternoon' | 'evening',
      insightCount: (greeting?.insightCount as number) ?? 0,
      streak: (greeting?.streak as number) ?? (stats?.streak as number) ?? 0,
    },
    heroInsight: hero
      ? {
          body: (hero.body as string) ?? '',
          source: (hero.source as string) ?? '',
          insightId: (hero.insightId as string) ?? (hero.id as string) ?? '',
          createdAt: (hero.createdAt as string) ?? new Date().toISOString(),
        }
      : null,
    twinStats: {
      readiness: {
        score: (readiness?.score as number) ?? 0,
        label: (readiness?.label as string) ?? '',
        trend: (readiness?.trend as number) ?? 0,
      },
      memoryCount: (stats?.totalMemories as number) ?? (stats?.memoryCount as number) ?? 0,
      memoriesThisWeek: (stats?.memoriesThisWeek as number) ?? 0,
      streak: (stats?.streak as number) ?? 0,
    },
    heatmap,
    nextEvents: rawEvents.map((ev) => ({
      title: (ev.title as string) ?? '(No title)',
      startTime: (ev.startTime as string) ?? (ev.start as string) ?? '',
      endTime: (ev.endTime as string) ?? (ev.end as string) ?? '',
    })),
    platforms: rawPlatforms.map((p) => ({
      name: (p.name as string) ?? '',
      provider: (p.provider as string) ?? (p.name as string) ?? '',
      lastSync: (p.lastSync as string) ?? (p.last_sync_at as string) ?? null,
      status: derivePlatformStatus((p.status as string) ?? 'disconnected', (p.lastSync as string) ?? null),
    })),
  };
}

async function fetchDashboardContext(): Promise<DashboardContext> {
  const res = await authFetch('/dashboard/context');
  if (!res.ok) {
    throw new Error(`Dashboard fetch failed: ${res.status}`);
  }
  const raw = await res.json();
  return transformApiResponse(raw);
}

export function useDashboardContext() {
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  return useQuery<DashboardContext>({
    queryKey: ['dashboard-context'],
    queryFn: isDemoMode ? () => Promise.resolve(DEMO_DATA) : fetchDashboardContext,
    staleTime: 2 * 60 * 1000,
  });
}
