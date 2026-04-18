import { describe, it, expect } from 'vitest';
import {
  detectConversationMode,
  applyNeurotransmitterModifiers,
  buildNeurotransmitterPromptBlock,
} from '../../../api/services/neurotransmitterService.js';

describe('detectConversationMode', () => {
  it('detects serotonergic with >=2 emotional keywords', () => {
    const result = detectConversationMode('I am feeling stressed and anxious today');
    expect(result.mode).toBe('serotonergic');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('detects dopaminergic with analytical keywords', () => {
    const result = detectConversationMode('Help me analyze my productivity metrics and plan my schedule');
    expect(result.mode).toBe('dopaminergic');
    expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('detects noradrenergic with creative keywords', () => {
    const result = detectConversationMode('Let us brainstorm creative ideas and imagine what if possibilities');
    expect(result.mode).toBe('noradrenergic');
    expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to default with only 1 keyword match', () => {
    const result = detectConversationMode('I am feeling great');
    expect(result.mode).toBe('default');
    expect(result.confidence).toBe(0);
    expect(result.matchedKeywords).toEqual([]);
  });

  it('falls back to default with no keywords', () => {
    const result = detectConversationMode('Tell me about the weather');
    expect(result.mode).toBe('default');
    expect(result.confidence).toBe(0);
  });

  it('handles null / non-string input', () => {
    expect(detectConversationMode(null).mode).toBe('default');
    expect(detectConversationMode(undefined).mode).toBe('default');
    expect(detectConversationMode('').mode).toBe('default');
  });

  it('caps confidence at 1.0', () => {
    const result = detectConversationMode(
      'stressed anxious sad worried lonely tired struggling hurt scared nervous'
    );
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('applyNeurotransmitterModifiers', () => {
  const base = { temperature: 0.7, top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0.1 };

  it('serotonergic adds +0.05 to temperature and -0.08 to frequency_penalty', () => {
    const result = applyNeurotransmitterModifiers(base, 'serotonergic');
    expect(result.temperature).toBeCloseTo(0.75, 5);
    // frequency_penalty clamp floor is 0, so 0.1 - 0.08 = 0.02
    expect(result.frequency_penalty).toBeCloseTo(0.02, 5);
    expect(result.presence_penalty).toBeCloseTo(0.15, 5);
  });

  it('dopaminergic decreases temperature and top_p', () => {
    const result = applyNeurotransmitterModifiers(base, 'dopaminergic');
    expect(result.temperature).toBeCloseTo(0.62, 5);
    expect(result.top_p).toBeCloseTo(0.87, 5);
    expect(result.frequency_penalty).toBeCloseTo(0.18, 5);
  });

  it('noradrenergic widens sampling (highest temp)', () => {
    const result = applyNeurotransmitterModifiers(base, 'noradrenergic');
    expect(result.temperature).toBeCloseTo(0.8, 5);
    expect(result.top_p).toBeCloseTo(0.95, 5);
  });

  it('default mode returns base params unchanged (within clamps)', () => {
    const result = applyNeurotransmitterModifiers(base, 'default');
    expect(result.temperature).toBeCloseTo(0.7, 5);
    expect(result.top_p).toBeCloseTo(0.9, 5);
  });

  it('clamps temperature to [0.4, 0.95]', () => {
    const high = { temperature: 0.95, top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0.1 };
    const result = applyNeurotransmitterModifiers(high, 'noradrenergic');
    expect(result.temperature).toBeLessThanOrEqual(0.95);

    const low = { temperature: 0.4, top_p: 0.9, frequency_penalty: 0.1, presence_penalty: 0.1 };
    const result2 = applyNeurotransmitterModifiers(low, 'dopaminergic');
    expect(result2.temperature).toBeGreaterThanOrEqual(0.4);
  });

  it('uses fallback defaults when params are missing', () => {
    const result = applyNeurotransmitterModifiers({}, 'serotonergic');
    expect(result.temperature).toBeDefined();
    expect(result.top_p).toBeDefined();
    expect(result.frequency_penalty).toBeDefined();
    expect(result.presence_penalty).toBeDefined();
  });

  it('unknown mode falls back to default deltas', () => {
    const result = applyNeurotransmitterModifiers(base, 'bogus_mode');
    expect(result.temperature).toBeCloseTo(0.7, 5);
  });
});

describe('buildNeurotransmitterPromptBlock', () => {
  it('returns non-empty string for each real mode', () => {
    expect(buildNeurotransmitterPromptBlock('serotonergic')).toContain('empathetic');
    expect(buildNeurotransmitterPromptBlock('dopaminergic')).toContain('analytical');
    expect(buildNeurotransmitterPromptBlock('noradrenergic')).toContain('creative');
  });

  it('returns empty string for default or unknown', () => {
    expect(buildNeurotransmitterPromptBlock('default')).toBe('');
    expect(buildNeurotransmitterPromptBlock('bogus')).toBe('');
  });
});
