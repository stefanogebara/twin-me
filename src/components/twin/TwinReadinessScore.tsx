import React from 'react';
import { Brain } from 'lucide-react';

interface TwinReadinessScoreProps {
  score: number;
  label: string;
  breakdown?: { volume: number; diversity: number; reflection: number };
  compact?: boolean;
}

const getScoreColor = (score: number) =>
  score < 30 ? 'rgba(255,255,255,0.50)' : score < 60 ? 'rgba(255,255,255,0.65)' : '#10b981';

const getBarGradient = (score: number) =>
  score < 30
    ? 'linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.35))'
    : score < 60
    ? 'linear-gradient(90deg, rgba(255,255,255,0.35), rgba(255,255,255,0.50))'
    : 'linear-gradient(90deg, rgba(16,185,129,0.6), rgba(16,185,129,0.9))';

export function TwinReadinessScore({
  score,
  label,
  breakdown,
  compact = false,
}: TwinReadinessScoreProps) {
  const scoreColor = getScoreColor(score);
  const barGradient = getBarGradient(score);
  const font = "'Geist', 'Inter', system-ui, sans-serif";

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <Brain className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.30)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: font }}>Twin Understanding</span>
            <span className="text-xs font-medium" style={{ color: scoreColor, fontFamily: font }}>{score}%</span>
          </div>
          <div className="h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${score}%`, background: barGradient }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.30)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: font }}>
            Twin Understanding
          </span>
        </div>
        <div className="text-right">
          <span className="text-xl font-medium" style={{ color: scoreColor, fontFamily: font }}>{score}%</span>
          <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: font }}>{label}</p>
        </div>
      </div>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${score}%`, background: barGradient }}
        />
      </div>
      {breakdown && (
        <div className="grid grid-cols-3 gap-1 pt-1">
          {(
            [
              { key: 'volume', label: 'Volume' },
              { key: 'diversity', label: 'Diversity' },
              { key: 'reflection', label: 'Depth' },
            ] as const
          ).map(({ key, label: subLabel }) => (
            <div key={key} className="text-center">
              <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: font }}>{subLabel}</div>
              <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: font }}>{breakdown[key]}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
