/**
 * reminderService — listReminders + cancelReminder (manage path).
 * Cancel matches a pending reminder by text (ILIKE) or id; ambiguous matches
 * are returned for disambiguation rather than guessed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let listRows;       // listReminders / select result
let matchRows;      // cancelReminder query ILIKE result
let idReturn;       // cancelReminder by-id maybeSingle result
const updates = [];

vi.mock('../../../api/services/database.js', () => {
  function builder() {
    const b = {};
    for (const m of ['select', 'eq', 'order']) b[m] = () => b;
    b.limit = () => Promise.resolve({ data: listRows, error: null });
    b.ilike = () => Promise.resolve({ data: matchRows, error: null });
    b.update = (patch) => {
      updates.push({ patch });
      const chain = {
        eq: () => chain,
        select: () => chain,
        maybeSingle: () => Promise.resolve({ data: idReturn, error: null }),
      };
      return chain;
    };
    return b;
  }
  return { supabaseAdmin: { from: () => builder() } };
});

const { listReminders, cancelReminder } = await import('../../../api/services/reminderService.js');

beforeEach(() => {
  listRows = null;
  matchRows = null;
  idReturn = null;
  updates.length = 0;
});

describe('listReminders', () => {
  it('returns the pending reminders', async () => {
    listRows = [{ id: 'r1', message: 'pagar o boleto', remind_at: '2026-06-17T12:00:00Z' }];
    const out = await listReminders('u1');
    expect(out.success).toBe(true);
    expect(out.reminders).toHaveLength(1);
    expect(out.reminders[0].message).toBe('pagar o boleto');
  });

  it('returns an empty array (not null) when there are none', async () => {
    listRows = [];
    const out = await listReminders('u1');
    expect(out).toEqual({ success: true, reminders: [] });
  });
});

describe('cancelReminder', () => {
  it('cancels the single reminder matching the text', async () => {
    matchRows = [{ id: 'r1', message: 'pagar o boleto', remind_at: '2026-06-17T12:00:00Z' }];
    const out = await cancelReminder('u1', { query: 'boleto' });
    expect(out.success).toBe(true);
    expect(out.cancelled[0].id).toBe('r1');
    expect(updates.some(u => u.patch.status === 'cancelled')).toBe(true);
  });

  it('returns not_found and does not update when nothing matches', async () => {
    matchRows = [];
    const out = await cancelReminder('u1', { query: 'nope' });
    expect(out.success).toBe(false);
    expect(out.error).toBe('not_found');
    expect(updates).toHaveLength(0);
  });

  it('returns the candidates (ambiguous) without cancelling when >1 matches', async () => {
    matchRows = [
      { id: 'r1', message: 'pagar o boleto da luz', remind_at: '2026-06-17T12:00:00Z' },
      { id: 'r2', message: 'pagar o boleto do cartão', remind_at: '2026-06-18T12:00:00Z' },
    ];
    const out = await cancelReminder('u1', { query: 'boleto' });
    expect(out.success).toBe(false);
    expect(out.error).toBe('ambiguous');
    expect(out.matches).toHaveLength(2);
    expect(updates).toHaveLength(0);
  });

  it('cancels by id when given one', async () => {
    idReturn = { id: 'r9', message: 'ligar pro dentista' };
    const out = await cancelReminder('u1', { id: 'r9' });
    expect(out.success).toBe(true);
    expect(out.cancelled[0].id).toBe('r9');
    expect(updates.some(u => u.patch.status === 'cancelled')).toBe(true);
  });

  it('requires id or query', async () => {
    const out = await cancelReminder('u1', {});
    expect(out.success).toBe(false);
  });
});
