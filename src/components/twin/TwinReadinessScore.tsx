import React from 'react';
import { Brain } from 'lucide-react';

interface TwinReadinessScoreProps {
  score: number;
  label: string;
  breakdown?: { volume: number; diversity: number; reflection: number };
  compact?: boolean;
}

export function TwinReadinessScore({
  score,
  label,
  breakdown,
  compact = false,
}: TwinReadinessScoreProps) {
  const scoreColor =
    score < 30 ? 'text-white/50 dark:text-white/60' : score < 60 ? 'text-blue-700 dark:text-blue-400' : 'text-emerald-700 dark:text-emerald-400';
  const barColor =
    score < 30 ? 'bg-white/40 dark:bg-white/50' : score < 60 ? 'bg-blue-500 dark:bg-blue-400' : 'bg-emerald-500 dark:bg-emerald-400';

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <Brain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">Twin Understanding</span>
            <span className={`text-xs font-semibold ${scoreColor}`}>{score}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-1000 ease-out`}
              style={{ width: `${score}%` }}
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
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Twin Understanding</span>
        </div>
        <div className="text-right">
          <span className={`text-xl font-bold ${scoreColor}`}>{score}%</span>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-1200 ease-out`}
          style={{ width: `${score}%` }}
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
              <div className="text-xs font-medium text-muted-foreground">{subLabel}</div>
              <div className="text-xs font-semibold">{breakdown[key]}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
