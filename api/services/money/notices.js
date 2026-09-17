/** Future/unconfirmed evidence stays out of actual spending. Never infer a payment from a bill. */
import crypto from 'node:crypto';
import { supabaseAdmin } from '../database.js';

export const receiptReference = (id) => `email:${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 32)}`;
export function isPaidReceipt(receipt, now = new Date()) {
  return Boolean(receipt && ['receipt', 'invoice'].includes(receipt.kind) && receipt.payment_status === 'paid'
    && (!receipt.date || Date.parse(receipt.date) <= now.getTime() + 86400000));
}
export async function saveReceiptNotice(userId, receipt, { emailId, from = null, subject = null } = {}) {
  if (!userId || !emailId) throw new Error('Notice owner and source id required');
  const { data, error } = await supabaseAdmin.from('money_notices').upsert({
    user_id: userId, source_ref: receiptReference(emailId), kind: receipt.kind,
    merchant: receipt.merchant || null, amount: receipt.amount, currency: receipt.currency,
    due_at: receipt.next_charge_at || receipt.date || null,
    evidence: { ...receipt, from, subject },
  }, { onConflict: 'user_id,source_ref' }).select('id').single();
  if (error) throw new Error(`Cannot save receipt notice: ${error.message}`);
  return data;
}
export async function listReceiptNotices(userId) {
  if (!userId) throw new Error('userId required');
  const { data, error } = await supabaseAdmin.from('money_notices').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(`Cannot read receipt notices: ${error.message}`);
  return data || [];
}
