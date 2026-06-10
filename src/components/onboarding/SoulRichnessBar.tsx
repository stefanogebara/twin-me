// src/components/onboarding/SoulRichnessBar.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import { computeSoulScore, deriveAxesCount } from '@/lib/soulScoring';

const label = (s: number) =>
  s < 20 ? 'Barely scratching the surface' :
  s < 40 ? 'Starting to see you' :
  s < 60 ? 'Getting interesting' :
  s < 80 ? 'Your soul is taking shape' : 'Deeply understood';

/**
 * Onboarding Soul Score bar. Renders the EXACT same number as the /you
 * SoulScore ring: shared computeSoulScore (src/lib/soulScoring.ts) fed by the
 * canonical platforms summary + the cached ['memories','summary'] query.
 * Batch-3 step 6 — replaces a private per-platform weight table whose
 * /status-derived numerator could show 95 here while /you showed 88.
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
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
          Soul Score
        </span>
        <span style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontWeight: 500 }}>
          {isLoading ? '—' : `${score}%`}
        </span>
      </div>
      <div
        className="h-[3px] rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${score}%`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.35), rgba(255,255,255,0.55))',
          }}
        />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
        {isLoading ? 'Checking your connections...' : label(score)}
      </p>
    </div>
  );
};

export default SoulRichnessBar;
