/**
 * GOAL: the twin never sends emojis (top user preference, CLAUDE.md).
 * ====================================================================
 * Shipped: QW2 (anti-emoji rule restored on the WhatsApp twin) + audit
 * 2026-05-15 H7 (server-side stripEmoji as the delivery backstop).
 *
 * The prompt-level rule can drift with any prompt refactor; this pins the
 * BACKSTOP: api/utils/stripEmoji.js must keep removing pictographic emoji
 * from outbound text while leaving normal text (including accents and
 * punctuation the twin legitimately uses) untouched.
 *
 * Emoji are written as unicode escapes on purpose — no literal emoji in the
 * repo, per the same rule this goal protects.
 */
import { describe, it, expect } from 'vitest';
import { stripEmoji } from '../../api/utils/stripEmoji.js';

describe('goal: no emoji reaches the user', () => {
  it('strips pictographic emoji from twin output', () => {
    const withEmoji = `Great progress today \u{1F680} keep it up \u{1F4AA}`;
    const stripped = stripEmoji(withEmoji);
    expect(stripped).not.toMatch(/[\p{Extended_Pictographic}]/u);
    expect(stripped).toContain('Great progress today');
    expect(stripped).toContain('keep it up');
  });

  it('strips variation selectors and ZWJ sequences (composed emoji)', () => {
    const family = `done \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}`; // man+zwj+woman+zwj+girl
    expect(stripEmoji(family)).not.toMatch(/[\p{Extended_Pictographic}\u{200D}\u{FE0F}]/u);
  });

  it('leaves normal text, accents, and punctuation untouched', () => {
    const text = 'Bom dia, Stefano - reuniao as 15h30. "Sim" ou "pula"?';
    expect(stripEmoji(text)).toBe(text);
  });
});
