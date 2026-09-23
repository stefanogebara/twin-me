/**
 * The person this request or this cron turn is about.
 * ====================================================
 * Their zone and their currency used to be one value per deployment, read by a hundred call
 * sites. Threading them through every signature would have touched every module for no
 * reader's benefit, so the entry points set the person once (the money router's middleware
 * per request, a cron's per-person loop, the WhatsApp inbound per message) and the helpers
 * in zone.js and currency.js read them here when given nothing. Outside any scope the
 * deployment's values stand, so a script or a test that sets nobody reads as before.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const PERSON = new AsyncLocalStorage();

/** Run fn with this profile (profile.js shape: timezone, currency, country, language) as the person. */
export function withPerson(profile, fn) {
  return PERSON.run(profile && typeof profile === 'object' ? profile : {}, fn);
}

/** The person set for this scope, or null outside any. */
export function currentPerson() { return PERSON.getStore() || null; }
