/**
 * reflectionEngine — reflections must not feed on their own output
 * ================================================================
 * product-truth-review 2026-08-09, Phase 0 item 2: generateReflections fed the
 * experts getRecentMemories(userId, 100) with NO type filter. With the memory
 * stream ~90% reflections, the "experts" were predominantly re-synthesizing
 * prior syntheses — MAX_REFLECTION_DEPTH=1 blocks explicit recursion, but the
 * loop happened through the stream itself (and source-evidence importance is
 * cut 40% after each cycle, ratcheting raw data further down each round).
 *
 * The contract pinned here: the reflection input is EVIDENCE ONLY —
 * observations, platform_data, facts, conversations — never prior reflections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getRecentMemories: vi.fn().mockResolvedValue([]),
  retrieveMemories: vi.fn().mockResolvedValue([]),
  addReflection: vi.fn().mockResolvedValue(null),
  getRecentImportanceSum: vi.fn().mockResolvedValue(0),
  decaySourceMemories: vi.fn().mockResolvedValue(undefined),
  getMemoryStats: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/services/identityContextService.js', () => ({
  inferIdentityContext: vi.fn().mockResolvedValue({ promptFragment: null }),
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn(),
}));
vi.mock('../../../api/services/memoryLinksService.js', () => ({
  autoLinkMemory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { getRecentMemories } = await import(
  '../../../api/services/memoryStreamService.js'
);
const { generateReflections } = await import(
  '../../../api/services/reflectionEngine.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  getRecentMemories.mockResolvedValue([]); // <3 memories => engine returns after the gather step
});

describe('generateReflections — evidence-only input', () => {
  it('excludes prior reflections when gathering the expert input window', async () => {
    await generateReflections('user-evidence-only');

    expect(getRecentMemories).toHaveBeenCalled();
    const [, , options] = getRecentMemories.mock.calls[0];
    expect(options?.excludeTypes).toContain('reflection');
  });
});
