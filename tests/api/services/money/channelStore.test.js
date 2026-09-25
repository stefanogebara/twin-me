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

const { offerSaid, claimInbound, takeOffer, offersOfMessage, recentOffers } = await import('../../../../api/_app/services/money/channelStore.js');

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


describe('channel approval boundaries', () => {
  beforeEach(() => { calls.length = 0; respond = () => ({ data: [], error: null }); });
  it('refuses to process a message without a durable identity', async () => {
    await expect(claimInbound(null, 'u1')).rejects.toThrow(/message id/i);
    expect(calls).toHaveLength(0);
  });
  it('refuses effects when the receipt cannot be persisted', async () => {
    respond = () => ({ error: { code: '08006', message: 'unavailable' } });
    await expect(claimInbound('wamid.1', 'u1')).rejects.toThrow(/record/i);
  });
  it('still treats a successfully recorded duplicate as a duplicate', async () => {
    respond = () => ({ error: { code: '23505', message: 'duplicate' } });
    expect(await claimInbound('wamid.1', 'u1')).toBe(false);
  });
  it('expires every approval route at the atomic take, scoped to its owner', async () => {
    const now = new Date('2026-09-25T12:00:00Z');
    await takeOffer('u1', 'offer-1', now);
    expect(calls[0].ops).toContainEqual(['gte', 'created_at', '2026-09-25T11:50:00.000Z']);
    expect(calls[0].ops).toContainEqual(['eq', 'user_id', 'u1']);
    expect(calls[0].ops).toContainEqual(['is', 'taken_at', null]);
  });
  it('keeps consumed siblings visible so a reaction cannot become unambiguous later', async () => {
    await offersOfMessage('u1', 'wamid.buttons');
    expect(calls[0].ops).not.toContainEqual(['is', 'taken_at', null]);
  });
  it('preserves the original numbering after a sibling is consumed', async () => {
    await recentOffers('u1');
    expect(calls[0].ops).not.toContainEqual(['is', 'taken_at', null]);
  });
});
