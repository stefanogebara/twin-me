/**
 * reminderService — local↔UTC conversion, createReminder insert shape, and the
 * deliverDueReminders cron path (deliver via messageRouter, mark delivered, or
 * count attempts / fail after the cap).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let dueRows;            // what the due-pending select returns
const inserts = [];
const updates = [];

vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const b = { _table: table };
    for (const m of ['select', 'eq', 'lte', 'order']) b[m] = () => b;
    b.insert = (payload) => { inserts.push({ table, payload }); b._inserted = payload; return b; };
    b.single = () => Promise.resolve({ data: { id: 'rem-1', remind_at: b._inserted?.remind_at }, error: null });
    b.update = (patch) => { const u = { table, patch }; updates.push(u); return { eq: () => Promise.resolve({ error: null }) }; };
    b.limit = () => Promise.resolve({ data: dueRows, error: null });
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) } };
});

const deliverInsightMock = vi.fn();
vi.mock('../../../api/services/messageRouter.js', () => ({
  deliverInsight: (...a) => deliverInsightMock(...a),
}));

const { zonedLocalToUtc, createReminder, deliverDueReminders } = await import(
  '../../../api/services/reminderService.js'
);

describe('zonedLocalToUtc', () => {
  it('interprets a no-Z local time in the given IANA zone (SP = UTC-3)', () => {
    const d = zonedLocalToUtc('2026-06-17T09:00:00', 'America/Sao_Paulo');
    expect(d.toISOString()).toBe('2026-06-17T12:00:00.000Z'); // 09:00 SP = 12:00 UTC
  });
  it('passes through an absolute ISO with Z unchanged', () => {
    expect(zonedLocalToUtc('2026-06-17T12:00:00Z', 'America/Sao_Paulo').toISOString())
      .toBe('2026-06-17T12:00:00.000Z');
  });
  it('handles UTC zone as identity', () => {
    expect(zonedLocalToUtc('2026-06-17T09:00:00', 'UTC').toISOString())
      .toBe('2026-06-17T09:00:00.000Z');
  });
});

describe('createReminder', () => {
  beforeEach(() => { inserts.length = 0; });

  it('stores the message + UTC-converted remind_at and returns the id', async () => {
    const r = await createReminder('u1', {
      remindAt: '2026-06-17T09:00:00', timeZone: 'America/Sao_Paulo', message: 'pagar o boleto', source: 'twin',
    });
    expect(r.success).toBe(true);
    expect(r.id).toBe('rem-1');
    const row = inserts.find(i => i.table === 'reminders').payload;
    expect(row.user_id).toBe('u1');
    expect(row.message).toBe('pagar o boleto');
    expect(row.remind_at).toBe('2026-06-17T12:00:00.000Z');
  });

  it('rejects missing fields without inserting', async () => {
    const r = await createReminder('u1', { remindAt: '', message: '' });
    expect(r.success).toBe(false);
    expect(inserts.length).toBe(0);
  });
});

describe('deliverDueReminders', () => {
  beforeEach(() => {
    dueRows = null;
    updates.length = 0;
    deliverInsightMock.mockReset();
  });

  it('delivers a due reminder and marks it delivered', async () => {
    dueRows = [{ id: 'r1', user_id: 'u1', message: 'ligar pro dentista', attempts: 0 }];
    deliverInsightMock.mockResolvedValue({ delivered: 1, channels: [{ channel: 'whatsapp', success: true }] });

    const out = await deliverDueReminders();

    expect(out.delivered).toBe(1);
    expect(deliverInsightMock).toHaveBeenCalledWith('u1', expect.objectContaining({ category: 'reminder', insight: 'ligar pro dentista' }));
    expect(updates.some(u => u.patch.status === 'delivered')).toBe(true);
  });

  it('counts an attempt (not delivered) when no channel succeeds', async () => {
    dueRows = [{ id: 'r1', user_id: 'u1', message: 'x', attempts: 1 }];
    deliverInsightMock.mockResolvedValue({ delivered: 0, channels: [] });

    const out = await deliverDueReminders();

    expect(out.delivered).toBe(0);
    expect(updates.some(u => u.patch.attempts === 2 && !u.patch.status)).toBe(true);
  });

  it('marks failed after the attempt cap', async () => {
    dueRows = [{ id: 'r1', user_id: 'u1', message: 'x', attempts: 4 }];
    deliverInsightMock.mockResolvedValue({ delivered: 0 });

    await deliverDueReminders();
    expect(updates.some(u => u.patch.status === 'failed' && u.patch.attempts === 5)).toBe(true);
  });

  it('is a no-op when nothing is due', async () => {
    dueRows = [];
    const out = await deliverDueReminders();
    expect(out).toEqual({ delivered: 0, scanned: 0 });
    expect(deliverInsightMock).not.toHaveBeenCalled();
  });
});
