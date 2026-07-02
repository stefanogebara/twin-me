import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock. twinChatPipeline issues several DISTINCT queries per call
// (ownership check on twin_conversations, then a fetch on twin_messages /
// user_memories), so a single-result chain can't model it. This mock keys the
// resolved result by the table passed to `.from()` — set `h.state.byTable`
// per-test. Chain methods are exhaustive passthroughs; the terminal ops
// (single/maybeSingle/limit + thenable) resolve to the current table's result.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const state = { byTable: {}, currentTable: null };
  const chain = {};
  const passthrough = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'not', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'contains',
    'order',
  ];
  for (const m of passthrough) chain[m] = () => chain;
  chain.from = (table) => { state.currentTable = table; return chain; };
  const resolve = () => Promise.resolve(
    state.byTable[state.currentTable] ?? { data: null, error: null }
  );
  chain.single = resolve;
  chain.maybeSingle = resolve;
  chain.limit = resolve;
  chain.then = (onF, onR) => resolve().then(onF, onR);
  return { state, chain };
});

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: h.chain,
  serverDb: {},
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Post-response side-effect collaborators — mocked so the fire-and-forget
// dispatch in runPostResponseSideEffects is observable and never rejects.
// Declared via vi.hoisted() so they exist before the hoisted vi.mock factories.
const memoryMocks = vi.hoisted(() => ({
  extractConversationFacts: vi.fn().mockResolvedValue(undefined),
  extractCommunicationStyle: vi.fn().mockResolvedValue(undefined),
  getMemoryStats: vi.fn().mockResolvedValue({ total: 0, byType: { reflection: 0 } }),
}));
vi.mock('../../../api/services/memoryStreamService.js', () => memoryMocks);

