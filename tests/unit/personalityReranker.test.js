import { describe, it, expect, vi } from 'vitest';

// Audit 2026-06-22: personality_embedding comes back from Postgres as a pgvector
// STRING ("[0.1,...]"). The reranker passed it straight into cosineSimilarity, which
// indexed a string -> NaN for every candidate -> it silently always returned
// candidate 0 at full 3x cost. These pin the parse + similarity selection.

// complete() returns content keyed by temperature so candidates are distinguishable
// without an order-dependent counter. For n=3, baseTemp 0.7 -> temps 0.62/0.70/0.78.
vi.mock('../../api/services/llmGateway.js', () => ({
  complete: ({ temperature }) => Promise.resolve({ content: `t${Math.round(temperature * 100)}` }),
  TIER_CHAT: 'chat',
}));

// Each candidate maps to a distinct unit vector; t70 is identical to the [1,0,0] centroid.
vi.mock('../../api/services/embeddingService.js', () => ({
  generateEmbedding: (c) => {
    const VEC = { t62: [0, 1, 0], t70: [1, 0, 0], t78: [0, 0, 1] };
    return Promise.resolve(VEC[c] || [0, 0, 0]);
  },
}));

vi.mock('../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { rerankByPersonality } = await import('../../api/services/personalityReranker.js');

const baseArgs = { system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, userId: 'u1' };
const profile = { temperature: 0.7 };

describe('rerankByPersonality — centroid string parsing', () => {
  it('parses a pgvector STRING centroid and picks the most-similar candidate (not index 0)', async () => {
    // "[1,0,0]" matches t70 exactly; the lowest-temp candidate (t62, index 0) is
    // orthogonal. The old bug NaN-degenerated to always returning index 0.
    const result = await rerankByPersonality(baseArgs, '[1,0,0]', profile, 3);
    expect(result).toBeTruthy();
    expect(result.content).toBe('t70');
    expect(result._rerankerMeta.chosenSimilarity).toBeCloseTo(1, 5);
  });

  it('also works when the centroid is already a numeric array', async () => {
    const result = await rerankByPersonality(baseArgs, [1, 0, 0], profile, 3);
    expect(result.content).toBe('t70');
  });

  it('returns null (caller falls back to one completion) for an unusable centroid', async () => {
    expect(await rerankByPersonality(baseArgs, null, profile, 3)).toBeNull();
    expect(await rerankByPersonality(baseArgs, '[a,b,c]', profile, 3)).toBeNull();
  });
});
