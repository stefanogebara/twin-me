/**
 * A payment the person rejected is not where the money went (2026-09-23): a not_me row of
 * 100 EUR stood in Month's categories at its full amount because the query never read the
 * verdict the spending rule checks.
 */
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({
  money_transactions: [
    { id: 't1', amount: -100, merchant_key: 'mauad g', merchant_raw: 'Mauad G.', occurred_at: '2026-09-17T10:48:53Z', channel: 'card', verdict: 'not_me' },
    { id: 't2', amount: -22.47, merchant_key: 'la fruteria', merchant_raw: 'La Fruteria', occurred_at: '2026-09-21T10:00:00Z', channel: 'card', verdict: null },
  ],
}));
vi.mock('../../../../api/services/database.js', () => {
  const chain = (table) => new Proxy({}, {
    get: (_t, key) => {
      if (key === 'then') return (resolve) => Promise.resolve({ data: rows[table] || [], error: null }).then(resolve);
      return () => chain(table);
    },
  });
  return { supabaseAdmin: { from: (table) => chain(table) } };
});
vi.mock('../../../../api/services/money/factsRepository.js', async (importOriginal) => ({ ...(await importOriginal()), listFacts: async () => [], categoriesFor: async () => new Map() }));
import { categorySpend } from '../../../../api/services/money/store.js';

describe('categorySpend', () => {
  it('leaves a rejected payment out of the month and its groups', async () => {
    const out = await categorySpend('00000000-0000-4000-8000-000000000001', { month: '2026-09-01', facts: [] });
    expect(out.total).toBe(22.47);
    const merchants = out.groups.flatMap((g) => g.merchants.map((m) => m.merchant_key));
    expect(merchants).toEqual(['la fruteria']);
  });
});
