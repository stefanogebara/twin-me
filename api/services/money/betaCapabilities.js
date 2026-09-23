/**
 * What this person may connect, computed from facts, never from who they are.
 * ==========================================================================
 * Live bank connections were an allowlist of user ids in an environment variable, and phone
 * capture rode the same list. A person is not a deployment (the owner, 2026-09-23), so:
 *
 * - The bank is open to a person when the aggregator is configured and any of these holds:
 *   they are already linked (an account of theirs came back from the bank, so the
 *   application returns their accounts), the application is unrestricted and their country
 *   is one it serves, or they are on the owner's list. Enable Banking's production
 *   application runs in restricted mode until the contract and KYB are done, and returns
 *   only the accounts the owner linked; its API does not say which mode it is in, so that
 *   one fact is configuration: ENABLE_BANKING_UNRESTRICTED=true, set by the owner when they
 *   confirm. A stranger connecting a bank in restricted mode would get an empty read, which
 *   is why the gate stays closed for them, and says why.
 * - Phone capture is open to everyone signed in: it needs only their own phone and costs
 *   nothing (decision D23, 2026-09-23).
 * - WhatsApp stays a list: the number is one the product pays for.
 *
 * `why` names the reason the bank is open or closed, so the page can say it in plain words.
 */

import { isConfigured, applicationCountries } from './feeds/enableBanking.js';
import { isMoneyChannelUser } from './channel.js';
import { quietly } from '../quietly.js';

const listed = (userId, value = process.env.MONEY_ADVANCED_BETA_USER_IDS) =>
  Boolean(userId) && String(value || '').split(',').map((id) => id.trim()).filter(Boolean).includes(userId);

export const unrestricted = (value = process.env.ENABLE_BANKING_UNRESTRICTED) => /^(true|1|yes)$/i.test(String(value || '').trim());

/**
 * Pure: the bank capability from the facts. `accounts` are the person's money_accounts rows,
 * `country` their profile country, `countries` the ones the application serves (null when
 * unknown: then any country passes, the bank itself says no later).
 */
export function bankCapability({ userId, accounts = [], country = null, countries = null, configured = isConfigured(), open = unrestricted(), list = process.env.MONEY_ADVANCED_BETA_USER_IDS } = {}) {
  if (!configured) return { bank: false, why: 'unconfigured' };
  if ((accounts || []).some((a) => a.provider === 'enablebanking')) return { bank: true, why: 'linked' };
  if (listed(userId, list)) return { bank: true, why: 'listed' };
  if (!open) return { bank: false, why: 'restricted' };
  if (Array.isArray(countries) && countries.length && country && !countries.includes(String(country).toUpperCase())) return { bank: false, why: 'country' };
  return { bank: true, why: 'open' };
}

/**
 * The person's capabilities. `given` may carry what the caller already read (accounts, the
 * profile); otherwise they are read here. A read that fails leaves the bank closed with
 * `why: 'unread'`, never open by accident.
 */
export async function capabilitiesFor(userId, given = {}) {
  const store = await import('./store.js');
  const [accounts, profile, countries] = await Promise.all([
    given.accounts ?? store.listBankAccounts(userId).catch(quietly('capabilities/accounts', null)),
    given.profile ?? store.personProfileCached(userId).catch(quietly('capabilities/profile', null)),
    isConfigured() ? applicationCountries().catch(quietly('capabilities/countries', null)) : null,
  ]);
  const bank = accounts === null ? { bank: false, why: 'unread' } : bankCapability({ userId, accounts, country: profile?.country || null, countries });
  return { bank: bank.bank, why: bank.why, capture: Boolean(userId), whatsapp: isMoneyChannelUser(userId) };
}
