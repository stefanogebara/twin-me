/**
 * WhatsMyName (WMN) Username Cascade Provider
 * Given a username, checks 600+ platforms for account existence.
 * Uses batched HTTP requests with strict timeout controls.
 *
 * This runs as a SECOND PASS after initial lookups return a username
 * (from GitHub, Reddit, or email prefix).
 */
import { createLogger } from '../logger.js';
import { getWMNSites } from './wmnDataLoader.js';
import { isUsernameCascadeable } from './usernameFilter.js';

const log = createLogger('WMNProvider');

const BATCH_SIZE = 50;
const PER_REQUEST_TIMEOUT_MS = 2000;
const OVERALL_TIMEOUT_MS = 8000;

/**
 * Check a single WMN site for username existence.
 *
 * @param {Object} site - WMN site definition
 * @param {string} username
 * @returns {Promise<{name: string, url: string, cat: string}|null>}
 */
async function checkSite(site, username, signal) {
  const url = site.uri_check.replace('{account}', encodeURIComponent(username));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

    // Abort if parent signal fires
    if (signal?.aborted) return null;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TwinMe/1.0)',
        ...(site.headers || {}),
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);

    // Check status code matches "exists" code
    if (res.status !== site.e_code) return null;

    // Check response body contains the "exists" string pattern
    if (site.e_string) {
      const body = await res.text();
      if (!body.includes(site.e_string)) return null;
    }

    // Confirmed match
    const profileUrl = site.uri_pretty
      ? site.uri_pretty.replace('{account}', username)
      : url;

    return {
      name: site.name,
      url: profileUrl,
      cat: site.cat || 'misc',
    };
  } catch {
    return null;
  }
}

/**
 * Cascade a username across WMN platforms in batches.
 *
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
export async function lookupWhatsMyName(username) {
  if (!isUsernameCascadeable(username)) {
    log.debug(`Username "${username}" not cascadeable — skipping WMN`);
    return null;
  }

  const sites = await getWMNSites();
  if (sites.length === 0) {
    log.warn('No WMN sites loaded');
    return null;
  }

  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), OVERALL_TIMEOUT_MS);

  const confirmed = [];
  let totalChecked = 0;

  try {
    // Process in batches to avoid connection exhaustion on Vercel
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      if (overallController.signal.aborted) break;

      const batch = sites.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(site => checkSite(site, username, overallController.signal)),
      );

      totalChecked += batch.length;

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          confirmed.push(result.value);
        }
      }
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  if (confirmed.length === 0) {
    log.info(`WMN: 0 matches for "${username}" (checked ${totalChecked})`);
    return null;
  }

  log.info(`WMN: ${confirmed.length} matches for "${username}" (checked ${totalChecked})`);

  return {
    source: 'whatsmyname',
    username,
    confirmedPlatforms: confirmed,
    totalChecked,
    totalFound: confirmed.length,
  };
}
