/**
 * stripEmoji — server-side mirror of src/utils/stripEmoji.ts
 *
 * audit-2026-05-15 H7: CLAUDE.md is explicit about NO EMOJIS in user-
 * facing content. The audit found "🤑" in a proactive insight stored
 * via this codepath. Generation-side defense complements the display-
 * side defense in src/utils/stripEmoji.ts so legacy rows and external
 * content (emails) AND new LLM output are all clean.
 *
 * Kept in sync with src/utils/stripEmoji.ts. Same regex.
 */

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}]/gu;
const VARIATION_SELECTORS = /[\u{FE00}-\u{FE0F}]/gu;

export function stripEmoji(text) {
  if (!text || typeof text !== 'string') return text ?? '';
  if (!EMOJI_REGEX.test(text)) return text;
  return text
    .replace(EMOJI_REGEX, '')
    .replace(VARIATION_SELECTORS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
