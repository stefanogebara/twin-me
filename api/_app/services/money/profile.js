/**
 * Where a person is, read from what the ledger holds about them.
 * ==============================================================
 * Country, currency, timezone and language were one value per deployment: Spain, the euro,
 * Madrid, written into the place lookup, the home lookup, the merchant judge and the bank
 * list. The product is for students in Spain, but a person is not a deployment (the owner,
 * 2026-09-23: "it should be specific for each user and each account").
 *
 * The person's own data already says where they are: an IBAN begins with its country, an
 * account carries its currency, the user row holds the timezone and the language they chose.
 * This module reads those and falls back to the deployment's values only when a person has
 * nothing connected yet. Pure, apart from `personProfile` in store.js which loads the rows.
 *
 * Stage one (2026-09-23) threads country and language into the lookups, the judge and the
 * bank routes. Timezone (zone.js, ~100 call sites) and currency (currency.js) still hold one
 * value per deployment; the tracker dates their threading.
 */

import { LEDGER_CCY } from './currency.js';
import { LEDGER_TZ } from './zone.js';

/** The deployment's country when a person has no account yet (ISO 3166-1 alpha-2). */
export const DEFAULT_COUNTRY = String(process.env.MONEY_COUNTRY || 'ES').toUpperCase();

const TZ_BY_COUNTRY = Object.freeze({
  ES: 'Europe/Madrid', PT: 'Europe/Lisbon', FR: 'Europe/Paris', DE: 'Europe/Berlin', IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', AT: 'Europe/Vienna', IE: 'Europe/Dublin', GB: 'Europe/London',
  US: 'America/New_York', BR: 'America/Sao_Paulo', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires',
});
const PLACES_LANGUAGE_BY_COUNTRY = Object.freeze({
  ES: 'es', MX: 'es', AR: 'es', PT: 'pt', BR: 'pt', FR: 'fr', DE: 'de', AT: 'de', IT: 'it', NL: 'nl', BE: 'nl', US: 'en', GB: 'en', IE: 'en',
});
const NAME_BY_COUNTRY = Object.freeze({
  ES: 'Spain', PT: 'Portugal', FR: 'France', DE: 'Germany', IT: 'Italy', NL: 'the Netherlands', BE: 'Belgium', AT: 'Austria',
  IE: 'Ireland', GB: 'the United Kingdom', US: 'the United States', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina',
});

/** The country an IBAN (or a masked IBAN) begins with, or null. */
export function countryOfIban(iban) {
  const m = String(iban || '').trim().toUpperCase().match(/^([A-Z]{2})/);
  return m ? m[1] : null;
}

const majority = (values) => {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (!best || n > best.n) best = { v, n };
  return best ? best.v : null;
};

/**
 * The profile, from the user row and the person's accounts. Every field says where it came
 * from, so a screen or a log can tell a read value from a fallback.
 */
export function profileFrom({ user = null, accounts = [] } = {}) {
  const rows = Array.isArray(accounts) ? accounts : [];
  const fromIbans = majority(rows.map((a) => countryOfIban(a.iban_mask || a.iban)));
  const country = fromIbans || DEFAULT_COUNTRY;
  const fromAccounts = majority(rows.map((a) => String(a.currency || '').toUpperCase()));
  const currency = fromAccounts || LEDGER_CCY;
  const timezone = user?.timezone || TZ_BY_COUNTRY[country] || LEDGER_TZ;
  return {
    country,
    countryName: NAME_BY_COUNTRY[country] || country,
    currency,
    timezone,
    language: user?.preferred_language || null,
    placesLanguage: PLACES_LANGUAGE_BY_COUNTRY[country] || 'en',
    source: {
      country: fromIbans ? 'accounts' : 'default',
      currency: fromAccounts ? 'accounts' : 'default',
      timezone: user?.timezone ? 'user' : (TZ_BY_COUNTRY[country] ? 'country' : 'default'),
      language: user?.preferred_language ? 'user' : 'none',
    },
  };
}
