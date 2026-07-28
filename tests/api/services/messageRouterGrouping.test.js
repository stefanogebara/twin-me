/**
 * groupPendingByUser — the in-memory grouping that replaced the per-user N+1 in
 * deliverPendingInsights. A single batched query now fetches pending insights
 * for all eligible users (oldest-first); this groups them by user and caps each
 * user to N per run, preserving the prior anti-spam behavior.
 */
import { describe, it, expect } from 'vitest';

// Stub Supabase env so importing messageRouter (which transitively constructs a
// Supabase client at module load) doesn't throw in the bare test environment.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_ANON_KEY = 'stub-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role';

const { groupPendingByUser } = await import('../../../api/services/messageRouter.js');

describe('groupPendingByUser', () => {
  it('groups rows by user_id, preserving input (oldest-first) order', () => {
    const rows = [
      { id: 1, user_id: 'a' },
      { id: 2, user_id: 'b' },
      { id: 3, user_id: 'a' },
    ];
    const m = groupPendingByUser(rows);
    expect(m.get('a').map((r) => r.id)).toEqual([1, 3]);
    expect(m.get('b').map((r) => r.id)).toEqual([2]);
    expect(m.size).toBe(2);
  });

  it('caps at 5 per user by default and keeps the oldest 5', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: i, user_id: 'a' }));
    const m = groupPendingByUser(rows);
    expect(m.get('a')).toHaveLength(5);
    expect(m.get('a').map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('respects a custom per-user cap', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ id: i, user_id: 'a' }));
    expect(groupPendingByUser(rows, 2).get('a')).toHaveLength(2);
  });

  it('iterates users in order of their first (oldest) pending insight', () => {
    const rows = [
      { id: 1, user_id: 'b' }, // b's oldest comes first globally
      { id: 2, user_id: 'a' },
      { id: 3, user_id: 'b' },
    ];
    expect([...groupPendingByUser(rows).keys()]).toEqual(['b', 'a']);
  });

  it('handles null/empty input', () => {
    expect(groupPendingByUser(null).size).toBe(0);
    expect(groupPendingByUser([]).size).toBe(0);
  });
});
