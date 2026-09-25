/** One status read before the evidence, one after it. Callers share the read through
 * `given.reconciliationRead`; inner services must not start independent snapshots. */
import { getReconciliationStatus } from './reconciliationService.js';
import { financialEvidenceBlocked } from './financialCompleteness.js';

export const unavailableReconciliation = () => ({ state: 'unavailable', unresolvedCount: null, bySource: {}, oldestOccurredAt: null, newestOccurredAt: null, checkedAt: new Date().toISOString(), revision: null, financialRevision: null });
async function read(userId) {
  try {
    const result = await getReconciliationStatus(userId);
    if (!result || !['clear', 'pending', 'unavailable'].includes(result.state)
      || (result.state !== 'unavailable' && result.revision == null)) return unavailableReconciliation();
    return result;
  } catch { return unavailableReconciliation(); }
}
export async function beginReconciliationRead(userId, given = {}) {
  if (given.reconciliationRead) return given.reconciliationRead;
  return { initial: await read(userId), owner: userId };
}
export async function finishReconciliationRead(session) {
  if (financialEvidenceBlocked(session?.initial)) return session?.initial || unavailableReconciliation();
  const latest = await read(session.owner);
  if (financialEvidenceBlocked(latest)) return latest;
  return String(latest.revision) === String(session.initial.revision)
    && String(latest.financialRevision) === String(session.initial.financialRevision) ? latest : unavailableReconciliation();
}
