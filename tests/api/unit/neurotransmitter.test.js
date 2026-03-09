/**
 * Neurotransmitter Mode Service — Unit Tests
 * ===========================================
 * Tests for pure functions: detectConversationMode, applyNeurotransmitterModifiers,
 * buildNeurotransmitterPromptBlock.
 *
 * All functions are stateless, no DB/LLM, microsecond execution.
 */

import { describe, it, expect } from 'vitest';
import {
  detectConversationMode,
  applyNeurotransmitterModifiers,
  buildNeurotransmitterPromptBlock,
} from '../../../api/services/neurotransmitterService.js';

// ---------------------------------------------------------------------------
// detectConversationMode
// ---------------------------------------------------------------------------

describe('detectConversationMode', () => {
  it('detects serotonergic mode for emotional messages', () => {
    const result = detectConversationMode("I'm feeling really stressed and overwhelmed lately");
    expect(result.mode).toBe('serotonergic');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.matchedKeywords).toContain('feeling');
    expect(result.matchedKeywords).toContain('stressed');
  });

  it('detects dopaminergic mode for analytical messages', () => {
    const result = detectConversationMode('How can I optimize my schedule and track my productivity goals?');
    expect(result.mode).toBe('dopaminergic');
    expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('detects noradrenergic mode for creative messages', () => {
    const result = detectConversationMode('What if we could brainstorm some creative ideas for a new experiment?');
    expect(result.mode).toBe('noradrenergic');
    expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('returns default for neutral messages', () => {
    const result = detectConversationMode('hey what is up');
    expect(result.mode).toBe('default');
    expect(result.matchedKeywords).toEqual([]);
  });

  it('returns default for single keyword (below threshold)', () => {
    const result = detectConversationMode('I have a goal');
    expect(result.mode).toBe('default');
  });

  it('handles null/empty input gracefully', () => {
    expect(detectConversationMode(null).mode).toBe('default');
    expect(detectConversationMode('').mode).toBe('default');
    expect(detectConversationMode(undefined).mode).toBe('default');
  });

  it('picks strongest mode when multiple signals present', () => {
    // Heavy emotional + one analytical keyword
    const result = detectConversationMode("I'm feeling sad and worried and tired but want to plan something");
    expect(result.mode).toBe('serotonergic'); // 3 emotional vs 1 analytical
  });

  it('detects multi-word keywords like "help me" and "what if"', () => {
    const result1 = detectConversationMode('Can you help me? I am feeling really lonely');
    expect(result1.mode).toBe('serotonergic');

    const result2 = detectConversationMode('What if we try something new and explore a different approach?');
    expect(result2.mode).toBe('noradrenergic');
  });

  it('confidence scales with keyword density', () => {
    const sparse = detectConversationMode('After a really long day at work I have been feeling tired and stressed about my upcoming deadlines and deliverables which are due next week');
    const dense = detectConversationMode('feeling stressed tired worried');
    // Dense should have higher confidence (more keywords per word)
    expect(dense.confidence).toBeGreaterThan(sparse.confidence);
  });
});

// ---------------------------------------------------------------------------
// applyNeurotransmitterModifiers
// ---------------------------------------------------------------------------

describe('applyNeurotransmitterModifiers', () => {
  const baseParams = {
    temperature: 0.7,
    top_p: 0.9,
    frequency_penalty: 0.1,
    presence_penalty: 0.1,
  };

  it('returns unmodified params for default mode', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'default');
    expect(result.temperature).toBe(0.7);
    expect(result.top_p).toBe(0.9);
    expect(result.frequency_penalty).toBe(0.1);
    expect(result.presence_penalty).toBe(0.1);
  });

  it('warms temperature for serotonergic mode', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'serotonergic');
    expect(result.temperature).toBeGreaterThan(baseParams.temperature);
    expect(result.frequency_penalty).toBeLessThan(baseParams.frequency_penalty);
  });

  it('cools temperature for dopaminergic mode', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'dopaminergic');
    expect(result.temperature).toBeLessThan(baseParams.temperature);
    expect(result.frequency_penalty).toBeGreaterThan(baseParams.frequency_penalty);
  });

  it('maximizes creativity for noradrenergic mode', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'noradrenergic');
    expect(result.temperature).toBeGreaterThan(baseParams.temperature);
    expect(result.top_p).toBeGreaterThan(baseParams.top_p);
  });

  it('clamps values within safe bounds', () => {
    // Extreme base + modifier should stay clamped
    const extreme = { temperature: 0.95, top_p: 0.98, frequency_penalty: 0.3, presence_penalty: 0.3 };
    const result = applyNeurotransmitterModifiers(extreme, 'noradrenergic');
    expect(result.temperature).toBeLessThanOrEqual(0.95);
    expect(result.top_p).toBeLessThanOrEqual(0.98);
    expect(result.frequency_penalty).toBeLessThanOrEqual(0.3);
    expect(result.presence_penalty).toBeLessThanOrEqual(0.3);
  });

  it('clamps lower bounds too', () => {
    const low = { temperature: 0.4, top_p: 0.8, frequency_penalty: 0.0, presence_penalty: 0.0 };
    const result = applyNeurotransmitterModifiers(low, 'dopaminergic');
    expect(result.temperature).toBeGreaterThanOrEqual(0.4);
    expect(result.top_p).toBeGreaterThanOrEqual(0.8);
    expect(result.frequency_penalty).toBeGreaterThanOrEqual(0.0);
    expect(result.presence_penalty).toBeGreaterThanOrEqual(0.0);
  });

  it('returns new object (immutability)', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'serotonergic');
    expect(result).not.toBe(baseParams);
    // Original unchanged
    expect(baseParams.temperature).toBe(0.7);
  });

  it('handles null/missing baseParams gracefully', () => {
    const result = applyNeurotransmitterModifiers(null, 'serotonergic');
    expect(result.temperature).toBeGreaterThan(0);
    expect(result).toHaveProperty('top_p');
  });

  it('handles unknown mode as default', () => {
    const result = applyNeurotransmitterModifiers(baseParams, 'unknown_mode');
    expect(result.temperature).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// buildNeurotransmitterPromptBlock
// ---------------------------------------------------------------------------

describe('buildNeurotransmitterPromptBlock', () => {
  it('returns empty string for default mode', () => {
    expect(buildNeurotransmitterPromptBlock('default')).toBe('');
  });

  it('returns empathetic prompt for serotonergic mode', () => {
    const block = buildNeurotransmitterPromptBlock('serotonergic');
    expect(block).toContain('SEROTONERGIC');
    expect(block).toContain('empathetic');
    expect(block.length).toBeGreaterThan(50);
  });

  it('returns analytical prompt for dopaminergic mode', () => {
    const block = buildNeurotransmitterPromptBlock('dopaminergic');
    expect(block).toContain('DOPAMINERGIC');
    expect(block).toContain('precise');
  });

  it('returns creative prompt for noradrenergic mode', () => {
    const block = buildNeurotransmitterPromptBlock('noradrenergic');
    expect(block).toContain('NORADRENERGIC');
    expect(block).toContain('creative');
  });

  it('returns empty string for unknown mode', () => {
    expect(buildNeurotransmitterPromptBlock('unknown')).toBe('');
  });
});
