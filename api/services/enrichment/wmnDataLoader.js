/**
 * WhatsMyName Data Loader
 * Fetches and caches the wmn-data.json database from GitHub.
 * Contains URL templates + verification patterns for 600+ platforms.
 * Cached in-memory with 24h TTL (data changes infrequently).
 */
import { createLogger } from '../logger.js';

const log = createLogger('WMNDataLoader');

const WMN_URL = 'https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Categories worth checking for TwinMe (skip niche/dead platforms)
const RELEVANT_CATEGORIES = new Set([
  'social', 'music', 'gaming', 'tech', 'coding', 'video',
  'art', 'news', 'finance', 'health', 'shopping', 'misc',
  'entertainment', 'business', 'dating', 'photo', 'travel',
]);

// Skip sites with known anti-bot protection (high false negative rate)
const SKIP_PROTECTION = new Set(['cloudflare', 'akamai', 'captcha']);

let cachedSites = null;
let cacheTimestamp = 0;

/**
 * Fetch and return filtered WMN site definitions.
 * Returns sites that are reliable for automated checking.
 *
 * @returns {Promise<Array<{name: string, uri_check: string, e_code: number, e_string: string, m_code: number, m_string: string, cat: string, uri_pretty?: string}>>}
 */
export async function getWMNSites() {
  const now = Date.now();

  if (cachedSites && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSites;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(WMN_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      log.warn('Failed to fetch WMN data', { status: res.status });
      return cachedSites || [];
    }

    const json = await res.json();
    const allSites = json.sites || [];

    // Filter to reliable, relevant sites
    const filtered = allSites.filter(site => {
      // Must have check URL with {account} placeholder
      if (!site.uri_check || !site.uri_check.includes('{account}')) return false;

      // Must have verification signals (status code + string match)
      if (!site.e_code || !site.e_string) return false;

      // Skip sites with heavy bot protection
      if (site.protection && SKIP_PROTECTION.has(site.protection.toLowerCase())) return false;

      // Skip POST-only sites (complex to check)
      if (site.post_body) return false;

      return true;
    });

    cachedSites = filtered;
    cacheTimestamp = now;

    log.info(`WMN data loaded: ${filtered.length}/${allSites.length} sites (filtered)`);
    return filtered;
  } catch (err) {
    if (err.name === 'AbortError') {
      log.warn('WMN data fetch timed out');
    } else {
      log.warn('WMN data fetch failed', { error: err.message });
    }
    return cachedSites || [];
  }
}
