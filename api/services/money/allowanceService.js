/** IO orchestration lives outside the pure allowance policy (no store/allowance cycle). */
import { forecast, months } from './forecastService.js';
import { listReturnsClosing } from './returns.js';
import { quietly } from './quietly.js';
import { listFacts } from './factsRepository.js';
import { listBankAccounts } from './store.js';
import { listTransactions } from './transactionRepository.js';
import { safeToSpend } from './allowance.js';

/**
 * @param {{ cast?: object, segments?: object[] }} given a forecast and month segments already
 *   read by the caller (the page reads them once for the month and the day both).
 */
export async function todayAllowance(userId, now = new Date(), given = {}) {
  if (!userId) throw new Error('userId required');
  // A failed evidence read must never be replaced with an empty, reassuring balance.
  const [cast, segments, facts, accounts, transactions] = await Promise.all([
    given.cast ?? forecast(userId, now), given.segments ?? months(userId, now), listFacts(userId), listBankAccounts(userId),
    listTransactions(userId, { since: new Date(now.getTime() - 8 * 86400000).toISOString(), limit: 5000 }),
  ]);
  const day = safeToSpend({ cast, segments, facts, accounts, transactions, now });
  /* The return windows closing this week, one quiet line on Today; a failed read is no line, never a wrong one. */
  const returns = await listReturnsClosing(userId, now).catch(quietly('today/returns', () => []));
  return { ...day, returns_closing: returns };
}
