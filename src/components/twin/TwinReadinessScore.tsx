import { motion } from 'framer-motion';
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
    score < 30 ? 'text-amber-400' : score < 60 ? 'text-blue-400' : 'text-emerald-400';
  const barColor =
    score < 30 ? 'bg-amber-400' : score < 60 ? 'bg-blue-400' : 'bg-emerald-400';

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <Brain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">Twin Readiness</span>
            <span className={`text-xs font-semibold ${scoreColor}`}>{score}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
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
          <span className="text-sm font-medium">Twin Readiness</span>
        </div>
        <div className="text-right">
          <span className={`text-xl font-bold ${scoreColor}`}>{score}%</span>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
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
