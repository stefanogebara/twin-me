/**
 * soulScoring — the ONE Soul Score formula (batch-3 state unification,
 * audit-2026-06-10 spec step 6).
 *
 * Extracted from src/pages/components/identity/SoulScore.tsx so the /you ring
 * and the onboarding SoulRichnessBar render the SAME number. Previously the
 * bar used a private per-platform weight table with a /status-derived
 * numerator while the ring used this 4x25% formula, so the same user could
 * see 95 on /get-started and 88 on /you.
 */

import type { PlatformsSummary } from '@/hooks/usePlatformsSummary';

export interface SoulScoreInputs {
  summary: PlatformsSummary | undefined;
  memoryCount: number;
  axesCount: number;
}

/**
 * Axes proxy shared by every Soul Score surface: ICA runs after the first
 * extraction, so any connected platform implies axes exist.
 */
export function deriveAxesCount(summary: PlatformsSummary | undefined): number {
  return (summary?.total ?? 0) > 0 ? 1 : 0;
}

/**
 * Composite Soul Score (0-100), four equally weighted components:
 * platforms, memories, personality axes, multimodal breadth.
 *
 * The numerator is summary.active — platforms that are ACTUALLY syncing
 * (token valid, last sync within 7 days). Audit-2026-05-12 M5: a perfect
 * score must not be reachable while platforms are stale or expired, so any
 * unhealthy connected platform caps the score at 95.
 */
export function computeSoulScore({ summary, memoryCount, axesCount }: SoulScoreInputs): number {
  const activeCount = summary?.active ?? 0;
  const totalCount = summary?.total ?? 0;
  // Multimodal breadth proxied by distinct active platforms, capped at 4.
  const multimodalCount = Math.min(activeCount, 4);

  const rawScore = Math.round(
    (Math.min(activeCount, 10) / 10) * 25 +
    (memoryCount > 1000 ? 25 : (memoryCount / 1000) * 25) +
    (axesCount > 0 ? 25 : 0) +
    (multimodalCount / 4) * 25,
  );

  const hasUnhealthy = totalCount > 0 && activeCount < totalCount;
  return hasUnhealthy ? Math.min(rawScore, 95) : rawScore;
}

/**
 * Per-domain contributor score for the /you contributor cards.
 * Memory-volume tiers — moved here with computeSoulScore (spec step 6).
 */
export function computeDomainScore(connected: boolean, memoryCount: number): number {
  if (!connected) return 0;
  if (memoryCount > 500) return 85;
  if (memoryCount > 200) return 65;
  if (memoryCount > 50) return 45;
  return 25;
}
