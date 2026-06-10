/**
 * stripEmoji
 * ==========
 * Removes emoji characters from text. CLAUDE.md is explicit: "NO EMOJIS —
 * The user dislikes emojis. Never use them in UI text, twin responses,
 * insight text, or any user-facing content."
 *
 * The 2026-05-15 audit found "🤑" leaking into the chat sidebar from
 * dynamic content (proactive insight or email subject). This utility
 * defends at the display layer for legacy data and external content
 * (email subjects we can't control); for LLM-generated content the
 * generation prompt also instructs no emojis (defense in depth).
 *
 * Uses Unicode property escapes (\p{Extended_Pictographic}) which
 * covers the full emoji range including pictographs, symbols, and
 * regional indicators. ZWJ sequences (👨‍👩‍👧) are stripped piece by piece,
 * and the trailing combiners are stripped too because Extended_Pictographic
 * includes the relevant base characters.
 */

// \p{Extended_Pictographic} covers most emoji base characters.
// \p{Emoji_Modifier} covers skin-tone modifiers (U+1F3FB-1F3FF).
// ‍ is the zero-width joiner used in ZWJ sequences (family, etc.).
// ️ is the emoji-style variation selector.
const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}]/gu;
const VARIATION_SELECTORS = /[\u{FE00}-\u{FE0F}]/gu;

/**
 * Remove all emoji characters and tidy up whitespace.
 * Returns the input unchanged if it has no emojis (fast path).
 */
export function stripEmoji(text: string | null | undefined): string {
  if (!text) return '';
  if (!EMOJI_REGEX.test(text)) return text;
  return text
    .replace(EMOJI_REGEX, '')
    .replace(VARIATION_SELECTORS, '')
    // Collapse double spaces that emojis left behind. Horizontal whitespace
    // only — this now runs on multi-paragraph chat markdown (audit-2026-06-10)
    // where collapsing \n\n would merge paragraphs.
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim();
}
