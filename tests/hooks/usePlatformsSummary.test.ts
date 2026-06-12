/**
 * Tests for the pure optimistic-disconnect helper added in batch-3 state
 * unification (audit-2026-06-10): removePlatformFromSummary must immutably
 * drop the breakdown entry and decrement total + the matching state count.
 */
import { describe, it, expect, vi } from 'vitest';

// The hook module imports the network + toast layers at module scope; mock
// them so the pure helper can be imported in a node environment.
vi.mock('@/services/api/apiBase', () => ({ authFetch: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import {
  removePlatformFromSummary,
  connectedProviders,
  type PlatformsSummary,
} from '@/hooks/usePlatformsSummary';

const summary: PlatformsSummary = {
  total: 3,
  active: 1,
  expired: 1,
  stale: 1,
  breakdown: [
    { platform: 'spotify', state: 'active' },
    { platform: 'whoop', state: 'expired' },
    { platform: 'github', state: 'stale' },
  ],
};

describe('removePlatformFromSummary', () => {
  it('removes an active entry and decrements total + active', () => {
    const next = removePlatformFromSummary(summary, 'spotify');
    expect(next).toEqual({
      total: 2,
      active: 0,
      expired: 1,
      stale: 1,
      breakdown: [
        { platform: 'whoop', state: 'expired' },
        { platform: 'github', state: 'stale' },
      ],
    });
  });

  it('decrements the expired count when removing an expired entry', () => {
    const next = removePlatformFromSummary(summary, 'whoop');
    expect(next.total).toBe(2);
    expect(next.expired).toBe(0);
    expect(next.active).toBe(1);
    expect(next.stale).toBe(1);
  });

  it('decrements the stale count when removing a stale entry', () => {
    const next = removePlatformFromSummary(summary, 'github');
    expect(next.total).toBe(2);
    expect(next.stale).toBe(0);
    expect(next.active).toBe(1);
    expect(next.expired).toBe(1);
  });

  it('returns the input unchanged for an unknown platform', () => {
    expect(removePlatformFromSummary(summary, 'reddit')).toBe(summary);
  });

  it('drops a retired entry without touching counts (it never contributed)', () => {
    const withRetired: PlatformsSummary = {
      total: 1,
      active: 1,
      expired: 0,
      stale: 0,
      breakdown: [
        { platform: 'spotify', state: 'active' },
        { platform: 'linkedin', state: 'active', retired: true },
      ],
    };
    const next = removePlatformFromSummary(withRetired, 'linkedin');
    expect(next.total).toBe(1); // unchanged — retired linkedin was never counted
    expect(next.active).toBe(1);
    expect(next.breakdown).toEqual([{ platform: 'spotify', state: 'active' }]);
  });

  it('does not mutate the input summary', () => {
    removePlatformFromSummary(summary, 'spotify');
    expect(summary.total).toBe(3);
    expect(summary.breakdown).toHaveLength(3);
  });

  it('never produces negative counts on inconsistent input', () => {
    const inconsistent: PlatformsSummary = {
      total: 0,
      active: 0,
      expired: 0,
      stale: 0,
      breakdown: [{ platform: 'spotify', state: 'active' }],
    };
    const next = removePlatformFromSummary(inconsistent, 'spotify');
    expect(next.total).toBe(0);
    expect(next.active).toBe(0);
  });
});

describe('connectedProviders', () => {
  it('returns live platform ids', () => {
    expect(connectedProviders(summary)).toEqual(['spotify', 'whoop', 'github']);
  });

  it('excludes retired platforms (replan-2026-06-10 Track C) so counts stay honest', () => {
    const withRetired: PlatformsSummary = {
      total: 5,
      active: 5,
      expired: 0,
      stale: 0,
      breakdown: [
        { platform: 'spotify', state: 'active' },
        { platform: 'reddit', state: 'active' },
        { platform: 'linkedin', state: 'active' },
        { platform: 'twitch', state: 'active' },
        { platform: 'github', state: 'active' },
      ],
    };
    expect(connectedProviders(withRetired)).toEqual(['spotify', 'github']);
  });

  it('keeps mirror sources (web/desktop are first-class, not retired)', () => {
    const withMirror: PlatformsSummary = {
      total: 2,
      active: 2,
      expired: 0,
      stale: 0,
      breakdown: [
        { platform: 'web', state: 'active' },
        { platform: 'desktop', state: 'active' },
      ],
    };
    expect(connectedProviders(withMirror)).toEqual(['web', 'desktop']);
  });

  it('returns an empty array for an undefined summary', () => {
    expect(connectedProviders(undefined)).toEqual([]);
  });
});
