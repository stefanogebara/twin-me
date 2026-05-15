import { describe, it, expect } from 'vitest';
import { stripEmoji } from '../../src/utils/stripEmoji';

describe('stripEmoji', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(stripEmoji(null)).toBe('');
    expect(stripEmoji(undefined)).toBe('');
    expect(stripEmoji('')).toBe('');
  });

  it('passes through emoji-free text unchanged (fast path)', () => {
    expect(stripEmoji('hello world')).toBe('hello world');
    expect(stripEmoji('Important meeting at 3pm')).toBe('Important meeting at 3pm');
  });

  it('strips the audit-found money-mouth emoji from email subject', () => {
    expect(stripEmoji('Top Sellers: now with PROMO 🤑')).toBe('Top Sellers: now with PROMO');
  });

  it('strips multiple emojis in one string', () => {
    expect(stripEmoji('🎉 Party tonight! 🍻')).toBe('Party tonight!');
  });

  it('handles emojis with variation selectors', () => {
    // Heart with variation selector (red heart)
    expect(stripEmoji('I love coding ❤️ so much')).toBe('I love coding so much');
  });

  it('strips ZWJ family sequences', () => {
    expect(stripEmoji('My family 👨‍👩‍👧 is great')).toBe('My family is great');
  });

  it('strips emoji between words and collapses extra whitespace', () => {
    expect(stripEmoji('hello 😀 world')).toBe('hello world');
  });

  it('strips skin-tone modifiers', () => {
    expect(stripEmoji('thumbs up 👍🏽 cool')).toBe('thumbs up cool');
  });

  it('preserves whitespace structure when only trailing emoji', () => {
    expect(stripEmoji('Great job! 🎉')).toBe('Great job!');
  });

  it('does not touch markdown or punctuation', () => {
    expect(stripEmoji('**bold** and _italic_ — em-dash')).toBe('**bold** and _italic_ — em-dash');
  });
});
