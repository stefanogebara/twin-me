/**
 * LZ76 Complexity — Measures linguistic diversity of text.
 * ========================================================
 * Normalized Lempel-Ziv complexity (0-1):
 * - Low (< 0.3) = repetitive, formulaic responses
 * - Medium (0.3-0.5) = normal conversation
 * - High (> 0.5) = diverse, creative language
 *
 * Used to detect when the twin becomes repetitive and needs a creativity boost.
 */

/**
 * Compute normalized LZ76 complexity of a string.
 * Based on Lempel & Ziv (1976) — counts the number of distinct substrings.
 *
 * @param {string} text - Input text
 * @returns {number} Normalized complexity 0.0-1.0
 */
export function lzComplexity(text) {
  if (!text || text.length < 10) return 0.5; // Default for very short text

  // Normalize: lowercase, collapse whitespace
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const n = s.length;

  if (n === 0) return 0;

  let complexity = 1; // Start with 1 for the first character
  let i = 1;
  let k = 1;

  while (i + k <= n) {
    // Check if substring s[i..i+k-1] appears in s[0..i+k-2]
    const substring = s.substring(i, i + k);
    const searchIn = s.substring(0, i + k - 1);

    if (searchIn.includes(substring)) {
      k++;
      if (i + k > n) {
        complexity++;
      }
    } else {
      complexity++;
      i += k;
      k = 1;
    }
  }

  // Normalize: use n / log2(n) as theoretical max for random strings,
  // but scale by alphabet-aware factor for natural language.
  // Natural language (26 chars + space + punctuation ≈ 30 symbols) sits between
  // random binary and random Unicode. Empirically calibrated so:
  // - Highly repetitive text → 0.2-0.3
  // - Normal conversation → 0.35-0.55
  // - Diverse creative text → 0.5-0.65
  const b = Math.min(n, 30); // effective alphabet size (capped)
  const maxComplexity = n / Math.log2(Math.max(2, n)) * Math.log2(b);
  return Math.min(1.0, complexity / maxComplexity);
}
