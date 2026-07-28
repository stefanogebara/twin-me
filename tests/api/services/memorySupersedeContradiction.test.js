/**
 * Supersession: retiring a memory that a newer one has replaced.
 *
 * Nothing in the system could previously retire a fact. A newer observation
 * could flatly contradict an older one and both stayed equally live, equally
 * retrievable, and equally likely to be quoted as current — which is how a
 * months-old inbox count kept being asserted.
 *
 * Retirement is append-only (Zep/Graphiti bi-temporal model): the row survives
 * for "how have I changed" questions, it just stops being current.
 *
 * See .claude/plans/2026-07-27-optmem-brain/README.md (Phase 1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates = [];

vi.mock('../../../twin-research/twin-config.js', () => ({
  RETRIEVAL_WEIGHTS: { default: { recency: 1, importance: 1, relevance: 1 } },
  MMR_LAMBDA: 0.7,
  TYPE_DIVERSITY_WEIGHT: 0.3,
  SEMANTIC_DIVERSITY_WEIGHT: 0.4,
  TEMPORAL_DIVERSITY_WEIGHT: 0.3,
  MEMORY_CONTEXT_BUDGETS: {},
  HYDE_ENABLED: false,
  BM25_BLEND_WEIGHT: 0.3,
  BM25_K1: 1.2,
  BM25_B: 0.75,
  TCM_WEIGHT: 0.0,
  TCM_DRIFT_RATE: 0.1,
  STDP_CORETRIEVAL_BOOST: 0.05,
  MIN_COSINE_SIMILARITY: 0.3,
  LLM_RERANKER_ENABLED: false,
}));

vi.mock('../../../api/services/database.js', () => {
  const chain = {};
  let pending = null;
  Object.assign(chain, {
    from: () => chain,
    select: () => (pending ? Promise.resolve(pending) : chain),
    update: (payload) => {
      pending = { data: [{ id: 'old-1' }], error: null, payload };
      updates.push(payload);
      return chain;
    },
    insert: () => chain,
    eq: () => chain,
    is: (col, val) => {
      // Mirror the real guard: only rows not already superseded are updated.
      chain._guard = `${col}=${val}`;
      return chain;
    },
    limit: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
  });
  return { supabaseAdmin: chain, serverDb: {} };
});

vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
  vectorToString: (v) => `[${v.join(',')}]`,
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '7' }),
  TIER_EXTRACTION: 'extraction', TIER_ANALYSIS: 'analysis', TIER_CHAT: 'chat',
}));
vi.mock('../../../api/services/memoryLinksService.js', () => ({
  traverseLinksForRetrieval: vi.fn().mockResolvedValue([]),
  getCoCitationBoosts: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/bm25Service.js', () => ({
  bm25ScoreBatch: vi.fn().mockReturnValue([]),
  extractKeywords: vi.fn().mockReturnValue([]),
}));

import {
  supersedeMemory,
  shouldSupersedeOnContradiction,
  SUPERSEDE_CONFIDENCE_FLOOR,
} from '../../../api/services/memoryStreamService.js';

beforeEach(() => { updates.length = 0; });

describe('shouldSupersedeOnContradiction', () => {
  it('does not retire a belief on a single contradiction', () => {
    // Reflections enter at 0.70, platform data at 0.90. One -0.15 hit should
    // weaken, not kill.
    expect(shouldSupersedeOnContradiction(0.90, -0.15)).toBe(false);
    expect(shouldSupersedeOnContradiction(0.70, -0.15)).toBe(false);
  });

  it('retires a belief once repeated contradictions collapse confidence', () => {
    expect(shouldSupersedeOnContradiction(0.35, -0.15)).toBe(true);
    expect(shouldSupersedeOnContradiction(0.25, -0.15)).toBe(true);
  });

  it('never retires on confirmation', () => {
    expect(shouldSupersedeOnContradiction(0.20, +0.10)).toBe(false);
    expect(shouldSupersedeOnContradiction(0.10, 0)).toBe(false);
  });

  it('uses the documented floor', () => {
    expect(SUPERSEDE_CONFIDENCE_FLOOR).toBe(0.25);
    // Exactly at the floor counts as collapsed.
    expect(shouldSupersedeOnContradiction(0.40, -0.15)).toBe(true);
  });

  it('treats missing confidence as the default prior', () => {
    expect(shouldSupersedeOnContradiction(undefined, -0.15)).toBe(false);
  });
});

describe('supersedeMemory', () => {
  it('records both the replacement and when it happened', async () => {
    const ok = await supersedeMemory('old-1', 'new-1', 'test');
    expect(ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].superseded_by).toBe('new-1');
    expect(updates[0].superseded_at).toEqual(expect.any(String));
  });

  it('refuses to let a memory supersede itself', async () => {
    // Self-supersession would drop the row from retrieval permanently with
    // nothing replacing it — a silent data loss, so it must be rejected.
    const ok = await supersedeMemory('same-id', 'same-id');
    expect(ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('refuses incomplete supersession', async () => {
    expect(await supersedeMemory(null, 'new-1')).toBe(false);
    expect(await supersedeMemory('old-1', null)).toBe(false);
    expect(updates).toHaveLength(0);
  });
});
