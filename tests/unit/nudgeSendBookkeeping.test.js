/**
 * A nudge that didn't send must not be recorded as sent.
 *
 * Follow-up to the 2026-08-24 magic-link outage: senders that swallow Resend's
 * { data, error } contract don't just lose one email — they poison the
 * bookkeeping around it. sendNudgeEmails stamps users.platform_nudge_sent_at
 * immediately after the send, and that column is a permanent
 * "already nudged, never nudge again" flag. If the send silently failed, the
 * user is burned forever.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendPlatformNudge = vi.fn();
const updates = [];

/**
 * Chainable Supabase stub: every builder method returns the chain, and
 * awaiting the chain resolves the canned result for that table + operation.
 */
function makeChain(table) {
  const ctx = { table, op: 'select', payload: null };
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const result = resolveFor(ctx);
          const promise = Promise.resolve(result);
          return promise.then.bind(promise);
        }
        return (...args) => {
          if (prop === 'update') {
            ctx.op = 'update';
            ctx.payload = args[0];
          }
          if (prop === 'eq' && ctx.op === 'update') {
            updates.push({ table: ctx.table, payload: ctx.payload, id: args[1] });
          }
          return chain;
        };
      },
    }
  );
  return chain;
}

function resolveFor(ctx) {
  if (ctx.table === 'users' && ctx.op === 'update') return { data: null, error: null };
  if (ctx.table === 'users') {
    return {
      data: [{ id: 'user-1', email: 'user@example.com', first_name: 'Stefano', created_at: '2026-08-01' }],
      error: null,
    };
  }
  // No platform connections, no conversations — user is nudge-eligible.
  return { data: [], error: null };
}

vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeChain(table) },
}));

vi.mock('../../api/services/emailService.js', () => ({
  sendPlatformNudge: (...args) => sendPlatformNudge(...args),
}));

const { sendNudgeEmails } = await import('../../api/services/nudgeService.js');

describe('sendNudgeEmails bookkeeping', () => {
  beforeEach(() => {
    updates.length = 0;
    sendPlatformNudge.mockReset();
  });

  it('marks the user as nudged when the email actually sent', async () => {
    sendPlatformNudge.mockResolvedValue(true);

    const result = await sendNudgeEmails();

    expect(result).toMatchObject({ sent: 1, errors: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toHaveProperty('platform_nudge_sent_at');
  });

  it('does NOT mark the user as nudged when the send failed', async () => {
    sendPlatformNudge.mockResolvedValue(false);

    const result = await sendNudgeEmails();

    expect(updates).toEqual([]);
    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('does NOT mark the user as nudged when the send throws', async () => {
    sendPlatformNudge.mockRejectedValue(new Error('fetch failed'));

    const result = await sendNudgeEmails();

    expect(updates).toEqual([]);
    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
  });
});
