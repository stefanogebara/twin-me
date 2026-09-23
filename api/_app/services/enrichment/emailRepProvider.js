/**
 * emailrep.io enrichment provider
 * Email -> reputation, age, breach services, social profiles
 * Free tier: no key needed for basic lookups (rate limited)
 * With key: higher rate limits
 */
import { createLogger } from '../logger.js';

const log = createLogger('EmailRepProvider');
const EMAILREP_API_KEY = process.env.EMAILREP_API_KEY;

/**
 * Lookup email reputation and breach history from emailrep.io.
 *
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function enrichFromEmailRep(email) {
  try {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'TwinMe-Enrichment/1.0',
    };
    if (EMAILREP_API_KEY) {
      headers['Key'] = EMAILREP_API_KEY;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 429) {
        log.warn('emailrep.io rate limited');
        return null;
      }
      return null;
    }

    const data = await res.json();

    const breachServices = [];
    if (data.details?.credentials_leaked) {
      // emailrep doesn't always list specific services in free tier,
      // but the breach boolean + profiles are still valuable
      if (data.details?.data_breach) breachServices.push('data_breach');
    }

    const profiles = data.details?.profiles || [];

    return {
      source: 'emailrep',
      reputation: data.reputation || null,
      suspicious: data.suspicious || false,
      deliverable: data.details?.deliverable ?? null,
      emailAge: data.details?.days_since_domain_creation || null,
      firstSeen: data.details?.first_seen || null,
      lastSeen: data.details?.last_seen || null,
      credentialsLeaked: data.details?.credentials_leaked || false,
      breachCount: data.details?.data_breach ? 1 : 0,
      profiles,
      domainReputation: data.details?.domain_reputation || null,
      freeProvider: data.details?.free_provider ?? null,
      spamActivity: data.details?.spam || false,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      log.warn('emailrep.io timed out');
    } else {
      log.warn('emailrep.io lookup failed', { error: err.message });
    }
    return null;
  }
}
