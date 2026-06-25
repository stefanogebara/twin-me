/**
 * Tests for the PURE core of sticking-point — most-repeated-search detection
 * and the prompt assembly. The LLM voicing/gate + DB gather are glue (live).
 */
import { describe, it, expect } from 'vitest';
import {
  topRecurringSearch,
  buildStickingPrompt,
  MIN_REPEATS,
} from '../../../api/services/stickingPoint.js';

const repeat = (q, n) => Array.from({ length: n }, () => q);

describe('topRecurringSearch', () => {
  it('returns the single most-repeated query with its count', () => {
    const searches = [
      ...repeat('como editar templates no site da meta', 21),
      ...repeat('evolution api', 13),
      ...repeat('whatsapp message limit', 8),
    ];
    const top = topRecurringSearch(searches);
    expect(top).not.toBeNull();
    expect(top.query).toBe('como editar templates no site da meta');
    expect(top.count).toBe(21);
    expect(top.distinctSearches).toBe(3);
  });

  it('normalizes case + whitespace when counting', () => {
    const searches = ['Evolution API', 'evolution api ', '  EVOLUTION API', 'x'];
    const top = topRecurringSearch(searches, { minRepeats: 3 });
    expect(top.query).toBe('evolution api');
    expect(top.count).toBe(3);
  });

  it('returns null when nothing is repeated enough', () => {
    const searches = ['one thing', 'two thing', 'three thing']; // each once
    expect(topRecurringSearch(searches)).toBeNull();
    // exactly at the floor passes; one below fails
    expect(topRecurringSearch(repeat('a real query', MIN_REPEATS))).not.toBeNull();
    expect(topRecurringSearch(repeat('a real query', MIN_REPEATS - 1))).toBeNull();
  });

  it('ignores trivially short queries and empty input', () => {
    expect(topRecurringSearch(['ab', 'ab', 'ab', 'ab'])).toBeNull(); // < 4 chars
    expect(topRecurringSearch([])).toBeNull();
    expect(topRecurringSearch(null)).toBeNull();
  });
});

describe('buildStickingPrompt', () => {
  it('includes the query, the count, and the NONE sensitivity gate', () => {
    const p = buildStickingPrompt({ query: 'evolution api', count: 13 });
    expect(p).toMatch(/13 times/);
    expect(p).toMatch(/evolution api/);
    expect(p).toMatch(/reply with exactly: NONE/);
    expect(p).toMatch(/sensitive \(health/);
    expect(p).toMatch(/ONE sentence/);
  });
});
