/**
 * Have I Been Pwned (HIBP) enrichment provider
 * Email -> list of breached services (names + dates only, no passwords)
 * Cost: $3.50/month for API key
 *
 * Returns which platforms the user has accounts on, derived from
 * breach metadata. This is public breach notification data, not leaked content.
 */
import { createLogger } from '../logger.js';

const log = createLogger('HIBPProvider');
const HIBP_API_KEY = process.env.HIBP_API_KEY;

/**
 * Lookup breached services for an email via HIBP v3 API.
 *
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function enrichFromHIBP(email) {
  if (!HIBP_API_KEY) {
    log.debug('HIBP_API_KEY not set — skipping');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          'hibp-api-key': HIBP_API_KEY,
          'user-agent': 'TwinMe-Enrichment/1.0',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    // 404 = no breaches found (normal, not an error)
    if (res.status === 404) {
      return {
        source: 'hibp',
        breachCount: 0,
        breachServices: [],
        breachDetails: [],
      };
    }

    if (res.status === 429) {
      log.warn('HIBP rate limited — retry after 1.5s window');
      return null;
    }

    if (!res.ok) {
      log.warn('HIBP returned non-OK status', { status: res.status });
      return null;
    }

    const breaches = await res.json();

    if (!Array.isArray(breaches)) return null;

    return {
      source: 'hibp',
      breachCount: breaches.length,
      breachServices: breaches.map(b => b.Name),
      breachDetails: breaches.map(b => ({
        name: b.Name,
        domain: b.Domain || null,
        breachDate: b.BreachDate || null,
        dataClasses: b.DataClasses || [],
        isVerified: b.IsVerified ?? true,
      })).slice(0, 30), // cap at 30 most recent
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      log.warn('HIBP timed out');
    } else {
      log.warn('HIBP lookup failed', { error: err.message });
    }
    return null;
  }
}
