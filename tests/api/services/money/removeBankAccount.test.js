import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
let respond = () => ({ data: null, error: null, count: 0 });
function makeChain(table) {
  const entry = { table, ops: [] };
  calls.push(entry);
  const chain = new Proxy({}, { get(_t, prop) {
    if (prop === 'then') { const pr = Promise.resolve(respond(entry)); return pr.then.bind(pr); }
    return (...args) => { entry.ops.push([prop, ...args]); return chain; };
  } });
  return chain;
}
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: (table) => makeChain(table) }, serverDb: {} }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn, info() {}, error() {}, debug() {} }) }));

const { removeBankAccount } = await import('../../../../api/_app/services/money/store.js');
const ACC = '11111111-1111-4111-8111-111111111111';

beforeEach(() => { calls.length = 0; warn.mockClear(); });

describe('removeBankAccount', () => {
  it('deletes the sightings, the transactions and the row, and ends the consent when no other account shares it', async () => {
    respond = (entry) => {
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'maybeSingle')) return { data: { id: ACC, provider: 'enablebanking', session_id: 'sess-1', name: 'Santander', iban_mask: '**** 7516' }, error: null };
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'limit')) return { data: [], error: null };
      if (entry.table === 'money_sightings') return { count: 12, error: null };
      if (entry.table === 'money_transactions') return { count: 9, error: null };
      return { data: null, error: null };
    };
    const ended = [];
    const gone = await removeBankAccount('u1', ACC, { endConsent: async (id) => { ended.push(id); } });
    expect(gone).toEqual({ id: ACC, name: 'Santander', iban_mask: '**** 7516', provider: 'enablebanking', sightings: 12, transactions: 9, consent_ended: true });
    expect(ended).toEqual(['sess-1']);
    const deletes = calls.filter((c) => c.ops.some(([op]) => op === 'delete')).map((c) => c.table);
    expect(deletes).toEqual(['money_sightings', 'money_transactions', 'money_accounts']);
    for (const c of calls.filter((c) => c.ops.some(([op]) => op === 'delete'))) expect(c.ops.some(([op, col, v]) => op === 'eq' && col === 'user_id' && v === 'u1')).toBe(true);
  });
  it('keeps the consent when another account of the person shares the session', async () => {
    respond = (entry) => {
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'maybeSingle')) return { data: { id: ACC, provider: 'enablebanking', session_id: 'sess-1', name: 'A', iban_mask: null }, error: null };
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'limit')) return { data: [{ id: 'other' }], error: null };
      return { count: 0, data: null, error: null };
    };
    const ended = [];
    const gone = await removeBankAccount('u1', ACC, { endConsent: async (id) => { ended.push(id); } });
    expect(gone.consent_ended).toBe(false);
    expect(ended).toEqual([]);
  });
  it('is null for an account that is not theirs, and deletes nothing', async () => {
    respond = () => ({ data: null, error: null });
    expect(await removeBankAccount('u1', ACC)).toBeNull();
    expect(calls.filter((c) => c.ops.some(([op]) => op === 'delete'))).toEqual([]);
  });
  it.each(['error with null data', 'error with empty data', 'null data', 'thrown error'])('retains consent and the local removal result on a sibling lookup with %s', async (failure) => {
    const sensitiveError = { message: 'private session sess-1, account 1234567890', details: 'private bank data' };
    respond = (entry) => {
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'maybeSingle')) return { data: { id: ACC, provider: 'enablebanking', session_id: 'sess-1', name: 'Santander', iban_mask: '**** 7516' }, error: null };
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'limit')) {
        if (failure === 'thrown error') throw new Error(sensitiveError.message);
        return { data: failure === 'error with empty data' ? [] : null, error: failure === 'null data' ? null : sensitiveError };
      }
      if (entry.table === 'money_sightings') return { count: 12, error: null };
      if (entry.table === 'money_transactions') return { count: 9, error: null };
      return { data: null, error: null };
    };
    const endConsent = vi.fn().mockResolvedValue(undefined);
    const gone = await removeBankAccount('u1', ACC, { endConsent });
    expect(endConsent).not.toHaveBeenCalled();
    expect(gone).toEqual({ id: ACC, name: 'Santander', iban_mask: '**** 7516', provider: 'enablebanking', sightings: 12, transactions: 9, consent_ended: false });
    expect(calls.filter((c) => c.ops.some(([op]) => op === 'delete')).map((c) => c.table)).toEqual(['money_sightings', 'money_transactions', 'money_accounts']);
    expect(warn.mock.calls).toEqual([['bank consent retained: shared-account lookup failed']]);
  });
  it('stops at the first table that refuses', async () => {
    respond = (entry) => {
      if (entry.table === 'money_accounts' && entry.ops.some(([op]) => op === 'maybeSingle')) return { data: { id: ACC, provider: 'statement', session_id: null, name: 'S', iban_mask: null }, error: null };
      if (entry.table === 'money_sightings') return { count: null, error: { message: 'locked' } };
      return { data: null, error: null };
    };
    await expect(removeBankAccount('u1', ACC)).rejects.toThrow(/money_sightings not removed: locked/);
    expect(calls.filter((c) => c.table === 'money_transactions')).toEqual([]);
  });
});
