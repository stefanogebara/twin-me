/**
 * Tests for supersession selection (api/services/memoryStreamService.js).
 *
 * optmem-brain audit, Phase 1 (root cause 3): nothing in the system could ever
 * retire a stale snapshot. The live DB now has user_memories.superseded_by /
 * superseded_at and search_memory_stream filters on them, but ZERO rows were
 * ever marked and no application code referenced the columns — the schema was
 * inert. This is the write path that gives it meaning.
 *
 * Why NOT the audit's suggested one-liner (add platform_data to REVISION_TYPES):
 * maybeReviseExistingMemory keeps the OLD row's content, bumps its confidence
 * +0.05 and refreshes last_accessed_at, then returns early so the NEW value is
 * discarded. For a reflection reaffirming the same proposition that is right.
 * For a snapshot whose VALUE changed it is exactly backwards — it would leave
 * the stale number in place, more trusted and more recent than before, and
 * throw away the correct one. Supersession is the opposite: the new row wins
 * and the old one is retired, untouched otherwise.
 */
import { describe, it, expect, vi } from 'vitest';

process.env.NODE_ENV = 'test';

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  vectorToString: vi.fn().mockReturnValue('[0,0,0]'),
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '5' }),
  stream: vi.fn(),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));
process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { selectSupersededIds, SUPERSEDE_SIMILARITY_THRESHOLD } =
  await import('../../../api/services/memoryStreamService.js');

/** A stored row as the DB returns it — embedding is a pgvector string. */
const row = (id, embedding, overrides = {}) => ({
  id,
  content: `observation ${id}`,
  embedding,
  superseded_at: null,
  metadata: { source: 'gmail', platform: 'gmail' },
  ...overrides,
});

const NEW = {
  content: 'Has a backlog of 40448 unread emails in inbox',
  embedding: [1, 0, 0],
  platform: 'gmail',
};

describe('selectSupersededIds', () => {
  it('retires a near-identical prior observation', () => {
    const ids = selectSupersededIds({ ...NEW, candidates: [row('old', '[1,0,0]')] });
    expect(ids).toEqual(['old']);
  });

  it('leaves a semantically unrelated observation alone', () => {
    const ids = selectSupersededIds({ ...NEW, candidates: [row('unrelated', '[0,1,0]')] });
    expect(ids).toEqual([]);
  });

  it('retires every matching prior, not just the newest', () => {
    const ids = selectSupersededIds({
      ...NEW,
      candidates: [row('a', '[1,0,0]'), row('b', '[0,1,0]'), row('c', '[1,0,0]')],
    });
    expect(ids).toEqual(['a', 'c']);
  });

  it('never re-retires an already superseded row', () => {
    const ids = selectSupersededIds({
      ...NEW,
      candidates: [row('already', '[1,0,0]', { superseded_at: '2026-07-01T00:00:00Z' })],
    });
    expect(ids).toEqual([]);
  });

  it('treats a row whose replacement was DELETED as still retired', () => {
    // superseded_by is `ON DELETE SET NULL`, so deleting the replacement nulls
    // it on every row it retired. superseded_at has no FK and survives, which
    // is why it — not superseded_by — is the source of truth (migration
    // 20260728151001). Keying off superseded_by here would resurrect the row.
    const orphaned = row('orphaned', '[1,0,0]', {
      superseded_by: null,                       // replacement row is gone
      superseded_at: '2026-07-01T00:00:00Z',     // but it is still retired
    });
    expect(selectSupersededIds({ ...NEW, candidates: [orphaned] })).toEqual([]);
  });

  it('never retires across platforms — Gmail must not retire Outlook', () => {
    const outlook = row('outlook', '[1,0,0]', {
      metadata: { source: 'outlook', platform: 'outlook' },
    });
    expect(selectSupersededIds({ ...NEW, candidates: [outlook] })).toEqual([]);
  });

  it('retires when the prior row has no platform recorded (legacy rows)', () => {
    const legacy = row('legacy', '[1,0,0]', { metadata: {} });
    expect(selectSupersededIds({ ...NEW, candidates: [legacy] })).toEqual(['legacy']);
  });

  it('returns nothing without an embedding — never guess', () => {
    expect(selectSupersededIds({ ...NEW, embedding: null, candidates: [row('x', '[1,0,0]')] }))
      .toEqual([]);
  });

  it('skips rows with missing or unparseable embeddings instead of throwing', () => {
    const ids = selectSupersededIds({
      ...NEW,
      candidates: [row('novec', null), row('bad', 'not-a-vector'), row('good', '[1,0,0]')],
    });
    expect(ids).toEqual(['good']);
  });

  it('tolerates a null/empty candidate list', () => {
    expect(selectSupersededIds({ ...NEW, candidates: null })).toEqual([]);
    expect(selectSupersededIds({ ...NEW, candidates: [] })).toEqual([]);
  });

  it('honours a custom threshold', () => {
    // [1,0,0] vs [0.8,0.6,0] -> cosine 0.8: below the default, above a lax bar.
    const candidates = [row('partial', '[0.8,0.6,0]')];
    expect(selectSupersededIds({ ...NEW, candidates })).toEqual([]);
    expect(selectSupersededIds({ ...NEW, candidates, threshold: 0.75 })).toEqual(['partial']);
  });

  it('uses a threshold at least as strict as the revision path', () => {
    // Retiring a memory is destructive; it must not fire more loosely than the
    // conservative in-place revision path (0.90).
    expect(SUPERSEDE_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0.9);
    expect(SUPERSEDE_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
  });
});
