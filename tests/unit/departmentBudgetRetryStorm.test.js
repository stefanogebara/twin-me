/**
 * A failed default-budget insert must not retry on every request.
 *
 * Prod incident 2026-08-24: department_budgets in prod predates the
 * budget_month/updated_at columns, so the default-budget upsert failed with
 * "Could not find the 'budget_month' column of 'department_budgets'" — and
 * because the failure path returned without caching, every warmup retried the
 * insert for every department: 6 errors per request, forever. The failure
 * fallback must be cached (same short TTL as a successful read) so a broken
 * schema degrades to one attempt per TTL window instead of one per request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertCalls = [];
let selectResult;
let upsertResult;

function makeChain(table) {
  const ctx = { op: 'select' };
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const result = ctx.op === 'upsert' ? upsertResult : selectResult;
          const promise = Promise.resolve(result);
          return promise.then.bind(promise);
        }
        return (...args) => {
          if (prop === 'upsert') {
            ctx.op = 'upsert';
            upsertCalls.push({ table, record: args[0] });
          }
          return chain;
        };
      },
    }
  );
  return chain;
}

vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeChain(table) },
}));

// Deterministic in-memory cache standing in for redisClient.
const cacheStore = new Map();
vi.mock('../../api/services/redisClient.js', () => ({
  get: vi.fn(async (key) => (cacheStore.has(key) ? cacheStore.get(key) : null)),
  set: vi.fn(async (key, value) => { cacheStore.set(key, value); }),
  del: vi.fn(async (key) => { cacheStore.delete(key); }),
}));

const { getDepartmentBudget } = await import('../../api/services/departmentBudgetService.js');

describe('getDepartmentBudget insert-failure caching', () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    cacheStore.clear();
    selectResult = {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    };
    upsertResult = {
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'budget_month' column of 'department_budgets' in the schema cache" },
    };
  });

  it('returns the default record when the insert fails', async () => {
    const budget = await getDepartmentBudget('user-1', 'research');
    expect(budget).toMatchObject({
      user_id: 'user-1',
      department: 'research',
      spent_this_month_usd: 0,
    });
    expect(budget.monthly_budget_usd).toBeGreaterThan(0);
  });

  it('does not retry the failed insert on the next request within the TTL', async () => {
    await getDepartmentBudget('user-1', 'research');
    expect(upsertCalls).toHaveLength(1);

    const second = await getDepartmentBudget('user-1', 'research');
    expect(upsertCalls).toHaveLength(1);
    expect(second).toMatchObject({ user_id: 'user-1', department: 'research' });
  });

  it('still caches successful inserts', async () => {
    upsertResult = {
      data: {
        user_id: 'user-1',
        department: 'research',
        monthly_budget_usd: 0.1,
        spent_this_month_usd: 0,
        budget_month: '2026-08',
      },
      error: null,
    };

    const budget = await getDepartmentBudget('user-1', 'research');
    expect(budget.budget_month).toBe('2026-08');

    await getDepartmentBudget('user-1', 'research');
    expect(upsertCalls).toHaveLength(1);
  });
});
