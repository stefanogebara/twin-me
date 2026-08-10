/**
 * Query-filing provenance gate (issue #237).
 *
 * fileQueryInsightIfValuable extracts an insight from the TWIN'S OWN response
 * and files it as a `fact`. Its only quality check was avgImportance >= 7 of
 * the cited memories — which cannot see the loop, because assistant turns are
 * themselves stored at importance 7-8. A twin citing its own prior output
 * cleared the bar every time.
 *
 * Observed live: ten minutes after 37 contaminated rows were superseded, two
 * test questions caused query filing to mint "You are originally from Brazil
 * but now live in Lugano, Switzerland." as a fresh fact at importance 8.
 *
 * These tests pin the gate: an insight must rest on at least two cited
 * memories that are not the twin's own output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const completeMock = vi.fn();
const generateEmbeddingMock = vi.fn();
const rpcMock = vi.fn();
const insertMock = vi.fn();
const getFeatureFlagsMock = vi.fn();

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_EXTRACTION: 'extraction',
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: (...a) => generateEmbeddingMock(...a),
}));
vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: (...a) => getFeatureFlagsMock(...a),
}));
vi.mock('../../../api/services/neuropilRouter.js', () => ({
  classifyNeuropil: () => ({ neuropilId: 'personality' }),
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    rpc: (...a) => rpcMock(...a),
    from: () => ({ insert: (...a) => insertMock(...a) }),
  },
}));

const { fileQueryInsightIfValuable } = await import('../../../api/services/wikiCompilationService.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** A memory the twin itself produced. */
const twinTurn = (id, imp = 8) => ({
  id, memory_type: 'conversation', importance_score: imp,
  metadata: { source: 'twin_chat', role: 'assistant' },
});
/** The user's own words. */
const userTurn = (id, imp = 8) => ({
  id, memory_type: 'conversation', importance_score: imp,
  metadata: { source: 'twin_chat', role: 'user' },
});
/** Observed platform behaviour. */
const platform = (id, imp = 8) => ({
  id, memory_type: 'platform_data', importance_score: imp,
  metadata: { source: 'spotify' },
});
/** A previously filed query_filing fact — twin output wearing a fact's clothes. */
const filedFact = (id, imp = 8) => ({
  id, memory_type: 'fact', importance_score: imp,
  metadata: { source: 'query_filing' },
});

const LUGANO = 'You live in **Lugano**, but you\'re originally from **Brazil**.';

describe('query filing provenance gate (#237)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeatureFlagsMock.mockResolvedValue({ llm_wiki: true });
    completeMock.mockResolvedValue({ content: 'You are originally from Brazil but now live in Lugano, Switzerland.' });
    generateEmbeddingMock.mockResolvedValue(new Array(1536).fill(0.01));
    rpcMock.mockResolvedValue({ data: [] });
    insertMock.mockResolvedValue({ error: null });
  });

  it('REFUSES to file when the evidence is the twin citing itself — the Lugano case', async () => {
    const cited = [twinTurn('a'), twinTurn('b'), twinTurn('c')];
    const res = await fileQueryInsightIfValuable(USER, ['a', 'b', 'c'], LUGANO, cited);

    expect(res.filed).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
    // It must not even pay for the extraction call.
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('REFUSES when previously-filed query_filing facts are the only support (no laundering loop)', async () => {
    const cited = [filedFact('a'), filedFact('b'), twinTurn('c')];
    const res = await fileQueryInsightIfValuable(USER, ['a', 'b', 'c'], LUGANO, cited);
    expect(res.filed).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('REFUSES when only one grounded memory backs the claim', async () => {
    const cited = [userTurn('a'), twinTurn('b'), twinTurn('c')];
    const res = await fileQueryInsightIfValuable(USER, ['a', 'b', 'c'], LUGANO, cited);
    expect(res.filed).toBe(false);
  });

  it('FILES when at least two grounded memories back the claim', async () => {
    const cited = [userTurn('a'), platform('b'), twinTurn('c')];
    const res = await fileQueryInsightIfValuable(USER, ['a', 'b', 'c'], 'You train most evenings.', cited);

    expect(res.filed).not.toBe(false);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('files beneath first-person testimony and marks it twin-derived', async () => {
    const cited = [userTurn('a'), platform('b')];
    await fileQueryInsightIfValuable(USER, ['a', 'b'], 'You train most evenings.', cited);

    const row = insertMock.mock.calls[0][0];
    expect(row.importance_score).toBeLessThan(8);   // life_story facts are 8
    expect(row.confidence).toBeLessThan(0.7);       // default fact prior
    expect(row.metadata.provenance).toBe('twin_derived');
    expect(row.metadata.verified).toBe(false);
    expect(row.metadata.grounded_memory_ids).toEqual(['a', 'b']);
  });

  it('measures importance over the grounded subset, so twin turns cannot inflate it', async () => {
    // Grounded evidence is weak (4); twin turns are 10. Old code averaged all
    // five to 7.6 and filed. The gate must now see 4 and refuse.
    const cited = [userTurn('a', 4), platform('b', 4), twinTurn('c', 10), twinTurn('d', 10), twinTurn('e', 10)];
    const res = await fileQueryInsightIfValuable(USER, ['a', 'b', 'c', 'd', 'e'], LUGANO, cited);

    expect(res.filed).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
