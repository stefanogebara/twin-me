/** Ambiguity is an explicit completeness state, never inferred from orphaned old rows. */
import { z } from 'zod';
import { supabaseAdmin } from '../database.js';
import { maskEvidenceCards } from './evidencePrivacy.js';

const uuid = z.string().uuid();
const unavailable = () => ({ state: 'unavailable', unresolvedCount: null, bySource: {}, oldestOccurredAt: null, newestOccurredAt: null, checkedAt: new Date().toISOString(), revision: null, financialRevision: null });
export async function getReconciliationStatus(userId) {
  uuid.parse(userId);
  try {
    const { data, error } = await supabaseAdmin.rpc('money_reconciliation_status', { p_user_id: userId });
    if (error || !data || !['clear','pending'].includes(data.state) || !Number.isSafeInteger(data.revision) || !Number.isSafeInteger(data.unresolvedCount) || !Number.isSafeInteger(data.financialRevision)) return unavailable();
    return data;
  } catch { return unavailable(); }
}
function failure(error) {
  const status = ['PT409', '40001'].includes(error.code) ? 409 : error.code === 'P0002' ? 404 : 503;
  return Object.assign(new Error(status === 409 ? 'Payment evidence changed. Refresh this review.' : status === 404 ? 'Payment review is no longer available.' : 'Payment review is temporarily unavailable.'), { status });
}
export async function listReconciliationReview(userId, { offset = 0, limit = 20 } = {}) {
  uuid.parse(userId);
  z.number().int().min(0).max(20000).parse(offset); z.number().int().min(1).max(50).parse(limit);
  const { data, error } = await supabaseAdmin.rpc('money_reconciliation_review', { p_user_id: userId, p_offset: offset, p_limit: limit });
  if (error || !data) throw failure(error || {});
  const label = (text) => maskEvidenceCards(text).replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, 'Account').replace(/\b(?:\d[ -]?){12,18}\d\b/g, 'Card');
  const clean = (row) => ({ ...row, merchant: label(row.merchant || 'Unknown payment'), ...(row.accountLabel ? { accountLabel: label(row.accountLabel) } : {}) });
  return { ...data, items: data.items.map((item) => ({ ...clean(item), candidates: item.candidates.map(clean) })) };
}
export async function resolveReconciliation(userId, sightingId, body) {
  uuid.parse(userId); uuid.parse(sightingId);
  const input = z.object({ revision: z.number().int().nonnegative(), action: z.enum(['match','separate']), transactionId: uuid.optional() }).strict().parse(body);
  if ((input.action === 'match') !== Boolean(input.transactionId)) throw Object.assign(new Error('Choose a payment or confirm a separate payment.'), { status: 400 });
  const { data, error } = await supabaseAdmin.rpc('resolve_money_reconciliation', {
    p_user_id: userId, p_sighting_id: sightingId, p_revision: input.revision,
    p_action: input.action, p_transaction_id: input.transactionId || null,
  });
  if (error) throw failure(error);
  return data;
}
