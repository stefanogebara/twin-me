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
import { listTransactions } from './transactionRepository.js';
import { listFacts } from './factsRepository.js';
import { refreshRecurring, listBankAccounts, reconnectByAccount, listReadings, categorySpend, subscriptionUsage } from './store.js';
import { accountsWithCards } from './instruments.js';
import { moneyCapabilities } from './betaCapabilities.js';
import { inboxAddress, inboxDomain, isInboxConfigured } from './inbox.js';
import { firstOfMonthIn } from './zone.js';
import { seenBy } from './seen.js';
import { quietly } from './quietly.js';

export const PAGE_VIEWS = new Set(['today', 'month', 'you']);
/** The whole ledger, as the page shows it: the client used to page through it 200 at a time. */
const LEDGER_LIMIT = 20000;

/** The bank accounts as the page shows them: each with its cards and its own connection state. */
export async function accountsView(userId) {
  const [accounts, gone] = await Promise.all([listBankAccounts(userId), reconnectByAccount(userId).catch(quietly('page/reconnect-check', () => new Set()))]);
  /* The connection's state travels with the accounts, each with its own: a month that
     stopped moving because one bank ended its session must say which bank, and not send
     the person to reconnect the other. */
  return (await accountsWithCards(userId, accounts)).map((row) => {
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
  /* The day rests on the month's forecast and its segments; read once, handed on. */
  const cast = forecast(userId, now);
  const segments = months(userId, now);
  const reads = {
    forecast: cast,
    months: segments,
    today: Promise.all([cast, segments]).then(([c, s]) => todayAllowance(userId, now, { cast: c, segments: s })),
    ledger: listTransactions(userId, { limit: LEDGER_LIMIT }),
    recurring: refreshRecurring(userId),
    accounts: accountsView(userId),
    readings: listReadings(userId),
    facts: listFacts(userId),
    seen: seenBy(userId),
    categories: categorySpend(userId, { month: firstOfMonthIn(now) }),
    usage: subscriptionUsage(userId),
    capabilities: Promise.resolve(moneyCapabilities(userId)),
    inbox: inboxAddress(userId).then((address) => ({ address, domain: inboxDomain(), receiving: isInboxConfigured() })),
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
