/**
 * Tests for api/services/neuropilRouter.js
 * Pure functions — no DB, no LLM, microseconds.
 */
import { describe, it, expect } from 'vitest';
import { classifyNeuropil } from '../../../api/services/neuropilRouter.js';

describe('classifyNeuropil', () => {
  it('returns null neuropilId for empty string', () => {
    const result = classifyNeuropil('');
    expect(result.neuropilId).toBeNull();
    expect(result.weights).toBeNull();
    expect(result.budgets).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns null for null/undefined input', () => {
    expect(classifyNeuropil(null).neuropilId).toBeNull();
    expect(classifyNeuropil(undefined).neuropilId).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(classifyNeuropil(42).neuropilId).toBeNull();
    expect(classifyNeuropil({}).neuropilId).toBeNull();
  });

  it('returns null when < 2 keywords match', () => {
    const result = classifyNeuropil('I like music');
    // Only 'music' matches cultural — need >= 2
    expect(result.neuropilId).toBeNull();
  });

  it('classifies personality neuropil', () => {
    const result = classifyNeuropil('Who am I? I want to understand my personality and values');
    expect(result.neuropilId).toBe('personality');
    expect(result.weights).toBeDefined();
    expect(result.weights.recency).toBe(0.3);
    expect(result.weights.importance).toBe(0.8);
    expect(result.weights.relevance).toBe(1.0);
    expect(result.budgets).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies lifestyle neuropil', () => {
    const result = classifyNeuropil('How did I sleep? What was my recovery and energy like?');
    expect(result.neuropilId).toBe('lifestyle');
    expect(result.weights.recency).toBe(1.0);
    expect(result.budgets.platform_data).toBe(10); // lifestyle has most platform_data
  });

  it('classifies cultural neuropil', () => {
    const result = classifyNeuropil('What music do I listen to on Spotify? What is my taste?');
    expect(result.neuropilId).toBe('cultural');
    expect(result.budgets.platform_data).toBe(6);
  });

  it('classifies social neuropil', () => {
    const result = classifyNeuropil('How are my relationships? Tell me about my social and community activity on Discord');
    expect(result.neuropilId).toBe('social');
    expect(result.budgets.conversations).toBe(8); // social has most conversations
  });

  it('classifies motivation neuropil', () => {
    const result = classifyNeuropil('What are my career goals? What is my ambition and purpose?');
    expect(result.neuropilId).toBe('motivation');
    expect(result.budgets.facts).toBe(8); // motivation has most facts
  });

  it('is case-insensitive', () => {
    const result = classifyNeuropil('SLEEP and EXERCISE are important to my HEALTH');
    expect(result.neuropilId).toBe('lifestyle');
  });

  it('returns a copy of weights (not a reference)', () => {
    const r1 = classifyNeuropil('personality and identity and values');
    const r2 = classifyNeuropil('personality and identity and values');
    expect(r1.weights).not.toBe(r2.weights);
    expect(r1.weights).toEqual(r2.weights);
  });

  it('returns a copy of budgets (not a reference)', () => {
    const r1 = classifyNeuropil('personality and identity and values');
    const r2 = classifyNeuropil('personality and identity and values');
    expect(r1.budgets).not.toBe(r2.budgets);
    expect(r1.budgets).toEqual(r2.budgets);
  });

  it('confidence caps at 1.0 with many matches', () => {
    const result = classifyNeuropil(
      'music movie book show art taste aesthetic genre style culture spotify youtube watch listen read'
    );
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });

  it('picks the neuropil with the highest keyword count', () => {
    // 2 lifestyle + 3 cultural → cultural wins
    const result = classifyNeuropil('sleep and exercise, but also music taste and culture');
    expect(result.neuropilId).toBe('cultural');
  });

  it('all neuropil budgets sum to 20', () => {
    // Each neuropil should have consistent total budget
    const neuropils = ['personality', 'lifestyle', 'cultural', 'social', 'motivation'];
    for (const name of neuropils) {
      // Build a message that strongly activates this neuropil
      let msg;
      switch (name) {
        case 'personality': msg = 'personality identity values character trait'; break;
        case 'lifestyle': msg = 'sleep exercise routine morning energy'; break;
        case 'cultural': msg = 'music movie book show art'; break;
        case 'social': msg = 'friend relationship people social talk'; break;
        case 'motivation': msg = 'goal ambition career work achieve'; break;
      }
      const result = classifyNeuropil(msg);
      expect(result.neuropilId).toBe(name);
      const total = Object.values(result.budgets).reduce((a, b) => a + b, 0);
      expect(total).toBe(20);
    }
  });
});
