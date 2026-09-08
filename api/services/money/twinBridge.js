/**
 * The bridge from money to the twin.
 * ==================================
 * The twin already reads a memory stream: observations, facts, reflections, each with
 * an importance and an embedding, retrieved by relevance and recency (see CLAUDE.md,
 * "Twin Architecture"). Money was outside it, so the twin knew a person's music and
 * not the fact that five charges take 114 € from them every month.
 *
 * This file writes what the analyst found into that stream as facts, one per finding,
 * carrying the receipts in metadata so a claim in chat can still be shown. It is the
 * whole of the AI integration for money: no new store, no second brain, and no model
 * inventing a number — the sentences are computed, and the twin retrieves them like
 * anything else it knows.
 *
 * Cost: importance is passed in, never rated by a model (`skipImportance`), so a
 * refresh costs one embedding per changed finding and no completion at all.
 */

import { addMemory } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('money-twin-bridge');

/**
 * How much each kind of finding matters to knowing a person. A charge that comes back
 * every month says more about a life than a single large purchase, and a rhythm says
 * more than a total.
 */
export const IMPORTANCE = {
  subscriptions: 8,
  weekday_shape: 8,
  dormant_charge: 7,
  month_pace: 6,
  small_payments: 6,
  new_merchant: 5,
  biggest_line: 5,
};

/**
 * One finding as a sentence the twin can retrieve, with the money words spelled out
 * so a search for "spending" or "subscription" reaches it. Pure, exported for tests.
 */
export function memoryFor(finding) {
  if (!finding?.sentence) return null;
  const detail = finding.detail ? ` ${finding.detail}` : '';
  const receipts = (finding.receipts || [])
    .map((r) => `${r.merchant_raw || r.merchant_key}`)
    .filter(Boolean)
    .slice(0, 4);
  const where = receipts.length ? ` The payments behind it: ${receipts.join(', ')}.` : '';
  return {
    content: `Money: ${finding.sentence}${detail}${where}`,
    memoryType: 'fact',
    importance: IMPORTANCE[finding.kind] ?? 5,
    metadata: {
      source: 'money',
      domain: 'money',
      finding_kind: finding.kind,
      month: finding.month || null,
      numbers: finding.numbers || {},
      receipt_ids: (finding.receipts || []).map((r) => r.id).filter(Boolean),
      evidence_count: finding.evidence_count || 0,
    },
  };
}

/**
 * Write the findings the twin does not already hold. `addMemory` skips a duplicate of
 * the same content within a day, so a refresh that changes nothing writes nothing, and
 * a sentence whose numbers moved is written as the new fact it is.
 */
export async function tellTwin(userId, findings = []) {
  if (!userId || !findings.length) return { written: 0 };
  let written = 0;
  for (const finding of findings) {
    const memory = memoryFor(finding);
    if (!memory) continue;
    try {
      const row = await addMemory(userId, memory.content, memory.memoryType, memory.metadata, {
        skipImportance: true,
        importanceScore: memory.importance,
      });
      if (row) written += 1;
    } catch (error) {
      log.warn(`money memory failed (${finding.kind})`, { error: error.message });
    }
  }
  return { written };
}
