import React from 'react';

interface TwinReadinessScoreProps {
  score: number;
  label: string;
  breakdown?: { volume: number; diversity: number; reflection: number };
  compact?: boolean;
}

/* In the register: the score is ink, the bar is a mark on the field. A
   well-known twin fills in the ok state line (#3d7566, 5.1:1 on the page);
   below that the bar is the mark grey (3.4:1). */
const barColor = (score: number) => (score >= 60 ? 'var(--rg-ok)' : 'var(--rg-mark)');

function Bar({ score }: { score: number }) {
  return (
    <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--rg-field)' }} aria-hidden="true">
      <div
        className="h-full transition-all duration-1000 ease-out"
        style={{ width: `${score}%`, borderRadius: 3, background: barColor(score) }}
      />
    </div>
  );
}

export function TwinReadinessScore({
  score,
  label,
  breakdown,
  compact = false,
}: TwinReadinessScoreProps) {
  if (compact) {
    return (
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
          <span style={{ color: 'var(--rg-ink-2)', fontWeight: 350 }}>Twin understanding</span>
          <span style={{ color: 'var(--rg-ink)', fontWeight: 500 }}>{score}%</span>
        </div>
        <Bar score={score} />
      </div>
    );
  }

  return (
    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
        <span style={{ color: 'var(--rg-ink)', fontWeight: 500 }}>Twin understanding</span>
        <span style={{ color: 'var(--rg-ink)', fontWeight: 500 }}>{score}%</span>
      </div>
      <p style={{ margin: '0 0 12px', color: 'var(--rg-ink-2)', fontWeight: 350 }}>
        {label}
        {breakdown ? ` · volume ${breakdown.volume}%, diversity ${breakdown.diversity}%, depth ${breakdown.reflection}%` : null}
      </p>
      <Bar score={score} />
    </div>
  );
}
