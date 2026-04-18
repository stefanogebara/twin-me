import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: 'SUMMARY_OF_OLD_CONTEXT' }),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  condenseIfNeeded,
  estimateTokens,
  estimateMessagesTokens,
} from '../../../api/services/contextCondenser.js';

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars (ceil)', () => {
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('x'.repeat(40))).toBe(10);
    expect(estimateTokens('x'.repeat(41))).toBe(11);
  });

  it('handles empty / null input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
});

describe('estimateMessagesTokens', () => {
  it('sums tokens across messages', () => {
    const messages = [
      { role: 'user', content: 'x'.repeat(40) }, // 10 tokens
      { role: 'assistant', content: 'y'.repeat(80) }, // 20 tokens
    ];
    expect(estimateMessagesTokens(messages)).toBe(30);
  });

  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe('condenseIfNeeded', () => {
  it('returns messages unchanged when under recentTurnsToKeep', async () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = await condenseIfNeeded(messages, { recentTurnsToKeep: 8 });
    expect(result).toBe(messages);
  });

  it('returns messages unchanged when total tokens under threshold', async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'short msg',
    }));
    // 20 messages * ~3 tokens = ~60 tokens, well under 12k threshold
    const result = await condenseIfNeeded(messages);
    expect(result).toBe(messages);
  });

  it('condenses when total tokens exceed threshold', async () => {
    // Create 20 large messages (each ~1000 chars = 250 tokens), total 5000 tokens
    const big = 'x'.repeat(1000);
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: big,
    }));
    const result = await condenseIfNeeded(messages, {
      thresholdTokens: 500, // force condensation
      recentTurnsToKeep: 4,
    });

    // Condensed array: 1 system summary + 4 recent messages
    expect(result.length).toBe(5);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('CONVERSATION SUMMARY');
    expect(result[0].content).toContain('SUMMARY_OF_OLD_CONTEXT');
  });

  it('preserves recent messages verbatim after condensation', async () => {
    const big = 'x'.repeat(1000);
    const recentMarker = 'RECENT_VERBATIM_MARKER';
    const messages = [
      ...Array.from({ length: 10 }, () => ({ role: 'user', content: big })),
      { role: 'assistant', content: recentMarker },
    ];
    const result = await condenseIfNeeded(messages, {
      thresholdTokens: 500,
      recentTurnsToKeep: 1,
    });
    // Last message preserved verbatim
    const last = result[result.length - 1];
    expect(last.content).toBe(recentMarker);
  });
});
