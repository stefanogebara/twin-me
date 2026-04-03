import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { Activity } from 'lucide-react';

interface DriftResult {
  drifted: boolean;
  similarity?: number;
  recentCount?: number;
  baselineCount?: number;
  rebuilt?: boolean;
  reason?: string;
}

async function fetchDrift(): Promise<DriftResult> {
  const res = await authFetch('/personality-profile/drift');
  if (!res.ok) throw new Error(`Drift check failed: ${res.status}`);
  const json = await res.json();
  return json;
}

function driftLabel(similarity: number): { text: string; color: string } {
  if (similarity >= 0.95) return { text: 'Very stable', color: 'rgba(255,255,255,0.3)' };
  if (similarity >= 0.90) return { text: 'Stable', color: 'rgba(255,255,255,0.3)' };
  if (similarity >= 0.85) return { text: 'Slight shift', color: '#C9B99A' };
  if (similarity >= 0.75) return { text: 'Notable shift', color: '#D4CBBE' };
  return { text: 'Significant shift', color: '#ef4444' };
}

export function DriftAlert() {
  const { data, isLoading } = useQuery<DriftResult>({
    queryKey: ['personality-drift'],
    queryFn: fetchDrift,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Don't render while loading, on error, or when insufficient data
  if (isLoading || !data || data.reason === 'insufficient_data') return null;

  const similarity = data.similarity ?? 1;
  const { text, color } = driftLabel(similarity);
  const pct = Math.round(similarity * 100);

  // Only show the alert when there's actual drift worth mentioning (< 0.95)
  if (similarity >= 0.95) return null;

  return (
    <div
      className="flex items-center gap-3 px-5 py-4 rounded-[20px] mb-6"
      style={{
        background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        border: '1px solid var(--glass-surface-border, #d9d1cb)',
      }}
    >
      <Activity className="w-4 h-4 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}>
          <span style={{ color, fontWeight: 500 }}>{text}</span>
          {' '}in your personality this week
          <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted, #86807b)' }}>
            ({pct}% similarity to your baseline)
          </span>
        </p>
        {data.drifted && data.rebuilt && (
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted, #86807b)' }}>
            Your twin's personality profile was automatically updated to match.
          </p>
        )}
      </div>
    </div>
  );
}
