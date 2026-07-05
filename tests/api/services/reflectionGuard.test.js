/**
 * Characterization tests for shouldSkipExpertRun — the evidence-overlap cost
 * guard in reflectionEngine.js.
 *
 * Each of the 5 expert personas runs an ANALYSIS-tier LLM call per reflection
 * cycle. shouldSkipExpertRun avoids re-running an expert whose evidence hasn't
 * meaningfully changed since its last reflection (strict > 80% overlap → skip),
 * which is real LLM spend avoided. The strict boundary and the "tolerant on
 * missing data — never skip" edges are exactly what would regress silently, yet
 * the guard was exported with no test.
 *
 * Mocks the heavy module graph so importing reflectionEngine is side-effect free.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({ complete: vi.fn(), TIER_ANALYSIS: 'analysis' }));
vi.mock('../../../api/services/redisClient.js', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getRecentMemories: vi.fn(), retrieveMemories: vi.fn(), addReflection: vi.fn(),
  getRecentImportanceSum: vi.fn(), decaySourceMemories: vi.fn(), getMemoryStats: vi.fn(),
}));
vi.mock('../../../api/services/identityContextService.js', () => ({ inferIdentityContext: vi.fn() }));
vi.mock('../../../api/services/database.js', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn(), vectorToString: vi.fn(),
}));
vi.mock('../../../api/services/memoryLinksService.js', () => ({ autoLinkMemory: vi.fn() }));
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { shouldSkipExpertRun } = await import('../../../api/services/reflectionEngine.js');

// ids that overlap `shared` of `total` current ids against the previous run
const current = (n) => Array.from({ length: n }, (_, i) => `c${i}`);

describe('shouldSkipExpertRun — evidence-overlap cost guard', () => {
  it('skips when the previous run already cited ALL of the current evidence', () => {
    const ids = current(5);
    expect(shouldSkipExpertRun(ids, ids)).toBe(true);
  });

  it('does NOT skip when there is no overlap (fresh evidence → re-run)', () => {
    expect(shouldSkipExpertRun(['a', 'b', 'c'], ['x', 'y', 'z'])).toBe(false);
  });

  describe('strict 80% boundary', () => {
    it('does NOT skip at exactly 80% overlap (guard is > 0.80, not >=)', () => {
      // 8 of 10 current ids previously cited = 0.80 exactly.
      const cur = current(10);
      const prev = cur.slice(0, 8);
      expect(shouldSkipExpertRun(prev, cur)).toBe(false);
    });

    it('skips just above the boundary (90% overlap)', () => {
      const cur = current(10);
      const prev = cur.slice(0, 9);
      expect(shouldSkipExpertRun(prev, cur)).toBe(true);
    });
  });

  it('measures coverage of CURRENT ids (extra previous ids do not dilute)', () => {
    // Both current ids were cited before, even though previous had many more.
    expect(shouldSkipExpertRun(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'b'])).toBe(true);
  });

  describe('tolerant on missing data — never skip on absent evidence', () => {
    it('does not skip when previous evidence is null (e.g. older reflection predates id storage)', () => {
      expect(shouldSkipExpertRun(null, current(3))).toBe(false);
    });
    it('does not skip when previous evidence is an empty array', () => {
      expect(shouldSkipExpertRun([], current(3))).toBe(false);
    });
    it('does not skip when current evidence is empty (no division-by-zero)', () => {
      expect(shouldSkipExpertRun(current(3), [])).toBe(false);
    });
    it('does not skip when inputs are undefined and never throws', () => {
      expect(() => shouldSkipExpertRun(undefined, undefined)).not.toThrow();
      expect(shouldSkipExpertRun(undefined, undefined)).toBe(false);
    });
  });
});
