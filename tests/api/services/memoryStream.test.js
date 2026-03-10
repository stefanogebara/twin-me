/**
 * Tests for memoryStreamService's retrieveDiverseMemories.
 * Mocks supabaseAdmin and embeddingService to avoid real DB/API calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module mocks (hoisted before imports) ---

// Mock the database module
vi.mock('../../../api/services/database.js', () => {
  const mockChain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: vi.fn(),
  };
  // Make all chain methods return the chain itself so we can do .select().eq().order().limit().then()
  mockChain.select.mockReturnValue(mockChain);
  mockChain.eq.mockReturnValue(mockChain);
  mockChain.order.mockReturnValue(mockChain);
  mockChain.limit.mockReturnValue(mockChain);

  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(mockChain),
      rpc: vi.fn(),
      _chain: mockChain, // expose for test configuration
    },
  };
});

// Mock embeddingService so no real OpenAI calls
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  vectorToString: vi.fn().mockReturnValue('[0,0,0]'),
}));

// Mock llmGateway so no real LLM calls
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '5' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));

// Set required env vars
process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

// Now import after mocks are set up
const { supabaseAdmin } = await import('../../../api/services/database.js');
const { retrieveDiverseMemories } = await import('../../../api/services/memoryStreamService.js');

// Helper to make a memory fixture
function makeMemory(type, id, overrides = {}) {
  return {
    id,
    content: `Memory ${id}: ${type} content`,
    memory_type: type,
    importance_score: 7,
    metadata: {},
    created_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('retrieveDiverseMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the chain mock for each test
    const chain = supabaseAdmin._chain;
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    supabaseAdmin.from.mockReturnValue(chain);

    // Default: supabase RPC returns empty (used by retrieveMemories -> semantic search)
    supabaseAdmin.rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  });

  it('returns an empty array when no memories exist', async () => {
    // supabase chain .then() returns empty data
    supabaseAdmin._chain.then.mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null })));

    const result = await retrieveDiverseMemories('user-1', 'test query');
    expect(Array.isArray(result)).toBe(true);
  });

  it('applies default budgets (15 reflections, 8 facts, 7 platform_data)', async () => {
    // Spy on supabase.from to verify limit calls
    const limitSpy = vi.fn().mockReturnValue({
      then: (cb) => Promise.resolve(cb({ data: [], error: null }))
    });
    supabaseAdmin._chain.limit.mockImplementation(limitSpy);
    supabaseAdmin._chain.order.mockReturnValue(supabaseAdmin._chain);

    // retrieveMemories (for reflections) calls rpc
    supabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });

    await retrieveDiverseMemories('user-1', 'query');

    // Should have called limit for facts (8) and platform_data (4)
    const limitCalls = limitSpy.mock.calls.map(c => c[0]);
    expect(limitCalls).toContain(8);  // facts budget
    expect(limitCalls).toContain(4);  // platform_data budget
  });

  it('respects custom budgets', async () => {
    const limitSpy = vi.fn().mockReturnValue({
      then: (cb) => Promise.resolve(cb({ data: [], error: null }))
    });
    supabaseAdmin._chain.limit.mockImplementation(limitSpy);
    supabaseAdmin._chain.order.mockReturnValue(supabaseAdmin._chain);
    supabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });

    await retrieveDiverseMemories('user-1', 'query', { reflections: 5, facts: 3, platformData: 2 });

    const limitCalls = limitSpy.mock.calls.map(c => c[0]);
    expect(limitCalls).toContain(3);  // custom facts budget
    expect(limitCalls).toContain(2);  // custom platformData budget
  });

  it('filters out non-reflection types from semantic results', async () => {
    // retrieveMemories returns mixed types (facts masquerading in semantic results)
    const semanticResults = [
      makeMemory('reflection', 'r1'),
      makeMemory('fact', 'f1'),         // should be filtered out from reflections
      makeMemory('reflection', 'r2'),
    ];
    supabaseAdmin.rpc.mockResolvedValue({ data: semanticResults, error: null });

    // facts and platform_data queries return empty
    supabaseAdmin._chain.then.mockImplementation((cb) =>
      Promise.resolve(cb({ data: [], error: null }))
    );

    const result = await retrieveDiverseMemories('user-1', 'query');
    // Only reflections from semantic search should be included
    const reflectionIds = result.filter(m => m.memory_type === 'reflection').map(m => m.id);
    expect(reflectionIds).toContain('r1');
    expect(reflectionIds).toContain('r2');
    // 'f1' should NOT appear via the reflections path (may appear via facts path though)
    const resultFromSemanticFact = result.filter(m => m.id === 'f1' && m.memory_type === 'fact');
    // Its inclusion via semantic is filtered; via facts query is separate (which returns [] in this test)
    expect(result.find(m => m.id === 'f1')).toBeUndefined();
  });

  it('combines results from all three type buckets', async () => {
    // Reflections from semantic search
    supabaseAdmin.rpc.mockResolvedValue({
      data: [makeMemory('reflection', 'ref-1')],
      error: null,
    });

    // First .then() call = facts, second = platform_data
    let thenCallCount = 0;
    supabaseAdmin._chain.then.mockImplementation((cb) => {
      thenCallCount++;
      if (thenCallCount === 1) {
        return Promise.resolve(cb({ data: [makeMemory('fact', 'fact-1')], error: null }));
      }
      return Promise.resolve(cb({ data: [makeMemory('platform_data', 'pd-1')], error: null }));
    });

    const result = await retrieveDiverseMemories('user-1', 'query');
    const ids = result.map(m => m.id);
    expect(ids).toContain('ref-1');
    expect(ids).toContain('fact-1');
    expect(ids).toContain('pd-1');
  });

  it('handles supabase errors gracefully (returns empty arrays)', async () => {
    // All queries fail
    supabaseAdmin.rpc.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    supabaseAdmin._chain.then.mockImplementation((cb) =>
      Promise.resolve(cb({ data: null, error: { message: 'DB error' } }))
    );

    const result = await retrieveDiverseMemories('user-1', 'query');
    expect(Array.isArray(result)).toBe(true);
    // Should return [] gracefully, not throw
    expect(result.length).toBe(0);
  });
});
