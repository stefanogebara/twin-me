/**
 * The platform_data importance floor must not override a DELIBERATE clamp.
 *
 * addMemory floors platform_data at importance 6, but it applied that floor
 * unconditionally — including on top of an explicit importanceScore supplied
 * with skipImportance. So clampNoiseObservation's 3-4 scores were silently
 * raised straight back to 6, and Tier 2 archival (which collects only rows at
 * <= 4) could never reach them. That made the noise-clamp mechanism inert and
 * every snapshot reading permanent — a load-bearing part of why the twin kept
 * asserting a months-old unread-email count.
 *
 * See .claude/plans/2026-07-27-optmem-brain/README.md, root cause 1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture whatever gets inserted so the stored importance can be asserted.
const inserted = [];

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
  const empty = { data: null, error: null };
  const chain = {};
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    insert: (payload) => {
      inserted.push(payload);
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'mem-1', ...payload }, error: null }),
        }),
      };
    },
    update: () => chain,
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    gt: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(empty),
    single: () => Promise.resolve(empty),
    then: (resolve) => Promise.resolve(empty).then(resolve),
  });
  return { supabaseAdmin: chain, serverDb: {} };
});

vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
  vectorToString: (v) => `[${v.join(',')}]`,
}));

// The LLM rater would return 7 — proving the stored 4 came from the clamp.
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '7' }),
  TIER_EXTRACTION: 'extraction',
  TIER_ANALYSIS: 'analysis',
  TIER_CHAT: 'chat',
}));

vi.mock('../../../api/services/memoryLinksService.js', () => ({
  traverseLinksForRetrieval: vi.fn().mockResolvedValue([]),
  getCoCitationBoosts: vi.fn().mockResolvedValue({}),
  autoLinkMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../api/services/bm25Service.js', () => ({
  bm25ScoreBatch: vi.fn().mockReturnValue([]),
  extractKeywords: vi.fn().mockReturnValue([]),
}));

import { addPlatformObservation, addMemory } from '../../../api/services/memoryStreamService.js';

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const storedImportance = () => inserted.at(-1)?.importance_score;

beforeEach(() => {
  inserted.length = 0;
});

describe('platform_data importance floor vs deliberate clamps', () => {
  it('keeps a snapshot metric below the archival ceiling instead of flooring it to 6', async () => {
    await addPlatformObservation(
      USER,
      'Has a backlog of 40000 unread emails in inbox',
      'gmail',
    );
    // <= 4 is what Tier 2 archival filters on. At 6 the row is unreachable.
    expect(storedImportance()).toBeLessThanOrEqual(4);
  });

  it('keeps the pre-existing GitHub noise clamp below the floor too', async () => {
    await addPlatformObservation(
      USER,
      'Created branch "feat/x" in some-repo',
      'github',
    );
    expect(storedImportance()).toBe(3);
  });

  it('still floors ordinary platform observations that go through the LLM rater', async () => {
    // Nothing deliberate here, so the floor remains the right behaviour.
    await addPlatformObservation(USER, 'Listened to Radiohead late at night', 'spotify');
    expect(storedImportance()).toBeGreaterThanOrEqual(6);
  });

  it('does not disturb a transition observation — it is durable, not a snapshot', async () => {
    await addPlatformObservation(
      USER,
      'Cleared 300 unread emails from the inbox since yesterday',
      'gmail',
    );
    expect(storedImportance()).toBeGreaterThanOrEqual(6);
  });

  it('still floors conversations that go through the rater', async () => {
    await addMemory(USER, 'We talked about the trip', 'conversation');
    expect(storedImportance()).toBeGreaterThanOrEqual(7);
  });
});
