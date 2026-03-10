/**
 * Tests for api/services/neurotransmitterService.js
 * Pure functions — no DB, no LLM, microseconds.
 */
import { describe, it, expect } from 'vitest';
import {
  detectConversationMode,
  applyNeurotransmitterModifiers,
  buildNeurotransmitterPromptBlock,
} from '../../../api/services/neurotransmitterService.js';

describe('detectConversationMode', () => {
  it('returns default for empty string', () => {
    const result = detectConversationMode('');
    expect(result.mode).toBe('default');
    expect(result.confidence).toBe(0);
    expect(result.matchedKeywords).toEqual([]);
  });

  it('returns default for null/undefined', () => {
    expect(detectConversationMode(null).mode).toBe('default');
    expect(detectConversationMode(undefined).mode).toBe('default');
  });

  it('returns default for non-string input', () => {
    expect(detectConversationMode(42).mode).toBe('default');
    expect(detectConversationMode({}).mode).toBe('default');
  });

  it('returns default when < 2 keywords match', () => {
    const result = detectConversationMode('I am feeling great today');
    // Only 'feeling' matches serotonergic — need >= 2
    expect(result.mode).toBe('default');
  });

  it('detects serotonergic mode with emotional keywords', () => {
    const result = detectConversationMode('I am feeling really stressed and anxious lately');
    expect(result.mode).toBe('serotonergic');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.matchedKeywords).toContain('feeling');
    expect(result.matchedKeywords).toContain('stressed');
    expect(result.matchedKeywords).toContain('anxious');
  });

  it('detects dopaminergic mode with analytical keywords', () => {
    const result = detectConversationMode('I need to analyze my data and plan a new strategy');
    expect(result.mode).toBe('dopaminergic');
    expect(result.matchedKeywords).toContain('analyze');
    expect(result.matchedKeywords).toContain('data');
    expect(result.matchedKeywords).toContain('plan');
    expect(result.matchedKeywords).toContain('strategy');
  });

  it('detects noradrenergic mode with creative keywords', () => {
    const result = detectConversationMode('Let me brainstorm and explore some creative ideas');
    expect(result.mode).toBe('noradrenergic');
    expect(result.matchedKeywords).toContain('brainstorm');
    expect(result.matchedKeywords).toContain('explore');
    expect(result.matchedKeywords).toContain('creative');
  });

  it('is case-insensitive', () => {
    const result = detectConversationMode('I am STRESSED and really WORRIED about this');
    expect(result.mode).toBe('serotonergic');
    expect(result.matchedKeywords).toContain('stressed');
    expect(result.matchedKeywords).toContain('worried');
  });

  it('confidence caps at 1.0 with many matches', () => {
    // Pack in many serotonergic keywords
    const result = detectConversationMode(
      'feeling stressed sad anxious overwhelmed lonely worried tired struggling grateful'
    );
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });

  it('picks the mode with the highest keyword count', () => {
    // 2 dopaminergic + 3 serotonergic → serotonergic wins
    const result = detectConversationMode('I am feeling sad and worried, should I analyze the data?');
    expect(result.mode).toBe('serotonergic');
  });
});

