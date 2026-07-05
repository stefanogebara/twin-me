/**
 * Characterization tests for memoryLinksService — CL1/A-MEM synaptic memory.
 *
 * The abstract STDP formulas (decay curve, pair/cap counting) are already
 * pinned in tests/api/unit/synaptic-maturation.test.js, but that file
 * re-implements the math inside the test — it never runs the real module. These
 * tests instead exercise the ACTUAL exported functions through a capturing
 * Supabase mock, so a regression in the real code path (wrong strength written,
 * missing early-return, broken boost normalization) is caught.
 *
 * Covered: strengthenCoCitedLinks (0.3 init, +0.1 increment capped at 1.0, pair
 * cap 15, <2-id early return) and getCoCitationBoosts (proportional
 * normalization to [0, STDP_CORETRIEVAL_BOOST]).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Capturing Supabase mock ─────────────────────────────────────────────────
// A chainable builder that records update/upsert payloads and can be primed to
// return a specific row from maybeSingle() (existing-link lookup) or a specific
// link list from the terminal boost query.
const state = vi.hoisted(() => ({
  existingLink: null, // returned by maybeSingle()
  boostLinks: [], // returned by the getCoCitationBoosts terminal query
  updates: [], // captured .update() payloads
  upserts: [], // captured .upsert() payloads
}));

vi.mock('../../../api/services/database.js', () => {
  function makeBuilder() {
    const builder = {
      _isBoostQuery: false,
      from() { return builder; },
      select() { return builder; },
      update(payload) { state.updates.push(payload); return builder; },
      upsert(payload) { state.upserts.push(payload); return builder; },
      eq() { return builder; },
      in() { builder._isBoostQuery = true; return builder; },
      gt() {
        // Terminal for getCoCitationBoosts: .in().in().gt() -> resolves {data,error}
        return Promise.resolve({ data: state.boostLinks, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: state.existingLink, error: null });
      },
    };
    return builder;
  }
  return { supabaseAdmin: makeBuilder(), serverDb: {} };
});

// Deterministic STDP boost constant (avoids depending on twin-config's real value).
vi.mock('../../../twin-research/twin-config.js', () => ({
  STDP_CORETRIEVAL_BOOST: 0.05,
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {} }),
}));

import {
  strengthenCoCitedLinks,
  getCoCitationBoosts,
} from '../../../api/services/memoryLinksService.js';

beforeEach(() => {
  state.existingLink = null;
  state.boostLinks = [];
  state.updates = [];
  state.upserts = [];
});

describe('strengthenCoCitedLinks — early return', () => {
  it('does nothing with fewer than 2 cited ids', async () => {
    await strengthenCoCitedLinks('user-1', ['only-one']);
    await strengthenCoCitedLinks('user-1', []);
    await strengthenCoCitedLinks('user-1', null);
    expect(state.updates).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });
});

describe('strengthenCoCitedLinks — create vs increment', () => {
  it('creates a new co_citation link at strength 0.3 when none exists', async () => {
    state.existingLink = null;
    await strengthenCoCitedLinks('user-1', ['a', 'b']);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({
      user_id: 'user-1',
      source_memory_id: 'a',
      target_memory_id: 'b',
      link_type: 'co_citation',
      strength: 0.3,
    });
    // last_reinforced_at is stamped on creation.
    expect(state.upserts[0].last_reinforced_at).toBeTruthy();
    expect(state.updates).toHaveLength(0);
  });

  it('increments an existing link by 0.1 (0.5 -> 0.6)', async () => {
    state.existingLink = { id: 'link-1', strength: 0.5 };
    await strengthenCoCitedLinks('user-1', ['a', 'b']);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].strength).toBeCloseTo(0.6, 10);
    expect(state.updates[0].last_reinforced_at).toBeTruthy();
    expect(state.upserts).toHaveLength(0);
  });

  it('caps the incremented strength at 1.0 (0.95 -> 1.0)', async () => {
    state.existingLink = { id: 'link-1', strength: 0.95 };
    await strengthenCoCitedLinks('user-1', ['a', 'b']);
    expect(state.updates[0].strength).toBe(1.0);
  });

  it('generates C(n,2) pairs and caps total DB writes at 15', async () => {
    // 10 ids -> C(10,2)=45 pairs, but the pair generator caps at 15.
    // existingLink is null for all, so every pair becomes an upsert.
    state.existingLink = null;
    const ids = Array.from({ length: 10 }, (_, i) => `mem-${i}`);
    await strengthenCoCitedLinks('user-1', ids);
    expect(state.upserts).toHaveLength(15);
  });

  it('produces exactly one write for the minimal 2-id case', async () => {
    state.existingLink = null;
    await strengthenCoCitedLinks('user-1', ['x', 'y']);
    expect(state.upserts.length + state.updates.length).toBe(1);
  });
});

describe('getCoCitationBoosts — normalization', () => {
  it('returns an empty map for fewer than 2 candidate ids', async () => {
    const boosts = await getCoCitationBoosts('user-1', ['solo']);
    expect(boosts.size).toBe(0);
  });

  it('returns an empty map when no links come back', async () => {
    state.boostLinks = [];
    const boosts = await getCoCitationBoosts('user-1', ['a', 'b', 'c']);
    expect(boosts.size).toBe(0);
  });

  it('normalizes weighted link counts to [0, STDP_CORETRIEVAL_BOOST]', async () => {
    // a<->b strength 0.9, a<->c strength 0.3.
    // Weighted counts: a = 0.9+0.3 = 1.2 (max), b = 0.9, c = 0.3.
    // Normalized to boost 0.05: a=0.05, b=0.9/1.2*0.05, c=0.3/1.2*0.05.
    state.boostLinks = [
      { source_memory_id: 'a', target_memory_id: 'b', strength: 0.9 },
      { source_memory_id: 'a', target_memory_id: 'c', strength: 0.3 },
    ];
    const boosts = await getCoCitationBoosts('user-1', ['a', 'b', 'c']);
    expect(boosts.get('a')).toBeCloseTo(0.05, 10); // the max gets the full boost
    expect(boosts.get('b')).toBeCloseTo((0.9 / 1.2) * 0.05, 10);
    expect(boosts.get('c')).toBeCloseTo((0.3 / 1.2) * 0.05, 10);
  });

  it('accumulates strength for a memory that appears on both sides of links', async () => {
    // 'a' is source once (0.4) and target once (0.6) => weighted count 1.0.
    state.boostLinks = [
      { source_memory_id: 'a', target_memory_id: 'b', strength: 0.4 },
      { source_memory_id: 'c', target_memory_id: 'a', strength: 0.6 },
    ];
    const boosts = await getCoCitationBoosts('user-1', ['a', 'b', 'c']);
    // a has the highest weighted count (1.0) so it receives the full boost.
    expect(boosts.get('a')).toBeCloseTo(0.05, 10);
  });
});
