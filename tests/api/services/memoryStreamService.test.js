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

/**
 * Platform-data noise clamp (audit-2026-05-16 FOLLOW-UP).
 *
 * Prod audit found that the LLM importance rater (Mistral Small) was
 * scoring github periodic snapshots — "Created branch X", language
 * distribution rows, activity counts — at 7-8 because they look
 * work-related. With 200+ such rows in the test user's memory and
 * literal string-match on "twin-me", these rows dominated concept-query
 * retrieval and buried strategic content (Renan facts at imp=10) at
 * rank 33+ (then 5/5 of top results after Renan importance bump).
 *
 * The clamp runs BEFORE the LLM rater (skipImportance: true) for
 * patterns matching the known noise shapes, capping them at 3-4 so
 * they can't out-relevance genuinely-significant memories. After the
 * clamp + backfill of 259 existing rows, github noise dropped from
 * 5/5 of top results to 1/5 for the audit's regression queries.
 *
 * These tests lock in: (1) the noise patterns are clamped, (2) real
 * content (commits with messages, repo creation) passes through to the
 * LLM rater.
 */
describe('clampNoiseObservation — platform-data noise clamps (audit-2026-05-16)', () => {
  it('clamps "Created branch X in repo" to 3', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Created branch "twin-voice-fixes" in twin-me')).toBe(3);
    expect(clampNoiseObservation('Created branch "feature/oauth" in some/repo')).toBe(3);
  });

  it('clamps GitHub language-distribution snapshots to 3', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Your GitHub language distribution: HTML (52%), JavaScript (30%)')).toBe(3);
  });

  it('clamps "Your GitHub YYYY activity" rolling stats to 4', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Your GitHub 2026 activity: 5021 contributions — 4952 commits, 56 PRs, 0 reviews, 1 issues')).toBe(4);
  });

  it('clamps "Committed code on N days" rolling stats to 4', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Committed code on 4 days in the last 30 days on GitHub')).toBe(4);
  });

  it('clamps "Current GitHub contribution streak" to 4', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Current GitHub contribution streak: 6 consecutive days')).toBe(4);
  });

  it('does NOT clamp real signal — commits with message previews', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Pushed 3 commits to twin-me on main — "fix(insights): stop hallucinated stat-numbers"')).toBeNull();
    expect(clampNoiseObservation('Opened PR in twin-me: "Kill spotify URI parroting"')).toBeNull();
    expect(clampNoiseObservation('Created repository "new-cool-project"')).toBeNull();
  });

  it('does NOT clamp non-github platform_data', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('Listened to Radiohead - Creep for 4:12 minutes')).toBeNull();
    expect(clampNoiseObservation('Recovery score today: 42%')).toBeNull();
    expect(clampNoiseObservation('Most frequent email senders this week: github.com (13)')).toBeNull();
  });

  it('handles empty/null input gracefully', async () => {
    const { clampNoiseObservation } = await import('../../../api/services/memoryStreamService.js');
    expect(clampNoiseObservation('')).toBeNull();
    expect(clampNoiseObservation(null)).toBeNull();
    expect(clampNoiseObservation(undefined)).toBeNull();
  });
});
