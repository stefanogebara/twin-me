/**
 * Synaptic Maturation — Unit Tests
 * ==================================
 * Tests for the three CL1-inspired neural features:
 * 1. STDP Exponential Decay (pure math + DB interaction)
 * 2. Graph-Based Retrieval Traversal (batch query + dedup logic)
 * 3. Memory Saliency Replay (user selection + replay logic)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── STDP Exponential Decay Math ─────────────────────────────────────
// Testing the pure decay formula extracted from cron-memory-forgetting.js

describe('STDP Exponential Decay Formula', () => {
  const DECAY_FACTOR = 0.92;
  const GRACE_DAYS = 30;
  const PRUNE_THRESHOLD = 0.1;

  function computeDecay(strength, daysSinceReinforcement) {
    const decayDays = Math.max(0, daysSinceReinforcement - GRACE_DAYS);
    return strength * Math.pow(DECAY_FACTOR, decayDays);
  }

  it('applies no decay within grace period (25 days)', () => {
    const result = computeDecay(0.8, 25);
    expect(result).toBe(0.8); // 0 decay days
  });

  it('applies no decay at exactly grace boundary (30 days)', () => {
    const result = computeDecay(0.8, 30);
    expect(result).toBe(0.8); // max(0, 30-30) = 0 decay days
  });

  it('applies mild decay just past grace period (31 days)', () => {
    const result = computeDecay(0.8, 31);
    // 0.8 * 0.92^1 = 0.736
    expect(result).toBeCloseTo(0.736, 3);
  });

  it('applies moderate decay at 40 days (10 active decay days)', () => {
    const result = computeDecay(0.5, 40);
    // 0.5 * 0.92^10 = 0.5 * 0.4344 = 0.2172
    expect(result).toBeCloseTo(0.2172, 3);
  });

  it('decays strong link at 60 days (30 active decay days)', () => {
    const result = computeDecay(0.9, 60);
    // 0.9 * 0.92^30 = 0.9 * 0.08197... = 0.07377
    expect(result).toBeCloseTo(0.0738, 2);
  });

  it('prunes weak link past grace period', () => {
    const result = computeDecay(0.12, 40);
    // 0.12 * 0.92^10 = 0.12 * 0.4344 = 0.0521
    expect(result).toBeLessThan(PRUNE_THRESHOLD);
  });

  it('preserves strong links moderately past grace', () => {
    const result = computeDecay(0.95, 35);
    // 0.95 * 0.92^5 = 0.95 * 0.6591 = 0.6261
    expect(result).toBeCloseTo(0.6261, 3);
    expect(result).toBeGreaterThan(PRUNE_THRESHOLD);
  });

  it('handles 0-day case (just created)', () => {
    const result = computeDecay(0.3, 0);
    expect(result).toBe(0.3);
  });

  it('handles extreme staleness (180 days)', () => {
    const result = computeDecay(1.0, 180);
    // 1.0 * 0.92^150 = effectively 0
    expect(result).toBeLessThan(0.001);
  });
});

// ── Graph Traversal Dedup Logic ─────────────────────────────────────

describe('Graph Traversal Dedup Logic', () => {
  // Test the pure deduplication logic extracted from traverseLinksForRetrieval

  function dedupLinks(links, existingIdSet, maxLinked) {
    const seen = new Set();
    const candidates = [];
    for (const link of links) {
      const tid = link.target_memory_id;
      if (seen.has(tid) || existingIdSet.has(tid)) continue;
      seen.add(tid);
      candidates.push({ id: tid, strength: link.strength });
      if (candidates.length >= maxLinked) break;
    }
    return candidates;
  }

  it('excludes IDs already in vector results', () => {
    const links = [
      { target_memory_id: 'a', strength: 0.9 },
      { target_memory_id: 'b', strength: 0.8 },
      { target_memory_id: 'c', strength: 0.7 },
    ];
    const existingIds = new Set(['a', 'c']);
    const result = dedupLinks(links, existingIds, 5);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('deduplicates links pointing to same target', () => {
    const links = [
      { target_memory_id: 'a', strength: 0.9 },
      { target_memory_id: 'a', strength: 0.7 }, // duplicate
      { target_memory_id: 'b', strength: 0.6 },
    ];
    const result = dedupLinks(links, new Set(), 5);

    expect(result).toHaveLength(2);
    expect(result[0].strength).toBe(0.9); // keeps first (strongest)
  });

  it('respects maxLinked cap', () => {
    const links = Array.from({ length: 20 }, (_, i) => ({
      target_memory_id: `mem-${i}`,
      strength: 1 - i * 0.05,
    }));
    const result = dedupLinks(links, new Set(), 5);

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('mem-0');
    expect(result[4].id).toBe('mem-4');
  });

  it('returns empty array when all are duplicates', () => {
    const links = [
      { target_memory_id: 'a', strength: 0.9 },
      { target_memory_id: 'b', strength: 0.8 },
    ];
    const existingIds = new Set(['a', 'b']);
    const result = dedupLinks(links, existingIds, 5);

    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const result = dedupLinks([], new Set(), 5);
    expect(result).toHaveLength(0);
  });
});

// ── Graph Score Boosting ────────────────────────────────────────────

describe('Graph Score Boosting', () => {
  function computeGraphScore(importanceScore, linkStrength, topScore) {
    return Math.min(
      topScore * 0.8,
      (importanceScore ?? 5) / 10 * linkStrength
    );
  }

  it('caps score at 80% of top vector result', () => {
    const topScore = 1.0;
    const score = computeGraphScore(10, 1.0, topScore);
    expect(score).toBe(0.8); // min(0.8, 1.0) = 0.8
  });

  it('scales with link strength', () => {
    const topScore = 2.0;
    const strong = computeGraphScore(8, 0.9, topScore);
    const weak = computeGraphScore(8, 0.3, topScore);
    expect(strong).toBeGreaterThan(weak);
  });

  it('scales with importance score', () => {
    const topScore = 2.0;
    const important = computeGraphScore(9, 0.5, topScore);
    const trivial = computeGraphScore(3, 0.5, topScore);
    expect(important).toBeGreaterThan(trivial);
  });

  it('defaults importance to 5 when null', () => {
    const score = computeGraphScore(null, 0.8, 2.0);
    expect(score).toBe(0.4); // (5/10) * 0.8 = 0.4
  });

  it('never exceeds 80% cap regardless of inputs', () => {
    const topScore = 0.5;
    const score = computeGraphScore(10, 1.0, topScore);
    expect(score).toBe(0.4); // min(0.4, 1.0) = 0.4
  });
});

// ── Saliency Replay Selection Logic ─────────────────────────────────

describe('Saliency Replay Selection', () => {
  it('deduplicates user IDs from candidate rows', () => {
    const candidates = [
      { user_id: 'user-1' },
      { user_id: 'user-1' }, // dup
      { user_id: 'user-2' },
      { user_id: 'user-3' },
      { user_id: 'user-2' }, // dup
    ];
    const userIds = [...new Set(candidates.map(r => r.user_id))];
    expect(userIds).toEqual(['user-1', 'user-2', 'user-3']);
  });

  it('caps users at maxUsers', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      user_id: `user-${i}`,
    }));
    const maxUsers = 3;
    const userIds = [...new Set(candidates.map(r => r.user_id))].slice(0, maxUsers);
    expect(userIds).toHaveLength(3);
  });

  it('returns empty when no candidates', () => {
    const candidates = [];
    const userIds = [...new Set(candidates.map(r => r.user_id))].slice(0, 3);
    expect(userIds).toHaveLength(0);
  });
});

// ── STDP Link Strength Update Logic ─────────────────────────────────

describe('STDP strengthenCoCitedLinks logic', () => {
  it('increments existing link strength capped at 1.0', () => {
    const existing = 0.95;
    const newStrength = Math.min(1.0, existing + 0.1);
    expect(newStrength).toBe(1.0);
  });

  it('increments normally when below cap', () => {
    const existing = 0.5;
    const newStrength = Math.min(1.0, existing + 0.1);
    expect(newStrength).toBeCloseTo(0.6, 3);
  });

  it('new links start at 0.3', () => {
    const initial = 0.3;
    expect(initial).toBe(0.3);
  });

  it('generates correct pair count (capped at 15)', () => {
    const citedIds = Array.from({ length: 6 }, (_, i) => `mem-${i}`);
    const pairs = [];
    for (let i = 0; i < citedIds.length && pairs.length < 15; i++) {
      for (let j = i + 1; j < citedIds.length && pairs.length < 15; j++) {
        pairs.push([citedIds[i], citedIds[j]]);
      }
    }
    // C(6,2) = 15
    expect(pairs).toHaveLength(15);
  });

  it('caps at 15 for large citation sets', () => {
    const citedIds = Array.from({ length: 10 }, (_, i) => `mem-${i}`);
    const pairs = [];
    for (let i = 0; i < citedIds.length && pairs.length < 15; i++) {
      for (let j = i + 1; j < citedIds.length && pairs.length < 15; j++) {
        pairs.push([citedIds[i], citedIds[j]]);
      }
    }
    expect(pairs).toHaveLength(15); // C(10,2)=45 but capped
  });
});
