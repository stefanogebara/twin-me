/**
 * Neuropil Router — Unit Tests
 * ============================
 * Tests for classifyNeuropil and NEUROPILS constants.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyNeuropil,
} from '../../../api/services/neuropilRouter.js';

// ---------------------------------------------------------------------------
// classifyNeuropil
// ---------------------------------------------------------------------------

describe('classifyNeuropil', () => {
  it('routes sleep/health queries to lifestyle neuropil', () => {
    const result = classifyNeuropil('How did I sleep last night? What was my recovery?');
    expect(result.neuropilId).toBe('lifestyle');
    expect(result.weights).toBeDefined();
    expect(result.budgets).toBeDefined();
  });

  it('routes music/media queries to cultural neuropil', () => {
    const result = classifyNeuropil('What music have I been listening to this week?');
    expect(result.neuropilId).toBe('cultural');
  });

  it('routes identity queries to personality neuropil', () => {
    const result = classifyNeuropil("Who am I really? What are my personality traits and values?");
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
    // Both must have >= 2 keywords to activate; compare confidence
    const dense = classifyNeuropil('sleep exercise recovery energy health');
    const sparse = classifyNeuropil('sleep exercise');
    expect(dense.confidence).toBeGreaterThan(sparse.confidence);
  });
});

// ---------------------------------------------------------------------------
// classifyNeuropil — output shape validation
// ---------------------------------------------------------------------------

describe('classifyNeuropil output shape', () => {
  it('returns all 5 neuropils when queried specifically', () => {
    const domains = ['personality', 'lifestyle', 'cultural', 'social', 'motivation'];
    const messages = {
      personality: 'Who am I? My personality traits and identity values',
      lifestyle: 'How did I sleep? What about my exercise and recovery?',
      cultural: 'What music do I listen to? My taste and aesthetic',
      social: 'Tell me about my relationships and social community',
      motivation: 'What are my goals and career ambitions?',
    };
    for (const domain of domains) {
      const result = classifyNeuropil(messages[domain]);
      expect(result.neuropilId, `expected ${domain}`).toBe(domain);
    }
  });

  it('all classified results have weights with recency, importance, relevance', () => {
    const result = classifyNeuropil('sleep and exercise routine');
    expect(result.weights).toHaveProperty('recency');
    expect(result.weights).toHaveProperty('importance');
    expect(result.weights).toHaveProperty('relevance');
  });

  it('all classified results have budgets with memory types', () => {
    const result = classifyNeuropil('sleep and exercise routine');
    expect(result.budgets).toHaveProperty('reflections');
    expect(result.budgets).toHaveProperty('facts');
    expect(result.budgets).toHaveProperty('platform_data');
  });

  it('retrieval weights are in valid range [0, 1]', () => {
    const result = classifyNeuropil('personality identity values traits soul');
    for (const w of Object.values(result.weights)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('budgets sum to 20 (balanced total)', () => {
    const result = classifyNeuropil('personality identity values traits soul');
    const total = Object.values(result.budgets).reduce((a, b) => a + b, 0);
    expect(total).toBe(20);
  });
});
