interface TwinStatsProps {
  readiness: { score: number; label: string; trend: number };
  memoryCount: number;
  memoriesThisWeek: number;
  streak: number;
  heatmap: Array<{ date: string; count: number }>;
}

const LABEL_STYLE = 'text-[11px] uppercase tracking-[0.15em] font-medium mb-4';

function formatMemoryCount(n: number): string {
  if (n > 9999) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return n.toLocaleString();
}

function heatmapColor(count: number): string {
  if (count === 0) return 'rgba(255,255,255,0.04)';
  if (count <= 2) return 'rgba(255,255,255,0.08)';
  if (count <= 5) return 'rgba(255,255,255,0.2)';
  return 'rgba(255,255,255,0.4)';
}

export function TwinStats({ readiness, memoryCount, memoriesThisWeek, streak, heatmap }: TwinStatsProps) {
  const last90 = heatmap.slice(-90);
  const isNewUser = memoryCount === 0 && readiness.score === 0;

  // L3: Show a warm welcome card for brand-new users instead of empty stats
  if (isNewUser) {
    return (
      <section className="mb-10 pb-10" style={{ borderBottom: '1px solid var(--glass-surface-border)' }}>
        <h2 className={LABEL_STYLE} style={{ color: 'var(--text-muted)' }}>
          YOUR TWIN
        </h2>
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(93,92,174,0.06) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p
            className="text-lg mb-2"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: 'var(--foreground)' }}
          >
            Your twin is waking up
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Connect a platform or chat with your twin to start building memories. The more you share, the more your twin understands what makes you, you.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-10 pb-10" style={{ borderBottom: '1px solid var(--glass-surface-border)' }}>
      <h2 className={LABEL_STYLE} style={{ color: 'var(--text-muted)' }}>
        YOUR TWIN
      </h2>

      <div className="grid grid-cols-3 gap-6">
        {/* Readiness — Rule 11.1: tabular-nums for data */}
        <div>
          <span className="text-[32px] font-semibold tabular-nums" style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
            {readiness.score}
          </span>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>readiness</p>
          {readiness.trend !== 0 && (
            <p className="text-xs mt-0.5" style={{ color: readiness.trend > 0 ? '#10B981' : '#EF4444' }}>
              {readiness.trend > 0 ? '+' : ''}{readiness.trend} {readiness.trend > 0 ? '\u2191' : '\u2193'}
            </p>
          )}
        </div>

        {/* Memories — tabular-nums */}
        <div>
          <span className="text-[32px] font-semibold tabular-nums" style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
            {formatMemoryCount(memoryCount)}
          </span>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>memories</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            +{memoriesThisWeek} this week
          </p>
        </div>

        {/* Streak — tabular-nums */}
        <div>
          <span className="text-[32px] font-semibold tabular-nums" style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
            {streak}
          </span>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>day streak</p>
          {streak > 7 && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>personal best</p>
          )}
        </div>
      </div>

      {/* Heatmap — L2: only show when there's actual data */}
      {last90.some(d => d.count > 0) && (
        <div className="mt-6 overflow-x-auto" role="img" aria-label="Memory activity heatmap for the last 90 days">
          <div className="flex gap-[2px] flex-wrap">
            {last90.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} memories`}
                aria-label={`${day.date}: ${day.count} memories`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: heatmapColor(day.count),
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
