/**
 * Neuropil Router — Unit Tests
 * ============================
 * Tests for classifyNeuropil and NEUROPILS constants.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyNeuropil,
  NEUROPILS,
  DEFAULT_BUDGETS,
  DEFAULT_WEIGHTS,
} from '../../../api/services/neuropilRouter.js';

// ---------------------------------------------------------------------------
// classifyNeuropil
// ---------------------------------------------------------------------------

describe('classifyNeuropil', () => {
  it('routes sleep/health queries to lifestyle neuropil', () => {
    const result = classifyNeuropil('How did I sleep last night? What was my recovery?');
    expect(result.neuropilId).toBe('lifestyle');
    expect(result.weights).toEqual(NEUROPILS.lifestyle.weights);
    expect(result.budgets).toEqual(NEUROPILS.lifestyle.budgets);
  });

  it('routes music/media queries to cultural neuropil', () => {
    const result = classifyNeuropil('What music have I been listening to this week?');
    expect(result.neuropilId).toBe('cultural');
  });

  it('routes emotional queries to personality neuropil', () => {
    const result = classifyNeuropil("How have my emotions and mood been lately?");
    expect(result.neuropilId).toBe('personality');
  });

  it('routes social queries to social neuropil', () => {
    const result = classifyNeuropil('How has my social life been? Any interesting conversations with friends?');
    expect(result.neuropilId).toBe('social');
  });

  it('routes goal/work queries to motivation neuropil', () => {
    const result = classifyNeuropil("What's my progress on my goals and career plans?");
    expect(result.neuropilId).toBe('motivation');
  });

  it('returns null neuropilId for generic messages', () => {
    const result = classifyNeuropil('hey there');
    expect(result.neuropilId).toBeNull();
    expect(result.weights).toBeNull();
    expect(result.budgets).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns null for single keyword (below 2-match threshold)', () => {
    const result = classifyNeuropil('tell me about music');
    // Only 1 keyword match — should be null
    expect(result.neuropilId).toBeNull();
  });

  it('handles null/empty input gracefully', () => {
    expect(classifyNeuropil(null).neuropilId).toBeNull();
    expect(classifyNeuropil('').neuropilId).toBeNull();
    expect(classifyNeuropil(undefined).neuropilId).toBeNull();
  });

  it('picks strongest domain when multiple match', () => {
    // Heavy lifestyle + one cultural keyword
    const result = classifyNeuropil('My morning routine includes a workout, then sleep tracker check, and one podcast');
    // lifestyle has 3 matches (morning, routine, workout, sleep) vs cultural has 1 (podcast)
    expect(result.neuropilId).toBe('lifestyle');
  });

  it('confidence reflects keyword density', () => {
    const dense = classifyNeuropil('sleep exercise recovery');
    const sparse = classifyNeuropil('I was wondering about how I have been sleeping and what my exercise routine looks like over the past few weeks');
    expect(dense.confidence).toBeGreaterThan(sparse.confidence);
  });
});

// ---------------------------------------------------------------------------
// NEUROPILS constants
// ---------------------------------------------------------------------------

describe('NEUROPILS constants', () => {
  it('has exactly 5 neuropils', () => {
    expect(Object.keys(NEUROPILS)).toHaveLength(5);
  });

  it('all neuropils have required shape', () => {
    for (const [id, neuropil] of Object.entries(NEUROPILS)) {
      expect(neuropil).toHaveProperty('keywords');
      expect(neuropil).toHaveProperty('weights');
      expect(neuropil).toHaveProperty('budgets');
      expect(neuropil.keywords.length).toBeGreaterThan(5);
      expect(neuropil.weights).toHaveProperty('recency');
      expect(neuropil.weights).toHaveProperty('importance');
      expect(neuropil.weights).toHaveProperty('relevance');
      expect(neuropil.budgets).toHaveProperty('reflections');
      expect(neuropil.budgets).toHaveProperty('facts');
      expect(neuropil.budgets).toHaveProperty('platformData');
      expect(neuropil.budgets).toHaveProperty('conversations');
    }
  });

  it('retrieval weights are in valid range [0, 1]', () => {
    for (const neuropil of Object.values(NEUROPILS)) {
      for (const w of Object.values(neuropil.weights)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  it('budgets sum to ~30 (reasonable total)', () => {
    for (const [id, neuropil] of Object.entries(NEUROPILS)) {
      const total = neuropil.budgets.reflections + neuropil.budgets.facts
        + neuropil.budgets.platformData + neuropil.budgets.conversations;
      expect(total).toBeGreaterThanOrEqual(25);
      expect(total).toBeLessThanOrEqual(35);
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_BUDGETS / DEFAULT_WEIGHTS
// ---------------------------------------------------------------------------

describe('defaults match current hardcoded values', () => {
  it('DEFAULT_BUDGETS matches memoryStreamService defaults', () => {
    expect(DEFAULT_BUDGETS).toEqual({
      reflections: 15,
      facts: 8,
      platformData: 4,
      conversations: 4,
    });
  });

  it('DEFAULT_WEIGHTS is identity', () => {
    expect(DEFAULT_WEIGHTS).toBe('identity');
  });
});
