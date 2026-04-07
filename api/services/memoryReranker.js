import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('MemoryReranker');

// LRU cache to avoid re-ranking identical query+memory combos
const rerankerCache = new Map();
const MAX_CACHE = 200;

/**
 * Rerank memories using a lightweight LLM pass.
 * Takes top-N candidates, asks LLM to pick the most relevant K.
 *
 * @param {string} query - User's query
 * @param {Array} memories - Candidate memories (already post-MMR)
 * @param {number} topK - How many to keep (default 10)
 * @returns {Array} - Reranked memories, best first
 */
export async function rerankerPass(query, memories, topK = 10) {
  if (!memories || memories.length <= topK) return memories;

  // Cache key: query + sorted memory IDs
  const cacheKey = query.slice(0, 100) + '|' + memories.map(m => m.id).sort().join(',');
  if (rerankerCache.has(cacheKey)) return rerankerCache.get(cacheKey);

  try {
    // Format memories as numbered list (content only, max 120 chars each)
    const numbered = memories.map((m, i) =>
      `[${i}] ${(m.content || '').slice(0, 120)}`
    ).join('\n');

    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: `Given this query, pick the ${topK} most relevant memories by number. Return ONLY a JSON array of indices, e.g. [0,3,5,7].

Query: "${query}"

Memories:
${numbered}

Most relevant ${topK} indices:`,
      }],
      max_tokens: 100,
      temperature: 0.0,
      serviceName: 'memory-reranker',
    });

    // Parse indices from LLM response
    const text = result?.content?.trim() || '';
    const match = text.match(/\[[\d,\s]+\]/);
    if (!match) {
      log.warn('Reranker returned unparseable response', { text: text.slice(0, 200) });
      return memories.slice(0, topK);
    }

    const indices = JSON.parse(match[0])
      .filter(i => Number.isInteger(i) && i >= 0 && i < memories.length);

    if (indices.length === 0) return memories.slice(0, topK);

    // Build reranked list: selected indices first (in LLM order), then remaining
    const selected = indices.map(i => memories[i]);
    const remaining = memories.filter((_, i) => !indices.includes(i));
    const reranked = [...selected, ...remaining].slice(0, topK);

    // Cache
    if (rerankerCache.size >= MAX_CACHE) {
      const firstKey = rerankerCache.keys().next().value;
      rerankerCache.delete(firstKey);
    }
    rerankerCache.set(cacheKey, reranked);

    log.info('Reranker selected', { query: query.slice(0, 50), selected: indices.length, total: memories.length });
    return reranked;
  } catch (err) {
    log.warn('Reranker failed (non-fatal, returning original)', { error: err.message });
    return memories.slice(0, topK);
  }
}
