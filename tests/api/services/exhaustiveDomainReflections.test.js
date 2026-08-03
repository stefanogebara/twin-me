/**
 * R8 — exhaustive-within-domain reflection retrieval (Simile deep-dive
 * .claude/plans/2026-08-01-simile-research R8; the 1,000-people paper's
 * finding that query-time expert routing injects ALL of the routed
 * expert's reflections — exhaustive-within-domain — rather than top-k
 * vector sampling).
 *
 * When the neuropil router classifies a chat message into a domain AND
 * the exhaustive_domain_reflections feature flag is on, the reflections
 * leg of retrieveDiverseMemories swaps vector sampling for a direct fetch
 * of that expert's reflections (capped, importance-ordered). Empty domain
 * fetch falls back to the vector leg — fail-open, exact legacy behavior.
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

// Capturing supabase mock: records the filter chain per query so tests can
// assert the metadata->>expert filter; resolves from a FIFO result queue.
const dbState = { queue: [], calls: [] };
vi.mock('../../../api/services/database.js', () => {
  const makeChain = () => {
    const call = { filters: [] };
    dbState.calls.push(call);
    const next = () => (dbState.queue.length > 0 ? dbState.queue.shift() : { data: [], error: null });
    const chain = {};
    for (const op of ['select', 'eq', 'in', 'is', 'not', 'neq', 'gte', 'lte', 'gt', 'order', 'limit']) {
      chain[op] = (...args) => { call.filters.push([op, ...args]); return chain; };
    }
    chain.single = () => Promise.resolve(next());
    chain.maybeSingle = () => Promise.resolve(next());
    chain.then = (resolve, reject) => Promise.resolve(next()).then(resolve, reject);
    return chain;
  };
  return {
    supabaseAdmin: { from: (table) => { const c = makeChain(); c._table = table; return c; }, rpc: () => Promise.resolve({ data: [], error: null }) },
    serverDb: {},
  };
});

vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
  vectorToString: (v) => `[${v.join(',')}]`,
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '{"importance": 5, "durability": 5}' }),
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

const { getFeatureFlags } = await import('../../../api/services/featureFlagsService.js');
const { NEUROPIL_TO_EXPERT, classifyNeuropil } = await import('../../../api/services/neuropilRouter.js');
const { EXPERT_PERSONAS } = await import('../../../api/services/reflectionEngine.js');
const {
  fetchDomainReflections,
  mergeExhaustiveReflections,
} = await import('../../../api/services/memoryStreamService.js');
const { buildContextOptions } = await import('../../../api/services/twinChatPreFlight.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const refl = (id, expert) => ({
  id, content: `reflection ${id}`, memory_type: 'reflection',
  importance_score: 8, metadata: { expert }, created_at: new Date().toISOString(),
});

beforeEach(() => {
  dbState.queue = [];
  dbState.calls.length = 0;
  getFeatureFlags.mockResolvedValue({});
});

describe('NEUROPIL_TO_EXPERT — routing map', () => {
  const PLATFORM_EXPERT_IDS = new Set([
    'music_psychologist', 'health_behaviorist', 'productivity_analyst',
    'media_sociologist', 'social_analyst', 'digital_behaviorist', 'code_architect',
  ]);

  it('maps every neuropil to a non-empty array led by its generic expert persona', () => {
    const genericIds = new Set(EXPERT_PERSONAS.map(e => e.id));
    const neuropils = ['personality', 'lifestyle', 'cultural', 'social', 'motivation'];
    for (const n of neuropils) {
      const experts = NEUROPIL_TO_EXPERT[n];
      expect(Array.isArray(experts), `${n} must map to an array`).toBe(true);
      expect(experts.length).toBeGreaterThan(0);
      expect(genericIds.has(experts[0]), `${n} must lead with its generic expert`).toBe(true);
      for (const id of experts.slice(1)) {
        expect(PLATFORM_EXPERT_IDS.has(id), `${id} is not a known platform expert`).toBe(true);
      }
      expect(new Set(experts).size).toBe(experts.length); // no dupes
    }
    expect(Object.keys(NEUROPIL_TO_EXPERT)).toHaveLength(5);
  });

  it('routes the platform experts by domain affinity', () => {
    expect(NEUROPIL_TO_EXPERT.cultural).toEqual(
      expect.arrayContaining(['music_psychologist', 'media_sociologist']));
    expect(NEUROPIL_TO_EXPERT.lifestyle).toEqual(
      expect.arrayContaining(['health_behaviorist', 'digital_behaviorist']));
    expect(NEUROPIL_TO_EXPERT.social).toEqual(expect.arrayContaining(['social_analyst']));
    expect(NEUROPIL_TO_EXPERT.motivation).toEqual(
      expect.arrayContaining(['code_architect', 'productivity_analyst']));
  });
});

describe('fetchDomainReflections — direct exhaustive fetch', () => {
  it('filters by a SET of expert ids (in-filter), excludes superseded, caps and orders by importance', async () => {
    dbState.queue.push({ data: [refl('r1', 'cultural_identity'), refl('r2', 'music_psychologist')], error: null });
    const rows = await fetchDomainReflections(USER, ['cultural_identity', 'music_psychologist'], 15);
    expect(rows).toHaveLength(2);

    const call = dbState.calls[dbState.calls.length - 1];
    const flat = JSON.stringify(call.filters);
    expect(flat).toContain('metadata->>expert');
    expect(call.filters.some(f => f[0] === 'in')).toBe(true);
    expect(flat).toContain('music_psychologist');
    expect(flat).toContain('superseded_at');
    expect(flat).toContain('importance_score');
    expect(JSON.stringify(call.filters.find(f => f[0] === 'limit'))).toContain('15');
  });

  it('accepts a single expert id string (back-compat)', async () => {
    dbState.queue.push({ data: [refl('r1', 'personality_psychologist')], error: null });
    const rows = await fetchDomainReflections(USER, 'personality_psychologist', 15);
    expect(rows).toHaveLength(1);
    const call = dbState.calls[dbState.calls.length - 1];
    expect(JSON.stringify(call.filters)).toContain('personality_psychologist');
  });

  it('returns [] on query error and on empty expert sets (fail-open)', async () => {
    dbState.queue.push({ data: null, error: { message: 'boom' } });
    expect(await fetchDomainReflections(USER, ['personality_psychologist'])).toEqual([]);
    expect(await fetchDomainReflections(USER, [])).toEqual([]);
    expect(await fetchDomainReflections(USER, null)).toEqual([]);
  });
});

describe('mergeExhaustiveReflections — fallback + dedup (pure)', () => {
  it('uses domain reflections when present, vector results only as backfill, deduped, capped', () => {
    const domain = [refl('d1', 'x'), refl('d2', 'x')];
    const vector = [refl('d1', 'x'), refl('v1', 'x'), refl('v2', 'x')];
    const merged = mergeExhaustiveReflections(domain, vector, 3);
    expect(merged.map(m => m.id)).toEqual(['d1', 'd2', 'v1']);
  });

  it('falls back entirely to vector results when the domain fetch is empty', () => {
    const vector = [refl('v1', 'x')];
    expect(mergeExhaustiveReflections([], vector, 5)).toEqual(vector);
    expect(mergeExhaustiveReflections(null, vector, 5)).toEqual(vector);
  });
});

describe('buildContextOptions — neuropil threads the expert domain', () => {
  it('sets exhaustiveReflectionDomain to the routed neuropil expert set', () => {
    const neuropilResult = classifyNeuropil('who am i really, what are my values and identity');
    expect(neuropilResult.neuropilId).toBe('personality');
    const opts = buildContextOptions({ platforms: ['spotify'], neuropilResult });
    expect(opts.exhaustiveReflectionDomain).toEqual(NEUROPIL_TO_EXPERT.personality);
    expect(opts.exhaustiveReflectionDomain[0]).toBe('personality_psychologist');
  });

  it('leaves it unset when no neuropil routed', () => {
    const opts = buildContextOptions({
      platforms: ['spotify'],
      neuropilResult: { neuropilId: null, weights: null, budgets: null, confidence: 0 },
    });
    expect(opts.exhaustiveReflectionDomain).toBeUndefined();
  });
});
