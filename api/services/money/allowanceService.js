/** IO orchestration lives outside the pure allowance policy (no store/allowance cycle). */
import { forecast, months } from './forecastService.js';
import { listReturnsClosing } from './returns.js';
import { quietly } from './quietly.js';
import { listFacts, publicFacts } from './factsRepository.js';
import { listBankAccounts } from './store.js';
import { listTransactions, selectTransactions } from './transactionRepository.js';
import { safeToSpend } from './allowance.js';

/**
 * @param {{ cast?: object, segments?: object[], facts?: object[], transactions?: object[] }} given
 *   what the caller already read: a forecast and month segments (the page reads them once for
 *   the month and the day both), every fact with the internal ones, and the ledger with its
 *   rejected rows (M2-A, 2026-09-22).
 */
export async function todayAllowance(userId, now = new Date(), given = {}) {
  if (!userId) throw new Error('userId required');
  const since = new Date(now.getTime() - 8 * 86400000).toISOString();
  // A failed evidence read must never be replaced with an empty, reassuring balance.
  const [cast, segments, facts, accounts, transactions] = await Promise.all([
    given.cast ?? forecast(userId, now, given), given.segments ?? months(userId, now, given),
    given.facts ? publicFacts(given.facts) : listFacts(userId), listBankAccounts(userId),
    given.transactions ? selectTransactions(given.transactions, { since, limit: 5000 }) : listTransactions(userId, { since, limit: 5000 }),
  ]);
  const day = safeToSpend({ cast, segments, facts, accounts, transactions, now });
  /* The return windows closing this week, one quiet line on Today; a failed read is no line, never a wrong one. */
  const returns = await listReturnsClosing(userId, now).catch(quietly('today/returns', () => []));
  return { ...day, returns_closing: returns };
}
