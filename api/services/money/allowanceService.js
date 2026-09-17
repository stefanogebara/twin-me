/** IO orchestration lives outside the pure allowance policy (no store/allowance cycle). */
import { forecast, months, listFacts, listBankAccounts, listTransactions } from './store.js';
import { safeToSpend } from './allowance.js';

export async function todayAllowance(userId, now = new Date()) {
  if (!userId) throw new Error('userId required');
  // A failed evidence read must never be replaced with an empty, reassuring balance.
  const [cast, segments, facts, accounts, transactions] = await Promise.all([
    forecast(userId, now), months(userId, now), listFacts(userId), listBankAccounts(userId),
    listTransactions(userId, { since: new Date(now.getTime() - 8 * 86400000).toISOString(), limit: 5000 }),
  ]);
  return safeToSpend({ cast, segments, facts, accounts, transactions, now });
}
