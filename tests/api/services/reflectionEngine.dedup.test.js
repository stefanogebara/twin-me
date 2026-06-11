/**
 * reflectionEngine — near-duplicate guard threshold decisions
 * ===========================================================
 * Regression for replan-2026-06-10 Track B: the dedup query filtered on
 * metadata->>expert, so CULTURE and SOCIAL experts shipped the same sentence
 * (cross-expert duplicates were invisible to the check), and hourly re-runs on
 * an unchanged evidence window stored the same thesis twice in one evening
 * (no run-level evidence-overlap skip existed).
 *
 * Thresholds under test:
 * - same-expert cosine  > 0.80 -> duplicate
 * - cross-expert cosine > 0.90 -> duplicate
 * - evidence-ID overlap > 0.80 with the expert's previous run -> skip run
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { supabaseAdmin } = await import('../../../api/services/database.js');
const { generateEmbedding } = await import('../../../api/services/embeddingService.js');
const {
  isDuplicateReflection,
  evidenceOverlapRatio,
  shouldSkipExpertRun,
} = await import('../../../api/services/reflectionEngine.js');

const USER_ID = 'user-1';

/** Wire supabaseAdmin.from to resolve the dedup query with the given rows. */
function mockReflectionRows(rows) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  supabaseAdmin.from.mockReturnValue(chain);
  return chain;
}

// Unit vectors for exact cosine values against newVec = [1, 0]:
// cos([1,0], [a, sqrt(1-a^2)]) === a
const VEC_095 = '[0.95,0.3122499]';   // cosine 0.95
const VEC_085 = '[0.85,0.5267827]';   // cosine 0.85

beforeEach(() => {
  vi.clearAllMocks();
  generateEmbedding.mockResolvedValue([1, 0]);
});

describe('isDuplicateReflection — cross-expert cosine threshold (0.90)', () => {
  it('skips an observation 0.95-similar to ANOTHER expert\'s reflection', async () => {
    mockReflectionRows([
      { content: 'Totally different wording from another domain entirely.', embedding: VEC_095, metadata: { expert: 'social_dynamics' } },
    ]);
    const dupe = await isDuplicateReflection(USER_ID, 'cultural_identity', 'You treat your codebase like a living journal of ideas.');
    expect(dupe).toBe(true);
  });

  it('allows an observation only 0.85-similar to another expert\'s reflection', async () => {
    mockReflectionRows([
      { content: 'Totally different wording from another domain entirely.', embedding: VEC_085, metadata: { expert: 'social_dynamics' } },
    ]);
    const dupe = await isDuplicateReflection(USER_ID, 'cultural_identity', 'You treat your codebase like a living journal of ideas.');
    expect(dupe).toBe(false);
  });
});

describe('isDuplicateReflection — same-expert thresholds unchanged', () => {
  it('skips an observation 0.85-similar to the SAME expert\'s reflection (0.80 threshold)', async () => {
    mockReflectionRows([
      { content: 'Entirely unrelated phrasing about morning espresso rituals downtown.', embedding: VEC_085, metadata: { expert: 'cultural_identity' } },
    ]);
    const dupe = await isDuplicateReflection(USER_ID, 'cultural_identity', 'You treat your codebase like a living journal of ideas.');
    expect(dupe).toBe(true);
  });

  it('catches an identical same-expert sentence via bigram without paying for an embedding', async () => {
    const sentence = 'You reach for ambient playlists whenever your calendar gets dense.';
    mockReflectionRows([
      { content: sentence, embedding: null, metadata: { expert: 'cultural_identity' } },
    ]);
    const dupe = await isDuplicateReflection(USER_ID, 'cultural_identity', sentence);
    expect(dupe).toBe(true);
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it('returns false when the user has no reflections yet', async () => {
    mockReflectionRows([]);
    const dupe = await isDuplicateReflection(USER_ID, 'cultural_identity', 'You treat your codebase like a living journal of ideas.');
    expect(dupe).toBe(false);
  });
});

describe('evidence overlap run skip (>80% vs previous run)', () => {
  const ids = n => Array.from({ length: n }, (_, i) => `m${i}`);

  it('9 of 10 shared evidence IDs -> skip (the June audit case)', () => {
    const current = ids(10);
    const previous = [...ids(9), 'other'];
    expect(evidenceOverlapRatio(previous, current)).toBeCloseTo(0.9);
    expect(shouldSkipExpertRun(previous, current)).toBe(true);
  });

  it('exactly 8 of 10 shared -> NOT skipped (strictly greater than 0.80)', () => {
    const current = ids(10);
    const previous = [...ids(8), 'x', 'y'];
    expect(evidenceOverlapRatio(previous, current)).toBeCloseTo(0.8);
    expect(shouldSkipExpertRun(previous, current)).toBe(false);
  });

  it('tolerant when the previous run stored no evidence IDs', () => {
    expect(shouldSkipExpertRun(null, ids(10))).toBe(false);
    expect(shouldSkipExpertRun(undefined, ids(10))).toBe(false);
    expect(shouldSkipExpertRun([], ids(10))).toBe(false);
  });

  it('tolerant when the current run has no evidence', () => {
    expect(shouldSkipExpertRun(ids(10), [])).toBe(false);
    expect(shouldSkipExpertRun(ids(10), null)).toBe(false);
  });
});
