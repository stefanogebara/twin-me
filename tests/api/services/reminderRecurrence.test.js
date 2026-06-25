/**
 * Recurring reminders — computeNextOccurrence cadences, createReminder stores a
 * valid recurrence (and ignores an unknown one), and deliverDueReminders
 * advances a recurring reminder to the next occurrence instead of marking it
 * terminally delivered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let dueRows;
const inserts = [];
const updates = [];

vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const b = { _table: table };
    for (const m of ['select', 'eq', 'lte', 'order']) b[m] = () => b;
    b.insert = (payload) => { inserts.push({ table, payload }); b._inserted = payload; return b; };
    b.single = () => Promise.resolve({ data: { id: 'rem-1', remind_at: b._inserted?.remind_at }, error: null });
    b.update = (patch) => { updates.push({ table, patch }); return { eq: () => Promise.resolve({ error: null }) }; };
    b.limit = () => Promise.resolve({ data: dueRows, error: null });
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) } };
});

const deliverInsightMock = vi.fn();
vi.mock('../../../api/services/messageRouter.js', () => ({
  deliverInsight: (...a) => deliverInsightMock(...a),
}));

const { computeNextOccurrence, createReminder, deliverDueReminders } = await import(
  '../../../api/services/reminderService.js'
);

describe('computeNextOccurrence', () => {
  it('daily adds one day', () => {
    expect(computeNextOccurrence(new Date('2026-06-16T12:00:00Z'), 'daily').toISOString())
      .toBe('2026-06-17T12:00:00.000Z');
  });
  it('weekly adds seven days', () => {
    expect(computeNextOccurrence(new Date('2026-06-16T12:00:00Z'), 'weekly').toISOString())
      .toBe('2026-06-23T12:00:00.000Z');
  });
  it('weekdays skips the weekend (Friday → Monday)', () => {
    // 2026-06-19 is a Friday → next weekday is Monday 2026-06-22.
    expect(computeNextOccurrence(new Date('2026-06-19T12:00:00Z'), 'weekdays').toISOString())
      .toBe('2026-06-22T12:00:00.000Z');
  });
  it('weekdays advances one day midweek (Tuesday → Wednesday)', () => {
    expect(computeNextOccurrence(new Date('2026-06-16T12:00:00Z'), 'weekdays').toISOString())
      .toBe('2026-06-17T12:00:00.000Z');
  });
  it('monthly adds one month', () => {
    expect(computeNextOccurrence(new Date('2026-06-16T12:00:00Z'), 'monthly').toISOString())
      .toBe('2026-07-16T12:00:00.000Z');
  });
  it('returns null for one-shot / unknown', () => {
    expect(computeNextOccurrence(new Date('2026-06-16T12:00:00Z'), null)).toBeNull();
    expect(computeNextOccurrence(new Date('2026-06-16T12:00:00Z'), 'hourly')).toBeNull();
  });
});

describe('createReminder recurrence', () => {
  beforeEach(() => { inserts.length = 0; });

  it('stores a valid recurrence', async () => {
    const r = await createReminder('u1', { remindAt: '2026-06-17T09:00:00', timeZone: 'UTC', message: 'report', recurrence: 'weekly' });
    expect(r.success).toBe(true);
    expect(r.recurrence).toBe('weekly');
    expect(inserts[0].payload.recurrence).toBe('weekly');
  });

  it('omits the column for an unknown recurrence (falls back to one-shot)', async () => {
    const r = await createReminder('u1', { remindAt: '2026-06-17T09:00:00', timeZone: 'UTC', message: 'x', recurrence: 'hourly' });
    expect(r.recurrence).toBeNull();
    expect('recurrence' in inserts[0].payload).toBe(false);
  });
});

describe('deliverDueReminders recurring', () => {
  beforeEach(() => { dueRows = null; updates.length = 0; deliverInsightMock.mockReset(); });

  it('advances a recurring reminder to the next occurrence and keeps it pending', async () => {
    dueRows = [{ id: 'r1', user_id: 'u1', message: 'standup', attempts: 0, remind_at: '2026-06-16T12:00:00Z', recurrence: 'daily' }];
    deliverInsightMock.mockResolvedValue({ delivered: 1 });

    const out = await deliverDueReminders();
    expect(out.delivered).toBe(1);

    const patch = updates.find(u => u.patch.remind_at)?.patch;
    expect(patch.remind_at).toBe('2026-06-17T12:00:00.000Z');
    expect(patch.attempts).toBe(0);
    expect(patch.status).toBeUndefined(); // NOT terminally delivered
  });

  it('still marks a one-shot reminder delivered', async () => {
    dueRows = [{ id: 'r1', user_id: 'u1', message: 'x', attempts: 0, remind_at: '2026-06-16T12:00:00Z', recurrence: null }];
    deliverInsightMock.mockResolvedValue({ delivered: 1 });

    await deliverDueReminders();
    expect(updates.some(u => u.patch.status === 'delivered')).toBe(true);
  });
});
