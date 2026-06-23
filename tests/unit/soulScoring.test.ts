import { describe, it, expect } from 'vitest';
import { computeSoulScore, computeDomainScore, deriveAxesCount } from '../../src/lib/soulScoring';
import type { PlatformsSummary } from '../../src/hooks/usePlatformsSummary';

function summary(partial: Partial<PlatformsSummary> = {}): PlatformsSummary {
  return { total: 0, active: 0, expired: 0, stale: 0, breakdown: [], ...partial };
}

describe('computeSoulScore', () => {
  it('returns 0 with no summary and no data', () => {
    expect(computeSoulScore({ summary: undefined, memoryCount: 0 })).toBe(0);
  });

  it('reaches 100 with 10+ active platforms, 1000+ memories, all healthy (no axes component)', () => {
    const s = summary({ total: 10, active: 10 });
    // 3 equal components (platforms, memories, multimodal) = 100; the former
    // fabricated 25-pt axes component was dropped (audit-2026-06-10).
    expect(computeSoulScore({ summary: s, memoryCount: 1500 })).toBe(100);
  });

  it('ignores any axesCount passed by legacy call sites', () => {
    const s = summary({ total: 10, active: 10 });
    const withAxes = computeSoulScore({ summary: s, memoryCount: 1500, axesCount: 1 });
    const withoutAxes = computeSoulScore({ summary: s, memoryCount: 1500 });
    expect(withAxes).toBe(withoutAxes);
    // Connecting a platform must no longer fabricate axes points: a user with
    // platforms but zero memories cannot exceed the platform+multimodal share.
    const noMemories = computeSoulScore({ summary: s, memoryCount: 0, axesCount: 1 });
    expect(noMemories).toBe(67); // 100/3 + 100/3 rounded
  });

  it('uses summary.active (not total) as the platform numerator', () => {
    const allActive = summary({ total: 10, active: 10 });
    const halfActive = summary({ total: 10, active: 5, stale: 5 });
    const full = computeSoulScore({ summary: allActive, memoryCount: 0 });
    const half = computeSoulScore({ summary: halfActive, memoryCount: 0 });
    expect(half).toBeLessThan(full);
    // 5/10 * 100/3 (platforms) + min(5,4)/4 * 100/3 (multimodal)
    // = 16.67 + 33.33 = 50
    expect(half).toBe(50);
  });

  it('caps at 95 when any connected platform is stale or expired (M5)', () => {
    const unhealthy = summary({ total: 11, active: 10, expired: 1 });
    expect(computeSoulScore({ summary: unhealthy, memoryCount: 1500 })).toBe(95);
  });

  it('does not apply the 95 cap when every connected platform is active', () => {
    const healthy = summary({ total: 10, active: 10 });
    expect(computeSoulScore({ summary: healthy, memoryCount: 1500 })).toBe(100);
  });

  it('scales the memory component linearly up to 1000', () => {
    const s = summary({ total: 0, active: 0 });
    // 500/1000 * 100/3 = 16.67 -> rounds to 17
    expect(computeSoulScore({ summary: s, memoryCount: 500 })).toBe(17);
  });
});

describe('deriveAxesCount (deprecated no-op)', () => {
  it('always returns 0 so it contributes nothing to the score', () => {
    expect(deriveAxesCount(undefined)).toBe(0);
    expect(deriveAxesCount(summary())).toBe(0);
    expect(deriveAxesCount(summary({ total: 1, expired: 1 }))).toBe(0);
    expect(deriveAxesCount(summary({ total: 10, active: 10 }))).toBe(0);
  });
});

describe('computeDomainScore', () => {
  it('returns 0 when not connected', () => {
    expect(computeDomainScore(false)).toBe(0);
  });

  it('returns a full presence signal when connected, without fabricating per-domain depth', () => {
    // No per-domain memory tiers anymore: every connected domain reports the
    // same binary "contributing" signal (audit-2026-06-10), which is honest
    // because per-domain memory counts are not available on the client.
    expect(computeDomainScore(true)).toBe(100);
  });
});
