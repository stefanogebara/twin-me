/**
 * Characterization tests for bm25Service — pure BM25 lexical scoring
 * (TiMem-inspired, arXiv 2601.02845). Zero dependencies, all functions pure.
 *
 * These pin the CURRENT behavior of keyword extraction and the BM25 formula:
 *   BM25(q,d) = Σ IDF(t) * (tf(k1+1)) / (tf + k1*(1-b + b*|d|/avgdl))
 *   IDF(t)    = log((N - df + 0.5)/(df + 0.5) + 1)
 * Load-bearing for hybrid retrieval, so the scoring math and the ordering it
 * produces are locked here against silent regressions (e.g. an IDF sign flip).
 */
import { describe, it, expect } from 'vitest';
import {
  extractKeywords,
  bm25ScoreBatch,
  bm25ScoreSingle,
} from '../../../api/services/bm25Service.js';

describe('extractKeywords', () => {
  it('lowercases, strips punctuation, drops stopwords, and dedupes', () => {
    // "The", "is", "a", "of", "the" are stopwords; "Guitar" repeats.
    expect(extractKeywords('The Guitar is a symbol of the GUITAR!')).toEqual([
      'guitar',
      'symbol',
    ]);
  });

  it('returns [] for empty / null / undefined input', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords(null)).toEqual([]);
    expect(extractKeywords(undefined)).toEqual([]);
  });

  it('drops single-character tokens but keeps apostrophes and hyphens inside words', () => {
    // \w\s'- are preserved by the replace; single chars (length <= 1) filtered.
    const out = extractKeywords("I'm a co-founder x");
    // "i'm" length 3 kept, "co-founder" kept, "a" is stopword, "x" is length 1
    expect(out).toContain("i'm");
    expect(out).toContain('co-founder');
    expect(out).not.toContain('x');
    expect(out).not.toContain('a');
  });

  it('preserves first-seen order while deduping', () => {
    expect(extractKeywords('banana apple banana cherry apple')).toEqual([
      'banana',
      'apple',
      'cherry',
    ]);
  });
});

describe('bm25ScoreBatch', () => {
  it('returns [] for an empty document set', () => {
    expect(bm25ScoreBatch('anything', [])).toEqual([]);
  });

  it('returns all-zero scores when the query has no non-stopword terms', () => {
    const docs = ['some content here', 'other content'];
    // "the of a" are all stopwords -> queryTerms empty -> zero-filled array.
    expect(bm25ScoreBatch('the of a', docs)).toEqual([0, 0]);
  });

  it('scores a matching document above a non-matching one', () => {
    const docs = ['guitar practice session', 'cooking dinner tonight'];
    const scores = bm25ScoreBatch('guitar', docs);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[1]).toBe(0);
  });

  it('gives a term appearing in ALL docs an IDF that keeps scores positive (log arg > 1)', () => {
    // With the +1 inside the log, IDF is never negative even at df === N.
    // df=N=2 -> log((2-2+0.5)/(2+0.5) + 1) = log(0.2 + 1) = log(1.2) > 0.
    const docs = ['guitar', 'guitar'];
    const scores = bm25ScoreBatch('guitar', docs);
    expect(scores[0]).toBeCloseTo(Math.log(1.2), 10);
    expect(scores[1]).toBeCloseTo(Math.log(1.2), 10);
  });

  it('matches a hand-computed BM25 value for a single-term single-doc corpus', () => {
    // Corpus: one doc "guitar" (dl=1, avgdl=1). Query "guitar" (df=1, N=1).
    // IDF = log((1-1+0.5)/(1+0.5) + 1) = log(0.5/1.5 + 1) = log(4/3).
    // tf=1, k1=1.5, b=0.75: numerator = 1*(1.5+1)=2.5
    // denom = 1 + 1.5*(1 - 0.75 + 0.75*1/1) = 1 + 1.5*1 = 2.5
    // score = log(4/3) * 2.5/2.5 = log(4/3).
    const scores = bm25ScoreBatch('guitar', ['guitar']);
    expect(scores[0]).toBeCloseTo(Math.log(4 / 3), 10);
  });

  it('rewards higher term frequency (saturating), all else equal', () => {
    // Two docs of the SAME length so length-normalization cancels; the one with
    // more occurrences of the query term scores higher.
    const docs = ['guitar guitar filler filler', 'guitar filler filler filler'];
    const scores = bm25ScoreBatch('guitar', docs);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it('honors custom k1/b params (k1=0 collapses tf saturation to a constant)', () => {
    // With k1=0: term = IDF * (tf*1) / (tf + 0) = IDF, independent of tf and length.
    const docs = ['guitar guitar guitar', 'guitar'];
    const scores = bm25ScoreBatch('guitar', docs, { k1: 0, b: 0 });
    expect(scores[0]).toBeCloseTo(scores[1], 10);
  });

  it('treats null/undefined documents as empty strings without throwing', () => {
    const scores = bm25ScoreBatch('guitar', ['guitar', null, undefined]);
    expect(scores).toHaveLength(3);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[1]).toBe(0);
    expect(scores[2]).toBe(0);
  });

  it('sums contributions across multiple query terms', () => {
    const docs = ['guitar and piano', 'guitar only'];
    const both = bm25ScoreBatch('guitar piano', docs);
    const one = bm25ScoreBatch('guitar', docs);
    // Doc 0 contains both terms, so its multi-term score exceeds its single-term score.
    expect(both[0]).toBeGreaterThan(one[0]);
  });
});

describe('bm25ScoreSingle', () => {
  it('returns 0 when keywords are empty or document is falsy', () => {
    expect(bm25ScoreSingle([], 'guitar', 5)).toBe(0);
    expect(bm25ScoreSingle(['guitar'], '', 5)).toBe(0);
    expect(bm25ScoreSingle(['guitar'], null, 5)).toBe(0);
  });

  it('returns 0 when no keyword occurs in the document', () => {
    expect(bm25ScoreSingle(['guitar'], 'cooking dinner', 5)).toBe(0);
  });

  it('uses a fixed IDF of log(2) for the single-doc approximation', () => {
    // doc "guitar" (dl=1), avgDocLength=1, tf=1, k1=1.5, b=0.75:
    // denom = 1 + 1.5*(1-0.75+0.75*1/1) = 2.5; numerator = 2.5; ratio = 1.
    // score = log(2) * 1 = log(2).
    expect(bm25ScoreSingle(['guitar'], 'guitar', 1)).toBeCloseTo(Math.log(2), 10);
  });

  it('increases with additional matching keywords', () => {
    const one = bm25ScoreSingle(['guitar'], 'guitar piano', 2);
    const two = bm25ScoreSingle(['guitar', 'piano'], 'guitar piano', 2);
    expect(two).toBeGreaterThan(one);
  });
});
