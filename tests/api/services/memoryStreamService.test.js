import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock twin-config so RETRIEVAL_WEIGHTS is deterministic in tests.
vi.mock('../../../twin-research/twin-config.js', () => ({
  RETRIEVAL_WEIGHTS: {
    default: { recency: 1.0, importance: 1.0, relevance: 1.0 },
    identity: { recency: 0.2, importance: 0.8, relevance: 1.0 },
    recent: { recency: 1.0, importance: 0.5, relevance: 0.7 },
    reflection: { recency: 0.0, importance: 0.5, relevance: 1.0 },
  },
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

// Mock database (supabaseAdmin chainable — inline factory for hoisting safety)
vi.mock('../../../api/services/database.js', () => {
  const finalResult = { data: null, error: null };
  const chain = {};
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(finalResult),
    single: () => Promise.resolve(finalResult),
    then: (resolve) => Promise.resolve(finalResult).then(resolve),
  });
  return { supabaseAdmin: chain, serverDb: {} };
});

vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
  vectorToString: (v) => `[${v.join(',')}]`,
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '7' }),
  TIER_EXTRACTION: 'extraction',
  TIER_ANALYSIS: 'analysis',
  TIER_CHAT: 'chat',
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

// ---- Tests ----

import { computeAlpha } from '../../../api/services/memoryStreamService.js';

describe('computeAlpha (pure)', () => {
  it('returns a value between 0 and 1 for typical memory', () => {
    const alpha = computeAlpha({
      confidence: 0.7,
      importance_score: 7,
      retrieval_count: 0,
    });
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  });

  it('uses sensible defaults when fields missing', () => {
    const alpha = computeAlpha({});
    // confidence=0.7, importance=0.5, citationBoost=0.85 -> 0.7*0.5*0.85 = 0.2975
    expect(alpha).toBeCloseTo(0.2975, 3);
  });

  it('higher importance yields higher alpha', () => {
    const low = computeAlpha({ confidence: 0.7, importance_score: 3, retrieval_count: 0 });
    const high = computeAlpha({ confidence: 0.7, importance_score: 9, retrieval_count: 0 });
    expect(high).toBeGreaterThan(low);
  });

  it('retrieval_count boosts alpha up to cap at 1.0', () => {
    const no_retrievals = computeAlpha({ confidence: 1.0, importance_score: 10, retrieval_count: 0 });
    const many_retrievals = computeAlpha({ confidence: 1.0, importance_score: 10, retrieval_count: 100 });
    // citationBoost capped at 1.0, so both cap out but many_retrievals >= no_retrievals
    expect(many_retrievals).toBeGreaterThanOrEqual(no_retrievals);
    expect(many_retrievals).toBeLessThanOrEqual(1);
  });

  it('zero confidence forces alpha to 0', () => {
    const alpha = computeAlpha({ confidence: 0, importance_score: 10, retrieval_count: 10 });
    expect(alpha).toBe(0);
  });

  it('low-confidence, low-importance memory is filtered (alpha < 0.2 = omit)', () => {
    const alpha = computeAlpha({ confidence: 0.3, importance_score: 2, retrieval_count: 0 });
    // 0.3 * 0.2 * 0.85 = 0.051
    expect(alpha).toBeLessThan(0.2);
  });
});

describe('retrieveMemories (smoke)', () => {
  let retrieveMemories;

  beforeEach(async () => {
    const mod = await import('../../../api/services/memoryStreamService.js');
    retrieveMemories = mod.retrieveMemories;
  });

  it('returns [] when userId missing', async () => {
    const result = await retrieveMemories(null, 'query');
    expect(result).toEqual([]);
  });

  it('returns [] when query missing', async () => {
    const result = await retrieveMemories('user-123', '');
    expect(result).toEqual([]);
  });
});

describe('RETRIEVAL_WEIGHTS preset', () => {
  it('exports named preset values', async () => {
    const mod = await import('../../../api/services/memoryStreamService.js');
    expect(mod.RETRIEVAL_WEIGHTS).toBeDefined();
    expect(mod.RETRIEVAL_WEIGHTS.default).toBeDefined();
    expect(mod.RETRIEVAL_WEIGHTS.identity).toBeDefined();
  });
});
