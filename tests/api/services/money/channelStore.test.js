/**
 * morningRecipients() decides who gets the morning line. It must ask for the same three things
 * every other reader of messaging_channels asks for before treating a row as deliverable --
 * messageRouter.js and presenceStore.js both filter on is_enabled -- plus the beta allowlist and
 * this feature's own mute flag. A query that silently drops is_enabled would, the day a pause
 * toggle exists, message someone who turned the channel off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** One entry per supabaseAdmin.from(table): the table and every builder call, in order. */
const calls = [];
/** Canned response for an awaited chain; each test sets what it needs. */
let respond = () => ({ data: [], error: null });

function makeChain(table) {
  const entry = { table, ops: [] };
  calls.push(entry);
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const promise = Promise.resolve(respond(entry));
          return promise.then.bind(promise);
        }
        return (...args) => { entry.ops.push([prop, ...args]); return chain; };
      },
    },
  );
  return chain;
}

vi.mock('../../../../api/services/database.js', () => ({ supabaseAdmin: { from: (table) => makeChain(table) } }));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));

const { morningRecipients } = await import('../../../../api/services/money/channelStore.js');

describe('morningRecipients', () => {
  beforeEach(() => {
    calls.length = 0;
    respond = () => ({ data: [], error: null });
    process.env.MONEY_WHATSAPP_USER_IDS = 'u1,u2';
  });
  afterEach(() => { delete process.env.MONEY_WHATSAPP_USER_IDS; });

  it('asks for enabled whatsapp channels of the beta users, not just linked ones', async () => {
    await morningRecipients();
    const entry = calls.find((c) => c.table === 'messaging_channels');
    expect(entry.ops).toContainEqual(['eq', 'is_enabled', true]);
    expect(entry.ops).toContainEqual(['eq', 'channel', 'whatsapp']);
    expect(entry.ops).toContainEqual(['in', 'user_id', ['u1', 'u2']]);
  });

  it('keeps a linked, unmuted number and drops one muted for the morning line', async () => {
    respond = () => ({
      data: [
        { user_id: 'u1', channel_id: '+34600000000', preferences: {} },
        { user_id: 'u2', channel_id: '+34600000001', preferences: { money_morning_muted: true } },
      ],
      error: null,
    });
    const result = await morningRecipients();
    expect(result).toEqual([{ userId: 'u1', phone: '+34600000000' }]);
  });

  it('asks the database nothing when no beta user is configured', async () => {
    delete process.env.MONEY_WHATSAPP_USER_IDS;
    const result = await morningRecipients();
    expect(result).toEqual([]);
    expect(calls).toEqual([]);
  });
});
