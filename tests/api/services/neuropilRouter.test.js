import { describe, it, expect } from 'vitest';
import { classifyNeuropil } from '../../../api/services/neuropilRouter.js';

describe('classifyNeuropil', () => {
  describe('lifestyle domain', () => {
    it('classifies lifestyle keywords (sleep + morning + routine)', () => {
      const result = classifyNeuropil('I keep a morning routine to help me sleep better');
      expect(result.neuropilId).toBe('lifestyle');
      expect(result.weights).toBeDefined();
      expect(result.budgets.platform_data).toBe(10);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('lifestyle weights are recency=0 (identity-like)', () => {
      const result = classifyNeuropil('daily exercise routine and sleep quality');
      expect(result.neuropilId).toBe('lifestyle');
      expect(result.weights.recency).toBe(0.0);
    });
  });

  describe('motivation domain', () => {
    it('classifies motivation keywords (goal + career + achieve)', () => {
      const result = classifyNeuropil('my career goal is to achieve financial success');
      expect(result.neuropilId).toBe('motivation');
      expect(result.budgets.facts).toBe(8);
    });
  });

  describe('personality domain', () => {
    it('classifies personality keywords (who am i + identity)', () => {
      const result = classifyNeuropil('who am i really — what is my identity?');
      expect(result.neuropilId).toBe('personality');
      expect(result.weights.importance).toBe(2.0);
    });
  });

  describe('cultural domain', () => {
    it('classifies cultural keywords (music + movie + taste)', () => {
      const result = classifyNeuropil('my taste in music and movie genre preferences');
      expect(result.neuropilId).toBe('cultural');
      expect(result.budgets.platform_data).toBe(6);
    });
  });

  describe('social domain', () => {
    it('classifies social keywords (friend + relationship + community)', () => {
      const result = classifyNeuropil('my friend relationship dynamics in our community');
      expect(result.neuropilId).toBe('social');
      expect(result.budgets.conversations).toBe(8);
    });
  });

  describe('ambiguous / insufficient', () => {
    it('returns null when fewer than 2 keyword matches', () => {
      const result = classifyNeuropil('hello there how are you');
      expect(result.neuropilId).toBeNull();
      expect(result.weights).toBeNull();
      expect(result.budgets).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('returns null for a single keyword match', () => {
      // "sleep" alone matches lifestyle but count=1 is below the threshold
      const result = classifyNeuropil('I want to sleep');
      expect(result.neuropilId).toBeNull();
    });

    it('handles null / non-string input gracefully', () => {
      expect(classifyNeuropil(null).neuropilId).toBeNull();
      expect(classifyNeuropil(undefined).neuropilId).toBeNull();
      expect(classifyNeuropil(123).neuropilId).toBeNull();
      expect(classifyNeuropil('').neuropilId).toBeNull();
    });

    it('confidence caps at 1.0 and scales with matches', () => {
      const result = classifyNeuropil(
        'sleep exercise routine morning energy health diet workout recovery daily schedule habit'
      );
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('immutability', () => {
    it('returns fresh weight/budget objects (not references)', () => {
      const a = classifyNeuropil('sleep routine morning');
      const b = classifyNeuropil('sleep routine morning');
      expect(a.weights).not.toBe(b.weights);
      expect(a.budgets).not.toBe(b.budgets);
      expect(a.weights).toEqual(b.weights);
    });
  });
});
