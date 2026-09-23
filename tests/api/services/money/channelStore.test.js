import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: (table) => makeChain(table) } }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));

const { offerSaid } = await import('../../../../api/_app/services/money/channelStore.js');

describe('offerSaid', () => {
  beforeEach(() => { calls.length = 0; });

  it('scopes the update to the offer and the person it belongs to', async () => {
    await offerSaid('u1', 'offer-1', 'Glovo is marked as not yours.');
    const entry = calls.find((c) => c.table === 'money_channel_offers');
    expect(entry.ops).toContainEqual(['update', { said: 'Glovo is marked as not yours.' }]);
    expect(entry.ops).toContainEqual(['eq', 'id', 'offer-1']);
    expect(entry.ops).toContainEqual(['eq', 'user_id', 'u1']);
  });
});
