import { z } from 'zod';
import { supabaseAdmin } from '../database.js';

const date = z.string().datetime({ offset: true });
const cursorShape = z.object({ at: date, id: z.string().uuid() });
export async function transactionPage(userId, { since, cursor, limit = 200, currency = null } = {}) {
  z.string().uuid().parse(userId);
  const size = z.number().int().min(1).max(500).parse(limit);
  if (since) date.parse(since);
  const before = cursor ? cursorShape.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) : null;
  const { data, error } = await supabaseAdmin.rpc('money_ledger_page', {
    p_user_id: userId, p_since: since || null, p_before_time: before?.at || null,
    p_before_id: before?.id || null, p_limit: size + 1, p_currency: currency,
  });
  if (error) throw new Error(`Cannot read the ledger: ${error.message}`);
  const rows = (data || []).slice(0,size);
  const last = rows.at(-1);
  return { data: rows, next_cursor: data?.length > size && last
    ? Buffer.from(JSON.stringify({ at: new Date(last.occurred_at).toISOString(), id: last.id })).toString('base64url') : null };
}

/** Complete evidence for calculations. Fail explicitly if the safety bound is exceeded. */
export async function listTransactions(userId, { since, limit = 10000, currency = null, includeRejected = false } = {}) {
  const all = []; let cursor = null;
  do {
    const page = await transactionPage(userId, { since, cursor, limit: Math.min(500,limit-all.length), currency });
    all.push(...page.data); cursor = page.next_cursor;
    if (cursor && all.length >= limit) throw new Error('The ledger is larger than this analysis window. Choose a shorter date range.');
  } while (cursor);
  return includeRejected ? all : all.filter((row) => row.verdict !== 'not_me');
}
export const listEuroTransactions = (userId, options = {}) => listTransactions(userId, { ...options, currency: 'EUR' });

/**
 * Every person who has a ledger at all: bank feed, statement, phone or receipts. A cron that
 * writes the day down and scores it is about the ledger, not the bank, so it must not be
 * gated on who has a bank job to claim (2026-09-19). One page of ids, distinct.
 */
export async function moneyUserIds({ limit = 500 } = {}) {
  const { data, error } = await supabaseAdmin.from('money_transactions').select('user_id').limit(20000);
  if (error) throw new Error(`Cannot list money users: ${error.message}`);
  return [...new Set((data || []).map((r) => r.user_id).filter(Boolean))].slice(0, limit);
}
