/**
 * memoryStreamService.getRecentMemories — excludeTypes option
 * ===========================================================
 * Companion to reflectionEngineEvidenceOnly.test.js (product-truth-review
 * 2026-08-09, Phase 0 item 2): the reflection engine asks for its input window
 * with { excludeTypes: ['reflection'] }; this pins that the service actually
 * applies the filter at the query level (a DB-side NOT IN, so the caller gets
 * `limit` evidence rows, not `limit` rows that are 90% reflections).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn(),
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_EXTRACTION: 'extraction',
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { supabaseAdmin } = await import('../../../api/services/database.js');
const { getRecentMemories } = await import(
  '../../../api/services/memoryStreamService.js'
);

function mockQueryChain(rows = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  supabaseAdmin.from.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRecentMemories — excludeTypes', () => {
  it('applies a NOT IN filter when excludeTypes is provided', async () => {
    const chain = mockQueryChain();
    await getRecentMemories('user-1', 100, { excludeTypes: ['reflection'] });

    expect(chain.not).toHaveBeenCalledWith('memory_type', 'in', '(reflection)');
  });

  it('applies no type filter by default (existing callers unchanged)', async () => {
    const chain = mockQueryChain();
    await getRecentMemories('user-1', 100);

    expect(chain.not).not.toHaveBeenCalled();
  });

  it('returns the rows from the query', async () => {
    const rows = [{ id: 'm1', memory_type: 'observation' }];
    mockQueryChain(rows);
    const result = await getRecentMemories('user-1', 10, {
      excludeTypes: ['reflection'],
    });

    expect(result).toEqual(rows);
  });
});
