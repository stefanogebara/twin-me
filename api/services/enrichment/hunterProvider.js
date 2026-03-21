/**
 * Hunter.io Provider — company + role from email domain.
 * FREE tier: 25 verifications/month. Gated to non-free-provider domains.
 */

import { createLogger } from '../logger.js';

const log = createLogger('HunterProvider');
const TIMEOUT_MS = 4000;

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'tutanota.com', 'zoho.com',
  'mail.com', 'gmx.com', 'gmx.de', 'yandex.com', 'yandex.ru',
  'fastmail.com', 'hey.com', 'pm.me',
]);

export async function lookupHunter(email) {
  if (!email) return null;

  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  // Gate: skip free email providers to conserve quota
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || FREE_PROVIDERS.has(domain)) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 429) log.warn('Hunter.io rate limited');
      return null;
    }

    const json = await res.json();
    const d = json?.data;
    if (!d) return null;

    const result = {
      verified: d.status === 'valid',
      company: d.company || null,
      position: d.position || null,
      seniority: d.seniority || null,
      department: d.department || null,
      firstName: d.first_name || null,
      lastName: d.last_name || null,
      twitterHandle: d.twitter || null,
      linkedInUrl: d.linkedin_url || null,
      domain,
    };

    log.info('Hunter found', {
      domain,
      company: result.company,
      position: result.position,
    });

    return result;
  } catch (err) {
    if (err.name !== 'AbortError') log.warn('Hunter lookup failed', { error: err.message });
    return null;
  }
}
