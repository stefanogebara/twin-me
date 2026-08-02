/**
 * R5a — per-memory decay rating (GUM-style durability, Simile deep-dive
 * .claude/plans/2026-08-01-simile-research R5a).
 *
 * The search_memory_stream RPC already honors a per-row decay_rate
 * (COALESCE(NULLIF(decay_rate,0), type_default) inside the Ebbinghaus
 * exponent), but the write path always stored the flat type default —
 * "prefers dark roast" and "prepping Tuesday's demo" both got fact=30.
 *
 * This adds: one combined EXTRACTION call rating importance AND
 * durability (1-10) at creation, and computeDecayRate scaling the type
 * default by durability (5 = type default, 10 = 2x, 1 = 0.2x, clamped).
 * Legacy behavior is preserved wherever durability is unknown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Capturing supabase mock: records insert payloads so tests can assert the
// decay_rate actually written. All other chains resolve empty.
const inserted = [];
vi.mock('../../../api/services/database.js', () => {
  const finalResult = { data: null, error: null };
  const makeChain = (insertPayload) => {
    const chain = {};
    Object.assign(chain, {
      from: () => chain,
      select: () => chain,
      insert: (payload) => { inserted.push(payload); return makeChain(payload); },
      update: () => chain,
      eq: () => chain,
      neq: () => chain,
      not: () => chain,
      gte: () => chain,
      lte: () => chain,
      gt: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(finalResult),
      single: () =>
        Promise.resolve(
          insertPayload
            ? { data: { id: 'mem-new', importance_score: insertPayload.importance_score }, error: null }
            : finalResult
        ),
      maybeSingle: () => Promise.resolve(finalResult),
      then: (resolve) => Promise.resolve(finalResult).then(resolve),
    });
    return chain;
  };
  return { supabaseAdmin: makeChain(null), serverDb: {} };
});

vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
  vectorToString: (v) => `[${v.join(',')}]`,
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '{"importance": 7, "durability": 9}' }),
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

const { complete } = await import('../../../api/services/llmGateway.js');
const {
  computeDecayRate,
  parseImportanceAndDurability,
  rateImportanceAndDurability,
  addMemory,
} = await import('../../../api/services/memoryStreamService.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

beforeEach(() => {
  inserted.length = 0;
  complete.mockClear();
  complete.mockResolvedValue({ content: '{"importance": 7, "durability": 9}' });
});

describe('computeDecayRate — durability scales the type default', () => {
  it('durability 5 keeps the type default (fact = 30)', () => {
    expect(computeDecayRate('fact', 5)).toBe(30);
  });

  it('durability 10 doubles stability; durability 1 shrinks it to 0.2x', () => {
    expect(computeDecayRate('fact', 10)).toBe(60);
    expect(computeDecayRate('fact', 1)).toBeCloseTo(6, 5);
    expect(computeDecayRate('conversation', 10)).toBe(28);
  });

  it('null/undefined durability falls back to the flat type default (legacy behavior)', () => {
    expect(computeDecayRate('fact', null)).toBe(30);
    expect(computeDecayRate('reflection', undefined)).toBe(90);
  });

  it('clamps out-of-range durability into [1, 10]', () => {
    expect(computeDecayRate('fact', 0)).toBeCloseTo(6, 5);   // treated as 1
    expect(computeDecayRate('fact', 99)).toBe(60);            // treated as 10
  });

  it('unknown types use the 7-day base', () => {
    expect(computeDecayRate('procedure', 5)).toBe(7);
    expect(computeDecayRate('procedure', null)).toBe(7);
  });
});

describe('parseImportanceAndDurability — robust LLM output parsing', () => {
  it('parses clean JSON', () => {
    expect(parseImportanceAndDurability('{"importance": 8, "durability": 3}')).toEqual({
      importance: 8,
      durability: 3,
    });
  });

  it('parses fenced JSON and clamps values into [1,10]', () => {
    const parsed = parseImportanceAndDurability('```json\n{"importance": 15, "durability": 0}\n```');
    expect(parsed.importance).toBe(10);
    expect(parsed.durability).toBe(1);
  });

  it('falls back to a leading digit as importance (legacy single-digit replies)', () => {
    expect(parseImportanceAndDurability('7')).toEqual({ importance: 7, durability: null });
  });

  it('fails safe to {5, null} on garbage', () => {
    expect(parseImportanceAndDurability('no idea')).toEqual({ importance: 5, durability: null });
    expect(parseImportanceAndDurability('')).toEqual({ importance: 5, durability: null });
  });
});

describe('rateImportanceAndDurability — one call, both scores', () => {
  it('makes exactly one EXTRACTION call and returns both ratings', async () => {
    const result = await rateImportanceAndDurability('They live in Lisbon.', USER);
    expect(result).toEqual({ importance: 7, durability: 9 });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].tier).toBe('extraction');
    // Prompt must anchor both scales
    const prompt = complete.mock.calls[0][0].messages[0].content;
    expect(prompt.toLowerCase()).toContain('durability');
    expect(prompt.toLowerCase()).toContain('importance');
  });

  it('fails safe on LLM error', async () => {
    complete.mockRejectedValue(new Error('down'));
    expect(await rateImportanceAndDurability('x', USER)).toEqual({ importance: 5, durability: null });
  });
});

describe('addMemory — per-memory decay_rate on the write path', () => {
  it('writes the durability-scaled decay_rate for rated memories', async () => {
    await addMemory(USER, 'They grew up in Minas Gerais.', 'fact', {}, { skipDedup: true, skipRevision: true });
    const record = inserted.find(r => r.memory_type === 'fact');
    // durability 9 (mock) on fact (30) => 30 * 9/5 = 54
    expect(record.decay_rate).toBeCloseTo(54, 5);
    expect(record.importance_score).toBe(7);
  });

  it('keeps the flat type default when importance rating is skipped (legacy path)', async () => {
    await addMemory(USER, 'Soul interview fact.', 'fact', {}, {
      skipDedup: true,
      skipRevision: true,
      skipImportance: true,
      importanceScore: 8,
    });
    const record = inserted.find(r => r.memory_type === 'fact');
    expect(record.decay_rate).toBe(30);
    expect(complete).not.toHaveBeenCalled();
  });

  it('honors an explicit options.durability override on the skip path', async () => {
    await addMemory(USER, 'Life story fact.', 'fact', {}, {
      skipDedup: true,
      skipRevision: true,
      skipImportance: true,
      importanceScore: 8,
      durability: 8,
    });
    const record = inserted.find(r => r.memory_type === 'fact');
    // 30 * 8/5 = 48
    expect(record.decay_rate).toBeCloseTo(48, 5);
  });
});
