/**
 * Web Search Service
 * ==================
 * Thin wrapper around Brave Search with a 24h in-memory cache.
 * Used by both the `web_search` chat tool and the Meeting Prep Engine.
 */

import { braveWebSearch } from './enrichment/braveSearchProvider.js';
import { createLogger } from './logger.js';

const log = createLogger('WebSearchService');

const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY;

// Simple in-memory cache: queryHash -> { results, expiresAt }
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(query) {
  return query.trim().toLowerCase();
}

function fromCache(query) {
  const entry = cache.get(cacheKey(query));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(query));
    return null;
  }
  return entry.results;
}

function toCache(query, results) {
  cache.set(cacheKey(query), { results, expiresAt: Date.now() + CACHE_TTL_MS });
  // Prune cache if it grows too large
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/**
 * Search the web using Brave Search.
 * Returns array of { title, url, description }.
 * Results are cached for 24 hours to avoid redundant API spend.
 */
export async function webSearch(query, { count = 5 } = {}) {
  if (!BRAVE_KEY) {
    log.warn('BRAVE_SEARCH_API_KEY not set — web_search unavailable');
    return { success: false, error: 'Web search not configured' };
  }

  const cached = fromCache(query);
  if (cached) {
    log.debug('web_search cache hit', { query: query.substring(0, 60) });
    return { success: true, results: cached.slice(0, count), cached: true };
  }

  try {
    const raw = await braveWebSearch(query, BRAVE_KEY);
    if (!raw) return { success: false, error: 'No results' };

    const results = raw.slice(0, count).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description || r.extra_snippets?.[0] || '',
    }));

    toCache(query, results);
    log.debug('web_search completed', { query: query.substring(0, 60), count: results.length });
    return { success: true, results };
  } catch (err) {
    log.error('web_search error', { query, error: err.message });
    return { success: false, error: err.message };
  }
}
