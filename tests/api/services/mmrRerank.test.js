/**
 * mmrRerank — the diversity reranker at the heart of memory retrieval
 * ("Memory Is Everything"). Previously unexported with only skipped tests, so a
 * sign-flip in the MMR formula produced no failing test. These lock the two
 * load-bearing behaviors with config-independent fixtures (explicit lambda,
 * same memory_type + created_at so the type/temporal terms cancel between
 * contenders and only relevance-vs-redundancy decides).
 */
import { describe, it, expect } from 'vitest';
import { mmrRerank } from '../../../api/services/memoryStreamService.js';

const AT = '2026-06-01T12:00:00Z';

describe('mmrRerank', () => {
  it('passes everything through (embedding-stripped) when candidates <= finalLimit', () => {
    const cands = [
      { id: 'a', score: 0.9, embedding: '[1,0]', memory_type: 'fact', created_at: AT },
      { id: 'b', score: 0.8, embedding: '[0,1]', memory_type: 'fact', created_at: AT },
    ];
    const out = mmrRerank(cands, 5);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.every((m) => m.embedding === undefined && m._idx === undefined)).toBe(true);
  });

  it('promotes diversity: picks the orthogonal memory over a near-duplicate with higher relevance', () => {
    const cands = [
      { id: 'A', score: 0.90, embedding: '[1,0]', memory_type: 'fact', created_at: AT },
      { id: 'B', score: 0.88, embedding: '[1,0]', memory_type: 'fact', created_at: AT }, // near-duplicate of A
      { id: 'C', score: 0.50, embedding: '[0,1]', memory_type: 'fact', created_at: AT }, // diverse, lower relevance
    ];
    // A wins slot 1 on pure relevance; slot 2 is the real MMR test: C's diversity
    // must beat B's marginally-higher relevance because B is redundant with A.
    const out = mmrRerank(cands, 2, 0.5);
    expect(out.map((m) => m.id)).toEqual(['A', 'C']);
  });

  it('strips embeddings from the reranked output (no vector leaks downstream)', () => {
    const cands = [
      { id: 'A', score: 0.9, embedding: '[1,0]', memory_type: 'fact', created_at: AT },
      { id: 'B', score: 0.8, embedding: '[1,0]', memory_type: 'fact', created_at: AT },
      { id: 'C', score: 0.7, embedding: '[0,1]', memory_type: 'fact', created_at: AT },
    ];
    const out = mmrRerank(cands, 2, 0.5);
    expect(out.every((m) => m.embedding === undefined)).toBe(true);
  });
});
