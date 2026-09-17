/** Statement accounts are local ledger identities, never bank authorisations. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../database.js';

const fields = 'id,provider,name,iban_mask,currency';
const uuid = z.string().uuid();
export class StatementInputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export async function statementAccounts(userId) {
  uuid.parse(userId);
  const { data, error } = await supabaseAdmin.from('money_accounts').select(fields)
    .eq('user_id', userId).in('provider', ['statement', 'enablebanking']).order('created_at').limit(101);
  if (error) throw error;
  if (data.length > 100) throw new StatementInputError('Too many accounts to list. Contact support.', 409);
  return data;
}
export async function createStatementAccount(userId, input) {
  uuid.parse(userId);
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).strict().parse(input);
  // Repeating a creation request cannot create another account and duplicate its imports.
  const identity = createHash('sha256').update(name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')).digest('hex');
  const { data, error } = await supabaseAdmin.from('money_accounts').upsert({
    user_id: userId, provider: 'statement', provider_account_id: identity, name, currency: 'EUR',
  }, { onConflict: 'user_id,provider,provider_account_id' }).select(fields).single();
  if (error) throw error;
  return data;
}
export async function ownedStatementAccount(userId, accountId) {
  uuid.parse(userId);
  if (!uuid.safeParse(accountId).success) throw new StatementInputError('Choose the account this statement belongs to.');
  const { data, error } = await supabaseAdmin.from('money_accounts').select(fields)
    .eq('user_id', userId).eq('id', accountId).in('provider', ['statement', 'enablebanking']).maybeSingle();
  if (error) throw error;
  if (!data) throw new StatementInputError('Choose one of your own accounts.', 404);
  if (data.currency !== 'EUR') throw new StatementInputError('Statement imports currently support euro accounts only.', 422);
  return data;
}

export async function checkStatementEvidence(userId, account, sightings) {
  if (sightings.length > 20000) throw new StatementInputError('That statement has too many rows. Export a shorter period.', 413);
  if (sightings.some((s) => s.currency !== account.currency)) {
    throw new StatementInputError('The statement currency does not match this account.', 422);
  }
  // Older imports had no account. Do not silently count them again or assign them to
  // a guessed account. Only an explicit historical review can repair that ambiguity.
  const aliases = [...new Set(sightings.flatMap((s) => s.legacy_refs || []))];
  for (let at = 0; at < aliases.length; at += 250) {
    const { data, error } = await supabaseAdmin.from('money_sightings').select('account_id')
      .eq('user_id', userId).eq('source', 'statement').in('source_ref', aliases.slice(at, at + 250));
    if (error) throw error;
    if (data.some((s) => !s.account_id)) throw new StatementInputError('Some rows were imported before account selection. Review the earlier import before adding this file.', 409);
  }
}
