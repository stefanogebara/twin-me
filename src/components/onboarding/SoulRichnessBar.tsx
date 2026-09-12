// src/components/onboarding/SoulRichnessBar.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import { computeSoulScore, deriveAxesCount } from '@/lib/soulScoring';
import { List, Row } from '@/components/register';

const label = (s: number) =>
  s < 20 ? 'Barely scratching the surface' :
  s < 40 ? 'Starting to see you' :
  s < 60 ? 'Getting interesting' :
  s < 80 ? 'Your soul is taking shape' : 'Deeply understood';

/**
 * Onboarding Soul Score, as one row with a thin ink bar under its line.
 * Renders the EXACT same number as the /you SoulScore ring: shared
 * computeSoulScore (src/lib/soulScoring.ts) fed by the canonical platforms
 * summary + the cached ['memories','summary'] query. Batch-3 step 6 — replaces
 * a private per-platform weight table whose /status-derived numerator could
 * show 95 here while /you showed 88.
 */
const SoulRichnessBar: React.FC = () => {
  const { data: summary, isLoading: summaryLoading } = usePlatformsSummary();

  // Same query key + shape as SoulScore and identity/ContextSidebar so the
  // read is deduped against fetches already in flight elsewhere.
  const { data: memorySummary, isLoading: memoryLoading } = useQuery<{ total: number } | null>({
    queryKey: ['memories', 'summary'],
    queryFn: async () => {
      const res = await authFetch('/memories?limit=1');
      if (!res.ok) return null;
      const json = await res.json();
      return { total: json.total ?? 0 } as { total: number };
    },
    staleTime: 15 * 60 * 1000,
  });

  const isLoading = summaryLoading || memoryLoading;
  const score = computeSoulScore({
    summary,
    memoryCount: memorySummary?.total ?? 0,
    axesCount: deriveAxesCount(summary),
  });

  return (
    <List label="Soul score">
      <Row
        title="Soul score"
        line={
          <>
            {isLoading ? 'Checking your connections' : label(score)}
            <span className="rs-bar" aria-hidden="true"><i style={{ width: `${isLoading ? 0 : score}%` }} /></span>
          </>
        }
        action={<span className="rs-figure">{isLoading ? '—' : `${score}%`}</span>}
      />
    </List>
  );
};

export default SoulRichnessBar;
