/**
 * Sticking Point — the question you keep asking (2026-06-16)
 * =========================================================
 * A fourth first-party revelation on the "What your twin sees" pull surface.
 * Curiosity Signature names the broad THEME of your searching; this names the
 * single most-REPEATED query — the specific thing you keep coming back to, the
 * friction that won't resolve. Searching the same thing many times is a strong,
 * honest signal of a real sticking point.
 *
 * Reuses the browser-extension search corpus we already gather. A tiny LLM pass
 * voices it AND acts as a privacy gate: it reflects normal work/learning
 * frictions, and returns NONE for anything sensitive (health, money trouble,
 * relationships, private). The user's own data, reflected only to them.
 */
import { gatherWebContent } from './curiositySignature.js';
import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('StickingPoint');

export const MIN_REPEATS = 4; // the same query, this many times, to count as "kept asking"

// ── PURE core ────────────────────────────────────────────────────────────────
/**
 * Find the single most-repeated search query.
 * @param {string[]} rawSearches
 * @returns {{query:string, count:number, distinctSearches:number}|null}
 */
export function topRecurringSearch(rawSearches, { minRepeats = MIN_REPEATS } = {}) {
  const counts = new Map();
  for (const q of rawSearches || []) {
    const k = String(q || '').trim().toLowerCase();
    if (k.length < 4) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (counts.size === 0) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [query, count] = ranked[0];
  if (count < minRepeats) return null;
  return { query, count, distinctSearches: counts.size };
}

/** PURE. The voicing prompt — also the sensitivity gate. */
export function buildStickingPrompt(top) {
  return [
    `Someone searched the same thing ${top.count} times this past month — more than any other search: "${top.query}".`,
    'If this is a normal work, learning, or curiosity thing they keep coming back to, reflect it back in ONE sentence as a gentle noticing about what keeps pulling at them or tripping them up — second person ("you"), present tense, name the actual subject, no preamble, no quotes, no emoji.',
    'If it is at all sensitive (health, money trouble, relationships, legal, or anything private), reply with exactly: NONE.',
  ].join('\n');
}

// ── revelation (I/O) ─────────────────────────────────────────────────────────
export async function computeStickingPointRevelation(userId) {
  const { rawSearches } = await gatherWebContent(userId);
  const top = topRecurringSearch(rawSearches);
  if (!top) {
    log.info('no recurring search clears the floor', { userId });
    return null;
  }
  const r = await complete({
    tier: TIER_EXTRACTION,
    messages: [{ role: 'user', content: buildStickingPrompt(top) }],
    maxTokens: 90,
    temperature: 0.4,
    userId,
    serviceName: 'revelations-sticking-point',
  });
  const body = (r.content || '').trim().replace(/^["']|["']$/g, '');
  if (!body || /^none\.?$/i.test(body)) return null;
  return { kind: 'sticking_point', title: 'The question you keep asking', body, source: 'web' };
}
