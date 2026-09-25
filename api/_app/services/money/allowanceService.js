import { beginReconciliationRead, finishReconciliationRead } from './reconciliationRead.js';
import { financialEvidenceBlocked, withheldForecast } from './financialCompleteness.js';
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
  const reconciliationRead = await beginReconciliationRead(userId, given);
  if (financialEvidenceBlocked(reconciliationRead.initial)) return { ...safeToSpend({ cast: withheldForecast(reconciliationRead.initial, now), now }), returns_closing: [] };
  const shared = { ...given, reconciliationRead };
  const since = new Date(now.getTime() - 8 * 86400000).toISOString();
  // A failed evidence read must never be replaced with an empty, reassuring balance.
  const [cast, segments, facts, accounts, transactions] = await Promise.all([
    given.cast ?? forecast(userId, now, shared), given.segments ?? months(userId, now, given),
    given.facts ? publicFacts(given.facts) : listFacts(userId), listBankAccounts(userId),
    given.transactions ? selectTransactions(given.transactions, { since, limit: 5000 }) : listTransactions(userId, { since, limit: 5000 }),
  ]);
  const day = safeToSpend({ cast, segments, facts, accounts, transactions, now });
  /* The return windows closing this week, one quiet line on Today; a failed read is no line, never a wrong one. */
  const returns = await listReturnsClosing(userId, now).catch(quietly('today/returns', () => []));
  const reconciliation = given.reconciliationRead ? reconciliationRead.initial : await finishReconciliationRead(reconciliationRead);
  if (financialEvidenceBlocked(reconciliation)) return { ...safeToSpend({ cast: withheldForecast(reconciliation, now), now }), returns_closing: returns };
  return { ...day, reconciliation, returns_closing: returns };
}
