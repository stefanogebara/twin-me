/**
 * WeeklySynthesisCard
 * ===================
 * A single narrative paragraph describing the user's last seven days,
 * read back to them in twin voice. Rendered on DashboardV2 directly
 * below the Morning Briefing, above the proactive insights feed.
 *
 * Data source: GET /twin/weekly-synthesis — { available, narrative, weekStart, generatedAt, reason }.
 * If available === false, this component renders nothing.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';

interface WeeklySynthesisResponse {
  available: boolean;
  narrative?: string;
  weekStart?: string;
  generatedAt?: string;
  reason?: string;
}

async function fetchWeeklySynthesis(): Promise<WeeklySynthesisResponse> {
  try {
    const res = await authFetch('/twin/weekly-synthesis');
    if (!res.ok) return { available: false, reason: 'http_error' };
    return (await res.json()) as WeeklySynthesisResponse;
  } catch {
    return { available: false, reason: 'network_error' };
  }
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const WeeklySynthesisCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['weekly-synthesis'],
    queryFn: fetchWeeklySynthesis,
    staleTime: 6 * 60 * 60 * 1000, // 6h — narrative doesn't change within the week
    retry: 1,
  });

  if (isLoading || !data || !data.available || !data.narrative) {
    return null;
  }

  return (
    <section
      className="rounded-[20px] px-6 py-6 backdrop-blur-[42px]"
      style={{
        background: 'var(--glass-surface-bg)',
        border: '1px solid var(--glass-surface-border)',
        boxShadow:
          '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
      aria-label="Weekly synthesis"
    >
      <h2
        className="italic mb-4"
        style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 'clamp(22px, 2.6vw, 26px)',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          color: 'var(--foreground)',
          fontWeight: 400,
        }}
      >
        Your week, read back to you
      </h2>

      <p
        style={{
          fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
          fontSize: '15.5px',
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.78)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {data.narrative}
      </p>

      {data.generatedAt && (
        <div className="flex justify-end mt-4">
          <span
            className="text-xs"
            style={{
              fontFamily: "'Geist', 'Inter', sans-serif",
              color: 'var(--text-narrative-muted)',
            }}
          >
            Generated {formatTimeAgo(data.generatedAt)}
          </span>
        </div>
      )}
    </section>
  );
};

export default WeeklySynthesisCard;