describe('applyNeurotransmitterModifiers', () => {
  const baseParams = {
    temperature: 0.7,
    top_p: 0.9,
    frequency_penalty: 0.1,
    presence_penalty: 0.1,
  };

  it('returns a NEW object (immutable)', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'serotonergic');
    expect(result).not.toBe(baseParams);
  });

  it('does not mutate baseParams', () => {
    const copy = { ...baseParams };
    applyNeurotransmitterModifiers(baseParams, 'dopaminergic');
    expect(baseParams).toEqual(copy);
  });

  it('applies serotonergic deltas (warmer)', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'serotonergic');
    expect(result.temperature).toBeCloseTo(0.75); // 0.7 + 0.05
    expect(result.frequency_penalty).toBeCloseTo(0.02); // 0.1 - 0.08
    expect(result.presence_penalty).toBeCloseTo(0.15); // 0.1 + 0.05
  });

  it('applies dopaminergic deltas (precise)', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'dopaminergic');
    expect(result.temperature).toBeCloseTo(0.62); // 0.7 - 0.08
    expect(result.top_p).toBeCloseTo(0.87); // 0.9 - 0.03
    expect(result.frequency_penalty).toBeCloseTo(0.18); // 0.1 + 0.08
    expect(result.presence_penalty).toBeCloseTo(0.05); // 0.1 - 0.05
  });

  it('applies noradrenergic deltas (creative)', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'noradrenergic');
    expect(result.temperature).toBeCloseTo(0.8); // 0.7 + 0.10
    expect(result.top_p).toBeCloseTo(0.95); // 0.9 + 0.05
    expect(result.frequency_penalty).toBeCloseTo(0.13); // 0.1 + 0.03
    expect(result.presence_penalty).toBeCloseTo(0.13); // 0.1 + 0.03
  });

  it('applies no change for default mode', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'default');
    expect(result.temperature).toBeCloseTo(0.7);
    expect(result.top_p).toBeCloseTo(0.9);
    expect(result.frequency_penalty).toBeCloseTo(0.1);
    expect(result.presence_penalty).toBeCloseTo(0.1);
  });

  it('clamps temperature to [0.4, 0.95]', () => {
    const hot = applyNeurotransmitterModifiers({ ...baseParams, temperature: 0.93 }, 'noradrenergic');
    expect(hot.temperature).toBeLessThanOrEqual(0.95);

    const cold = applyNeurotransmitterModifiers({ ...baseParams, temperature: 0.42 }, 'dopaminergic');
    expect(cold.temperature).toBeGreaterThanOrEqual(0.4);
  });

  it('clamps top_p to [0.8, 0.98]', () => {
    const high = applyNeurotransmitterModifiers({ ...baseParams, top_p: 0.97 }, 'noradrenergic');
    expect(high.top_p).toBeLessThanOrEqual(0.98);

    const low = applyNeurotransmitterModifiers({ ...baseParams, top_p: 0.81 }, 'dopaminergic');
    expect(low.top_p).toBeGreaterThanOrEqual(0.8);
  });

  it('clamps penalties to [0, 0.3]', () => {
    const lowFreq = applyNeurotransmitterModifiers(
      { ...baseParams, frequency_penalty: 0.02 },
      'serotonergic' // -0.08 delta → would be negative
    );
    expect(lowFreq.frequency_penalty).toBeGreaterThanOrEqual(0);

    const highFreq = applyNeurotransmitterModifiers(
      { ...baseParams, frequency_penalty: 0.28 },
      'dopaminergic' // +0.08 delta → would exceed 0.3
    );
    expect(highFreq.frequency_penalty).toBeLessThanOrEqual(0.3);
  });

  it('handles unknown mode gracefully (treats as default)', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'unknown-mode');
    expect(result.temperature).toBeCloseTo(0.7);
  });

  it('uses default base values when params are missing', () => {
    const result = applyNeurotransmitterModifiers({}, 'default');
    expect(result.temperature).toBeCloseTo(0.7);
    expect(result.top_p).toBeCloseTo(0.9);
    expect(result.frequency_penalty).toBeCloseTo(0.1);
    expect(result.presence_penalty).toBeCloseTo(0.1);
  });
});

describe('buildNeurotransmitterPromptBlock', () => {
  it('returns non-empty string for serotonergic', () => {
    const block = buildNeurotransmitterPromptBlock('serotonergic');
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('empathetic');
  });

  it('returns non-empty string for dopaminergic', () => {
    const block = buildNeurotransmitterPromptBlock('dopaminergic');
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('analytical');
  });

  it('returns non-empty string for noradrenergic', () => {
    const block = buildNeurotransmitterPromptBlock('noradrenergic');
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('creative');
  });

  it('returns empty string for default mode', () => {
    expect(buildNeurotransmitterPromptBlock('default')).toBe('');
  });

  it('returns empty string for unknown mode', () => {
    expect(buildNeurotransmitterPromptBlock('nonexistent')).toBe('');
  });
});
