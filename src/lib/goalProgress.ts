// Pure progress-percentage math for goal cards.
//
// Mirrors evaluateTarget() semantics in api/services/goalTrackingService.js:
//   - ">=" / ">" / "=" goals: higher is better → pct = current / target
//   - "<=" / "<" goals (caps): lower is better → being under the cap is on-track
//     (100%), overage reads as falling short.
export type GoalOperator = '>=' | '<=' | '>' | '<' | '=';

export function goalProgressPercent(
  current: number,
  target: number,
  operator: GoalOperator = '>=',
): number {
  const isLowerBetter = operator === '<=' || operator === '<';
  if (isLowerBetter) {
    if (target <= 0) return 100;
    // current <= target → 100%; the more current exceeds target, the lower the bar.
    return Math.min(100, Math.round((target / Math.max(current, target)) * 100));
  }
  return Math.min(100, Math.round((current / Math.max(target, 1)) * 100));
}
