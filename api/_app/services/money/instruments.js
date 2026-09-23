import { z } from 'zod';
import { supabaseAdmin } from '../database.js';
import { listTransactions, selectTransactions } from './transactionRepository.js';

const kind = 'card_type';
const choice = z.enum(['credit', 'debit', 'unknown']);
/** A suffix is scoped to its account. Payment direction never tells us card funding type. */
export function groupCards(accounts, transactions, facts = []) {
  return accounts.map((account) => {
    const rows = transactions.filter((t) => t.account_id === account.id && t.channel === 'card');
    const suffixes = [...new Set(rows.map((t) => t.card_last4).filter((s) => /^\d{4}$/.test(s || '')))];
    return { ...account, cards: suffixes.sort().map((last4) => {
      const fact = facts.find((f) => f.kind === kind && f.subject === `${account.id}:${last4}`);
      const type = choice.safeParse(fact?.value);
      return { last4, type: type.success ? type.data : 'unknown', source: fact ? 'user' : null };
    }), unidentified_card_payments: rows.filter((t) => !/^\d{4}$/.test(t.card_last4 || '')).length };
  });
}

/** @param {{ facts?: object[], transactions?: object[] }} given every fact and the whole ledger, when the caller already read them (M2-A). */
export async function accountsWithCards(userId, accounts, given = {}) {
  if (!accounts.length) return [];
  if (given.facts && given.transactions) {
    return groupCards(accounts, selectTransactions(given.transactions, { includeRejected: true }), given.facts.filter((f) => f.kind === kind));
  }
  const [transactions, facts] = await Promise.all([
    listTransactions(userId, { includeRejected: true }),
    supabaseAdmin.from('money_facts').select('kind,subject,value').eq('user_id', userId).eq('kind', kind),
  ]);
  if (facts.error) throw new Error('Could not read card labels');
  return groupCards(accounts, transactions, facts.data || []);
}

export async function labelCard(userId, accountId, last4, type) {
  const input = z.object({ accountId: z.string().uuid(), last4: z.string().regex(/^\d{4}$/), type: choice }).safeParse({ accountId, last4, type });
  if (!input.success) throw Object.assign(new Error('Choose credit, debit or unknown for a card shown on this account.'), { status: 400 });
  // A caller cannot invent a card or borrow another owner's account, even with a known UUID.
  const [account, payment] = await Promise.all([
    supabaseAdmin.from('money_accounts').select('id').eq('user_id', userId).eq('id', accountId).maybeSingle(),
    supabaseAdmin.from('money_transactions').select('id').eq('user_id', userId).eq('account_id', accountId).eq('channel', 'card').eq('card_last4', last4).limit(1),
  ]);
  if (account.error || payment.error) throw new Error('Could not check the card');
  if (!account.data || !payment.data?.length) throw Object.assign(new Error('That card was not found on your account.'), { status: 404 });
  const { error } = await supabaseAdmin.from('money_facts').upsert({
    user_id: userId, kind, subject: `${accountId}:${last4}`, value: type,
    source: 'asked', answered_at: new Date().toISOString(),
  }, { onConflict: 'user_id,kind,subject' });
  if (error) throw new Error('Could not save the card label');
  return { last4, type, source: 'user' };
}
