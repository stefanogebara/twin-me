import { describe, it, expect } from 'vitest';
import { computeSoulScore, computeDomainScore, deriveAxesCount } from '../../src/lib/soulScoring';
import type { PlatformsSummary } from '../../src/hooks/usePlatformsSummary';

function summary(partial: Partial<PlatformsSummary> = {}): PlatformsSummary {
  return { total: 0, active: 0, expired: 0, stale: 0, breakdown: [], ...partial };
}

describe('computeSoulScore', () => {
  it('returns 0 with no summary and no data', () => {
    expect(computeSoulScore({ summary: undefined, memoryCount: 0, axesCount: 0 })).toBe(0);
  });

  it('reaches 100 only with 10+ active platforms, 1000+ memories, axes, all healthy', () => {
    const s = summary({ total: 10, active: 10 });
    expect(computeSoulScore({ summary: s, memoryCount: 1500, axesCount: 1 })).toBe(100);
  });

  it('uses summary.active (not total) as the platform numerator', () => {
    const allActive = summary({ total: 10, active: 10 });
    const halfActive = summary({ total: 10, active: 5, stale: 5 });
    const full = computeSoulScore({ summary: allActive, memoryCount: 0, axesCount: 0 });
    const half = computeSoulScore({ summary: halfActive, memoryCount: 0, axesCount: 0 });
    expect(half).toBeLessThan(full);
    // 5/10 * 25 (platforms) + min(5,4)/4 * 25 (multimodal) = 12.5 + 25 = 38 rounded
    expect(half).toBe(38);
  });

  it('caps at 95 when any connected platform is stale or expired (M5)', () => {
    const unhealthy = summary({ total: 11, active: 10, expired: 1 });
    expect(computeSoulScore({ summary: unhealthy, memoryCount: 1500, axesCount: 1 })).toBe(95);
  });

  it('does not apply the 95 cap when every connected platform is active', () => {
    const healthy = summary({ total: 10, active: 10 });
    expect(computeSoulScore({ summary: healthy, memoryCount: 1500, axesCount: 1 })).toBe(100);
  });

  it('scales the memory component linearly up to 1000', () => {
    const s = summary({ total: 0, active: 0 });
    // 500/1000 * 25 = 12.5 -> rounds to 13 (banker's no — Math.round)
    expect(computeSoulScore({ summary: s, memoryCount: 500, axesCount: 0 })).toBe(13);
  });
});

describe('deriveAxesCount', () => {
  it('is 0 with no summary or no connections', () => {
    expect(deriveAxesCount(undefined)).toBe(0);
    expect(deriveAxesCount(summary())).toBe(0);
  });

  it('is 1 once any platform is connected (even unhealthy)', () => {
    expect(deriveAxesCount(summary({ total: 1, expired: 1 }))).toBe(1);
  });
});

describe('computeDomainScore', () => {
  it('returns 0 when not connected regardless of memories', () => {
    expect(computeDomainScore(false, 10_000)).toBe(0);
  });

  it('tiers by memory volume when connected', () => {
    expect(computeDomainScore(true, 10)).toBe(25);
    expect(computeDomainScore(true, 100)).toBe(45);
    expect(computeDomainScore(true, 300)).toBe(65);
    expect(computeDomainScore(true, 800)).toBe(85);
  });
});