const reflectionMocks = vi.hoisted(() => ({
  shouldTriggerReflection: vi.fn().mockResolvedValue(false),
  generateReflections: vi.fn().mockResolvedValue(undefined),
  seedReflections: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/reflectionEngine.js', () => reflectionMocks);

const citationMocks = vi.hoisted(() => ({
  runCitationPipeline: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../api/services/citationExtractionService.js', () => citationMocks);

const linkMocks = vi.hoisted(() => ({ strengthenCoCitedLinks: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../api/services/memoryLinksService.js', () => linkMocks);

const wikiMocks = vi.hoisted(() => ({ fileQueryInsightIfValuable: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../api/services/wikiCompilationService.js', () => wikiMocks);

import {
  fetchConversationHistory,
  fetchCreativityBoost,
  runPostResponseSideEffects,
} from '../../../api/services/twinChatPipeline.js';

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const CONVO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  h.state.byTable = {};
  h.state.currentTable = null;
  vi.clearAllMocks();
});

describe('fetchConversationHistory', () => {
  it('returns [] when conversationId is missing', async () => {
    expect(await fetchConversationHistory(USER, null)).toEqual([]);
    expect(await fetchConversationHistory(USER, undefined)).toEqual([]);
    expect(await fetchConversationHistory(USER, '')).toEqual([]);
  });

  it('returns [] for a malformed conversationId without touching the DB', async () => {
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: { data: [{ role: 'user', content: 'leak', created_at: '2026-01-01' }], error: null },
    };
    expect(await fetchConversationHistory(USER, 'not-a-uuid')).toEqual([]);
  });

  it('returns [] when the conversation is not owned by the user', async () => {
    h.state.byTable = {
      twin_conversations: { data: null, error: { code: 'PGRST116' } },
    };
    expect(await fetchConversationHistory(USER, CONVO)).toEqual([]);
  });

  it('restores chronological order, normalizes role, and truncates long content', async () => {
    const long = 'x'.repeat(900);
    // Returned newest-first (descending) by the query; helper reverses it.
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: {
        data: [
          { role: 'assistant', content: long, created_at: '2026-01-03' },
          { role: 'system', content: 'middle', created_at: '2026-01-02' },
          { role: 'user', content: 'first', created_at: '2026-01-01' },
        ],
        error: null,
      },
    };
    const out = await fetchConversationHistory(USER, CONVO);
    expect(out).toHaveLength(3);
    // chronological (oldest -> newest)
    expect(out[0]).toEqual({ role: 'user', content: 'first' });
    // non-assistant role collapses to 'user'
    expect(out[1].role).toBe('user');
    expect(out[1].content).toBe('middle');
    // assistant preserved; content truncated to 800 + ellipsis
    expect(out[2].role).toBe('assistant');
    expect(out[2].content).toHaveLength(803);
    expect(out[2].content.endsWith('...')).toBe(true);
  });

  it('returns [] when the messages query yields nothing', async () => {
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: { data: null, error: null },
    };
    expect(await fetchConversationHistory(USER, CONVO)).toEqual([]);
  });
});

describe('fetchCreativityBoost', () => {
  it('returns null for missing or malformed conversationId', async () => {
    expect(await fetchCreativityBoost(USER, null)).toBeNull();
    expect(await fetchCreativityBoost(USER, 'nope')).toBeNull();
  });

  it('returns null when the conversation is not owned', async () => {
    h.state.byTable = { twin_conversations: { data: null, error: null } };
    expect(await fetchCreativityBoost(USER, CONVO)).toBeNull();
  });

  it('returns null with fewer than 3 assistant messages', async () => {
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: { data: [{ metadata: { lz_complexity: 0.1 } }], error: null },
    };
    expect(await fetchCreativityBoost(USER, CONVO)).toBeNull();
  });

  it('returns null when fewer than 3 messages carry a numeric lz score', async () => {
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: {
        data: [
          { metadata: { lz_complexity: 0.1 } },
          { metadata: {} },
          { metadata: null },
        ],
        error: null,
      },
    };
    expect(await fetchCreativityBoost(USER, CONVO)).toBeNull();
  });

  it('returns null when average LZ complexity is not low (>= 0.3)', async () => {
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: {
        data: [
          { metadata: { lz_complexity: 0.5 } },
          { metadata: { lz_complexity: 0.6 } },
          { metadata: { lz_complexity: 0.4 } },
        ],
        error: null,
      },
    };
    expect(await fetchCreativityBoost(USER, CONVO)).toBeNull();
  });

  it('returns null when output is formulaic but no novel memories exist', async () => {
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: {
        data: [
          { metadata: { lz_complexity: 0.1 } },
          { metadata: { lz_complexity: 0.1 } },
          { metadata: { lz_complexity: 0.1 } },
        ],
        error: null,
      },
      user_memories: { data: [], error: null },
    };
    expect(await fetchCreativityBoost(USER, CONVO)).toBeNull();
  });

  it('surfaces novel memories when output is formulaic (low avg LZ)', async () => {
    const novel = [{ id: 'm1', content: 'a rarely surfaced memory' }];
    h.state.byTable = {
      twin_conversations: { data: { id: CONVO }, error: null },
      twin_messages: {
        data: [
          { metadata: { lz_complexity: 0.1 } },
          { metadata: { lz_complexity: 0.2 } },
          { metadata: { lz_complexity: 0.15 } },
        ],
        error: null,
      },
      user_memories: { data: novel, error: null },
    };
    const out = await fetchCreativityBoost(USER, CONVO);
    expect(out).not.toBeNull();
    expect(out.novelMemories).toEqual(novel);
    expect(out.avgLz).toBeCloseTo(0.15, 5);
  });
});

describe('runPostResponseSideEffects', () => {
  it('is a no-op in eval mode', () => {
    runPostResponseSideEffects({
      userId: USER, message: 'hi', assistantMessage: 'hello',
      conversationId: CONVO, evalMode: true,
    });
    expect(memoryMocks.extractConversationFacts).not.toHaveBeenCalled();
    expect(memoryMocks.extractCommunicationStyle).not.toHaveBeenCalled();
    expect(reflectionMocks.shouldTriggerReflection).not.toHaveBeenCalled();
  });

  it('dispatches fact + style extraction and the reflection check outside eval mode', () => {
    runPostResponseSideEffects({
      userId: USER, message: 'hi there', assistantMessage: 'hello',
      conversationId: CONVO, memoriesInContext: [], evalMode: false,
    });
    expect(memoryMocks.extractConversationFacts).toHaveBeenCalledWith(USER, 'hi there');
    expect(memoryMocks.extractCommunicationStyle).toHaveBeenCalledWith(USER, 'hi there');
    expect(reflectionMocks.shouldTriggerReflection).toHaveBeenCalledWith(USER);
    // No memories in context -> citation pipeline is skipped.
    expect(citationMocks.runCitationPipeline).not.toHaveBeenCalled();
  });

  it('runs the citation pipeline only when memories were in context', () => {
    const memories = [{ id: 'm1' }, { id: 'm2' }];
    runPostResponseSideEffects({
      userId: USER, message: 'hi', assistantMessage: 'a reply',
      conversationId: CONVO, memoriesInContext: memories, evalMode: false,
    });
    expect(citationMocks.runCitationPipeline).toHaveBeenCalledWith({
      memoriesInContext: memories,
      twinResponse: 'a reply',
      userId: USER,
      conversationId: CONVO,
    });
  });
});
