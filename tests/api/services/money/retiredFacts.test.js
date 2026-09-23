import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
let factRow;
vi.mock('../../../../api/_app/services/database.js', () => {
  function builder(table) {
    const b = { _table: table, _op: 'select' };
    for (const m of ['select', 'eq', 'order', 'limit', 'is', 'in', 'gte']) b[m] = () => b;
    b.insert = (row) => { calls.push({ table, op: 'insert', row }); return Promise.resolve({ error: null }); };
    b.delete = () => { b._op = 'delete'; calls.push({ table, op: 'delete' }); return b; };
    b.maybeSingle = () => Promise.resolve({ data: table === 'money_facts' ? factRow : null, error: null });
    b.then = (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) }, serverDb: {} };
});
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }) }));
import { deleteFact } from '../../../../api/_app/services/money/store.js';

beforeEach(() => { calls.length = 0; });

describe('forgetting a fact', () => {
  it('copies the whole row to the retired table before it goes', async () => {
    factRow = { id: 'f1', user_id: 'u1', kind: 'person', subject: 'maria', value: 'landlord', question_id: 'person_out:maria', answered_at: '2026-09-10T10:00:00Z' };
    const r = await deleteFact('u1', 'f1', { reason: 'forget' });
    expect(r).toEqual({ deleted: true });
    const retired = calls.find((c) => c.table === 'money_facts_retired' && c.op === 'insert');
    expect(retired.row).toMatchObject({ user_id: 'u1', reason: 'forget', fact: factRow });
    const order = calls.map((c) => `${c.table}:${c.op}`);
    expect(order.indexOf('money_facts_retired:insert')).toBeLessThan(order.indexOf('money_facts:delete'));
  });
  it('leaves internal rows alone, and retires nothing', async () => {
    factRow = { id: 'f2', user_id: 'u1', kind: 'inbox_address', question_id: null };
    expect(await deleteFact('u1', 'f2')).toEqual({ deleted: false });
    expect(calls.find((c) => c.table === 'money_facts_retired')).toBeUndefined();
  });
});
