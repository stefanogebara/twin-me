/**
 * The page in one read.
 *
 * Today, Month and You each needed nine requests and every one of them paid the auth
 * middleware and its own connection; a browser holds six to a host, so the page painted
 * in rounds (audit M2-3, measured 2026-09-19: 30 requests, 16 s cold on a local build).
 * This reads everything the three views share once, in parallel, under one
 * authentication, and says which parts could not be read instead of dropping them: a
 * month that could not be read is not an empty month.
 */
import { forecast, months } from './forecastService.js';
import { todayAllowance } from './allowanceService.js';
import { listTransactions, selectTransactions } from './transactionRepository.js';
import { listFacts, publicFacts } from './factsRepository.js';
import { personProfileCached, refreshRecurring, listBankAccounts, reconnectByAccount, listReadings, categorySpend, subscriptionUsage } from './store.js';
import { accountsWithCards } from './instruments.js';
import { capabilitiesFor } from './betaCapabilities.js';
import { inboxAddress, inboxDomain, isInboxConfigured } from './inbox.js';
import { firstOfMonthIn } from './zone.js';
import { seenBy, sourceCounts } from './seen.js';
import { quietly } from './quietly.js';

export const PAGE_VIEWS = new Set(['today', 'month', 'you']);
/** The whole ledger, as the page shows it: the client used to page through it 200 at a time. */
const LEDGER_LIMIT = 20000;

/** The bank accounts as the page shows them: each with its cards and its own connection state. */
/** @param {{ facts?: object[], transactions?: object[] }} given the page's one read of each, handed to the card grouping (M2-A). */
export async function accountsView(userId, given = {}) {
  const [accounts, gone] = await Promise.all([listBankAccounts(userId), reconnectByAccount(userId).catch(quietly('page/reconnect-check', () => new Set()))]);
  /* The connection's state travels with the accounts, each with its own: a month that
     stopped moving because one bank ended its session must say which bank, and not send
     the person to reconnect the other. */
  return (await accountsWithCards(userId, accounts, given)).map((row) => {
    const a = { ...row, needs_reconnect: gone.has(row.id) };
    delete a.session_id; delete a.created_at;
    return a;
  });
}

/**
 * @returns {{ data: Record<string, unknown>, failed: string[] }} every part by name, null
 *   where it could not be read, and the names of those.
 */
export async function readPage(userId, { view = 'today', now = new Date() } = {}) {
  if (!userId) throw new Error('userId required');
  if (!PAGE_VIEWS.has(view)) throw new Error(`Unknown view: ${view}`);
  /* The ledger and the facts are read once each and handed to every part; before this the
     page read money_facts six times and walked the ledger five times for one screen (M2-A,
     2026-09-22). The day rests on the month's forecast and its segments, also read once. */
  const facts = listFacts(userId, { includeInternal: true });
  const ledger = listTransactions(userId, { limit: LEDGER_LIMIT, includeRejected: true });
  const given = Promise.all([facts, ledger]).then(([f, t]) => ({ facts: f, transactions: t }));
  const cast = given.then((g) => forecast(userId, now, g));
  const segments = given.then((g) => months(userId, now, g));
  const reads = {
    forecast: cast,
    months: segments,
    today: Promise.all([given, cast, segments]).then(([g, c, s]) => todayAllowance(userId, now, { ...g, cast: c, segments: s })),
    ledger: ledger.then((rows) => selectTransactions(rows, { limit: LEDGER_LIMIT })),
    recurring: given.then((g) => refreshRecurring(userId, now, g)),
    accounts: given.then((g) => accountsView(userId, g)),
    readings: listReadings(userId),
    facts: facts.then(publicFacts),
    seen: seenBy(userId),
    sources: sourceCounts(userId, { now }),
    categories: facts.then((f) => categorySpend(userId, { month: firstOfMonthIn(now), facts: f })),
    usage: given.then((g) => subscriptionUsage(userId, now, g)),
    capabilities: capabilitiesFor(userId),
    /* Where the person is, for the page's own day reads: their zone, country, currency, language. */
    profile: personProfileCached(userId).then((p) => ({ timezone: p.timezone, country: p.country, currency: p.currency, language: p.language })),
    inbox: facts.then((f) => inboxAddress(userId, { facts: f })).then((address) => ({ address, domain: inboxDomain(), receiving: isInboxConfigured() })),
  };
  const names = Object.keys(reads);
  const settled = await Promise.allSettled(names.map((n) => reads[n]));
  const data = {}; const failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') data[names[i]] = r.value;
    else { data[names[i]] = null; failed.push(names[i]); }
  });
  return { data, failed };
}
