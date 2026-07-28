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
  /**
   * @deprecated No longer contributes to the score. Previously a 25-pt
   * component, but the only available proxy ("any platform connected => axes
   * exist") fabricated points that were never checked against real
   * /tribe/ica-axes data (audit-2026-06-10). Kept on the type so existing
   * call sites compile unchanged; the value is ignored.
   */
  axesCount?: number;
}

/**
 * @deprecated Returns a constant 0 and is no longer fed into the score. The
 * old "any connected platform implies axes exist" proxy fabricated 25 of 100
 * points (audit-2026-06-10) because ICA axes are only generated after the
 * first extraction and were never actually verified here. Retained as a
 * no-op so shared callers (onboarding SoulRichnessBar, /you SoulScore) keep
 * rendering the SAME number without an import churn.
 */
export function deriveAxesCount(_summary: PlatformsSummary | undefined): number {
  return 0;
}

/**
 * Composite Soul Score (0-100), three equally weighted components:
 * platforms, memories, multimodal breadth.
 *
 * The numerator is summary.active — platforms that are ACTUALLY syncing
 * (token valid, last sync within 7 days). Audit-2026-05-12 M5: a perfect
 * score must not be reachable while platforms are stale or expired, so any
 * unhealthy connected platform caps the score at 95.
 *
 * The former fourth component (personality axes) was dropped in
 * audit-2026-06-10: it awarded a fixed 25 points whenever any platform was
 * connected, never checking real ICA axes data. The 25 points were
 * redistributed across the three measured components so a fully-connected,
 * memory-rich user still reaches 100.
 */
export function computeSoulScore({ summary, memoryCount }: SoulScoreInputs): number {
  const activeCount = summary?.active ?? 0;
  const totalCount = summary?.total ?? 0;
  // Multimodal breadth proxied by distinct active platforms, capped at 4.
  const multimodalCount = Math.min(activeCount, 4);

  // Three equally weighted components summing to 100.
  const COMPONENT_WEIGHT = 100 / 3;
  const rawScore = Math.round(
    (Math.min(activeCount, 10) / 10) * COMPONENT_WEIGHT +
    (memoryCount > 1000 ? COMPONENT_WEIGHT : (memoryCount / 1000) * COMPONENT_WEIGHT) +
    (multimodalCount / 4) * COMPONENT_WEIGHT,
  );

  const hasUnhealthy = totalCount > 0 && activeCount < totalCount;
  return hasUnhealthy ? Math.min(rawScore, 95) : rawScore;
}

/**
 * Per-domain contributor signal for the /you contributor cards.
 *
 * Audit-2026-06-10: this was previously fed one GLOBAL memory count for every
 * domain, so all six "contributor" cards rendered the identical memory-volume
 * tier — a per-domain breakdown that was really one number copied six times.
 * Per-domain memory counts are not available on the client (the memories
 * endpoint only returns a grand total), so the honest signal here is binary:
 * a connected domain is contributing, an unconnected one is not. Returns a
 * full bar for connected domains and 0 for locked ones, with no fabricated
 * per-domain depth.
 */
export function computeDomainScore(connected: boolean): number {
  return connected ? 100 : 0;
}
