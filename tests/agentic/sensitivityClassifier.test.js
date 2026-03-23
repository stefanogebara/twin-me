/**
 * Sensitivity Classifier Tests — Privacy Routing
 * =================================================
 * Tests that health, emotional, and financial data is correctly
 * classified and routed to the cheapest model tier.
 */

import { describe, it, expect } from 'vitest';
import { classifySensitivity, tagSensitivity } from '../../api/services/sensitivityClassifier.js';

describe('Sensitivity Classifier', () => {
  describe('classifySensitivity', () => {
    // Health data
    it('detects Whoop platform as health sensitive', () => {
      const result = classifySensitivity('recovery score 82%', { platform: 'whoop' });
      expect(result.isSensitive).toBe(true);
      expect(result.category).toBe('health');
      expect(result.recommendedTier).toBe('EXTRACTION');
    });

    it('detects fitbit platform as health sensitive', () => {
      const result = classifySensitivity('steps today', { platform: 'fitbit' });
      expect(result.isSensitive).toBe(true);
      expect(result.category).toBe('health');
    });

    it('detects health keywords', () => {
      expect(classifySensitivity('hrv dropped to 40ms').isSensitive).toBe(true);
      expect(classifySensitivity('heart rate elevated').isSensitive).toBe(true);
      expect(classifySensitivity('sleep score was 65').isSensitive).toBe(true);
      expect(classifySensitivity('recovery is low today').isSensitive).toBe(true);
      expect(classifySensitivity('taking medication for headaches').isSensitive).toBe(true);
    });

    // Emotional data
    it('detects emotional keywords', () => {
      const result = classifySensitivity('my anxiety has been really bad');
      expect(result.isSensitive).toBe(true);
      expect(result.category).toBe('emotional');
      expect(result.recommendedTier).toBe('ANALYSIS');
    });

    it('detects depression mentions', () => {
      expect(classifySensitivity('dealing with depression').category).toBe('emotional');
    });

    // Financial data
    it('detects financial keywords', () => {
      const result = classifySensitivity('my salary is 120k');
      expect(result.isSensitive).toBe(true);
      expect(result.category).toBe('financial');
      expect(result.recommendedTier).toBe('EXTRACTION');
    });

    it('detects debt mentions', () => {
      expect(classifySensitivity('credit card debt is growing').isSensitive).toBe(true);
    });

    // Non-sensitive
    it('does not flag normal content', () => {
      expect(classifySensitivity('playing Radiohead all night').isSensitive).toBe(false);
      expect(classifySensitivity('had a great meeting today').isSensitive).toBe(false);
      expect(classifySensitivity('watched a YouTube video').isSensitive).toBe(false);
    });

    it('returns null category for non-sensitive', () => {
      const result = classifySensitivity('hello world');
      expect(result.category).toBeNull();
      expect(result.recommendedTier).toBeNull();
    });

    it('handles empty/null input', () => {
      expect(classifySensitivity('').isSensitive).toBe(false);
      expect(classifySensitivity(null).isSensitive).toBe(false);
    });
  });

  describe('tagSensitivity', () => {
    it('adds sensitivity tags to metadata', () => {
      const meta = tagSensitivity('hrv dropped', { platform: 'whoop' });
      expect(meta.sensitivity).toBe('health');
      expect(meta.sensitivity_tier).toBe('EXTRACTION');
      expect(meta.platform).toBe('whoop');
    });

    it('returns original metadata for non-sensitive content', () => {
      const original = { source: 'spotify', platform: 'spotify' };
      const result = tagSensitivity('playing Drake', original);
      expect(result).toBe(original); // Same reference — no copy made
    });

    it('does not mutate original metadata', () => {
      const original = { source: 'test' };
      const result = tagSensitivity('depression is hard', original);
      expect(result).not.toBe(original);
      expect(original.sensitivity).toBeUndefined();
      expect(result.sensitivity).toBe('emotional');
    });
  });
});
