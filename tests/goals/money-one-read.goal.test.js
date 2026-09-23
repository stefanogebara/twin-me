/**
 * Goal: one page, one read of the ledger and one of the facts (audit M2-A, 2026-09-22).
 *
 * Measured against the real ledger before this: seven walks of money_ledger_page and seven
 * reads of money_facts for one Today screen, 37 Supabase calls. After: one, one, 25. This test
 * runs the real page against a database that answers every query with nothing and counts the
 * calls, so a part that starts reading for itself again fails here rather than in the bill.
 */
import { describe, expect, it, vi } from 'vitest';

const counts = vi.hoisted(() => ({ tables: {}, rpcs: {} }));
vi.mock('../../api/services/database.js', () => {
  const answer = { data: [], error: null, count: 0 };
  /* A person with an address already minted; without one the page mints it, which is one read
     and one write more, once in a life. */
  const rows = { money_facts: [{ id: 'f1', user_id: 'u', kind: 'inbox_address', subject: '', value: 'r-abc@in.twinme.me', answered_at: '2026-09-01T00:00:00Z' }] };
  const chain = (table) => new Proxy({}, {
    get: (_t, key) => {
      if (key === 'then') return (resolve, reject) => Promise.resolve({ ...answer, data: rows[table] || [] }).then(resolve, reject);
      if (key === 'maybeSingle' || key === 'single') return () => Promise.resolve({ data: null, error: null });
      return () => chain(table);
    },
  });
  return {
    supabaseAdmin: {
      from: (table) => { counts.tables[table] = (counts.tables[table] || 0) + 1; return chain(table); },
      rpc: (name) => {
        counts.rpcs[name] = (counts.rpcs[name] || 0) + 1;
        /* The scoring snapshot is one object, not rows: nothing scored, nothing dirty. */
        if (name === 'prepare_money_scoring') return Promise.resolve({ data: { figures: [], dirty: false, revision: 0 }, error: null });
        return Promise.resolve(answer);
      },
    },
  };
});
vi.mock('../../api/services/money/betaCapabilities.js', () => ({ capabilitiesFor: async () => ({ bank: true, capture: true }) }));

import { readPage } from '../../api/services/money/pageRead.js';

describe('the money page reads each table once', () => {
  it('walks the ledger once and reads the facts once for Today', async () => {
    const { failed } = await readPage('00000000-0000-4000-8000-000000000001', { view: 'today', now: new Date('2026-09-22T10:00:00Z') });
    expect(failed).toEqual([]);
    expect(counts.rpcs.money_ledger_page, 'money_ledger_page walks').toBe(1);
    expect(counts.tables.money_facts, 'money_facts reads').toBe(1);
  });
});
