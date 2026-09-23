/**
 * The members and invites queries of presenceStore (Phase 2, T3): the shapes
 * the routes and the relay rely on. Same recorder as presenceStore.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
let respond = () => ({ data: null, error: null });

function makeChain(table, ops = []) {
  const entry = { table, ops };
  calls.push(entry);
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') { const p = Promise.resolve(respond(entry)); return p.then.bind(p); }
      return (...args) => { entry.ops.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}

vi.mock('../../api/_app/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeChain(table), rpc: (fn, args) => makeChain(`rpc:${fn}`, [['rpc', fn, args]]) },
}));

const store = await import('../../api/_app/services/presenceStore.js');
const PRESENCE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => { calls.length = 0; respond = () => ({ data: null, error: null }); });

describe('members', () => {
  it('lists a presence\'s members oldest first', async () => {
    await store.listMembers(PRESENCE_ID);
    expect(calls[0].table).toBe('presence_members');
    expect(calls[0].ops).toEqual([
      ['select', 'id, user_id, role, invited_by, created_at'],
      ['eq', 'presence_id', PRESENCE_ID],
      ['order', 'created_at', { ascending: true }],
    ]);
  });

  it('finds one membership by presence and user', async () => {
    respond = () => ({ data: { role: 'family' }, error: null });
    const r = await store.findMembership(PRESENCE_ID, USER_ID);
    expect(calls[0].ops).toEqual([['select', 'role'], ['eq', 'presence_id', PRESENCE_ID], ['eq', 'user_id', USER_ID], ['maybeSingle']]);
    expect(r).toEqual({ data: { role: 'family' }, error: null });
  });

  it('adds a member without overwriting an existing row', async () => {
    await store.addMember({ presence_id: PRESENCE_ID, user_id: USER_ID, role: 'companion', invited_by: 'owner-1' });
    expect(calls[0].table).toBe('presence_members');
    expect(calls[0].ops).toEqual([
      ['upsert', { presence_id: PRESENCE_ID, user_id: USER_ID, role: 'companion', invited_by: 'owner-1' }, { onConflict: 'presence_id,user_id', ignoreDuplicates: true }],
    ]);
  });

  it('removes a member but never the owner row', async () => {
    await store.removeMember(PRESENCE_ID, USER_ID);
    expect(calls[0].ops).toEqual([['delete'], ['eq', 'presence_id', PRESENCE_ID], ['eq', 'user_id', USER_ID], ['neq', 'role', 'owner']]);
  });

  it('lists the presences a user belongs to, with the role, live ones only', async () => {
    await store.listPresencesForMember(USER_ID);
    expect(calls[0].table).toBe('presence_members');
    expect(calls[0].ops).toEqual([
      ['select', 'role, created_at, presences!inner(*)'],
      ['eq', 'user_id', USER_ID],
      ['neq', 'presences.status', 'deleted'],
      ['order', 'created_at', { ascending: false }],
    ]);
  });
});

describe('invites', () => {
  it('creates an invite and returns what the link needs', async () => {
    const row = { presence_id: PRESENCE_ID, role: 'family', token: 't'.repeat(32), created_by: 'owner-1', expires_at: '2026-09-26T00:00:00.000Z' };
    await store.createInvite(row);
    expect(calls[0].table).toBe('presence_invites');
    expect(calls[0].ops).toEqual([['insert', row], ['select', 'id, token, role, expires_at'], ['single']]);
  });

  it('finds an invite by its token', async () => {
    await store.findInviteByToken('tok');
    expect(calls[0].ops).toEqual([['select', 'id, presence_id, role, expires_at, accepted_at'], ['eq', 'token', 'tok'], ['maybeSingle']]);
  });

  it('accepts an invite once', async () => {
    await store.acceptInvite('inv-1', USER_ID);
    const [update, ...rest] = calls[0].ops;
    expect(update[0]).toBe('update');
    expect(update[1]).toMatchObject({ accepted_by: USER_ID });
    expect(update[1].accepted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rest).toEqual([['eq', 'id', 'inv-1'], ['is', 'accepted_at', null], ['select', 'id'], ['maybeSingle']]);
  });
});

describe('listMemberWhatsApp (the relay\'s recipients)', () => {
  it('reads the members, then their enabled WhatsApp channels, and joins them', async () => {
    respond = (entry) => entry.table === 'presence_members'
      ? { data: [{ user_id: 'u-owner', role: 'owner' }, { user_id: 'u-comp', role: 'companion' }, { user_id: 'u-none', role: 'family' }], error: null }
      : { data: [{ user_id: 'u-owner', channel_id: '+5511999990000' }, { user_id: 'u-comp', channel_id: '+5511888880000' }], error: null };

    const r = await store.listMemberWhatsApp(PRESENCE_ID);

    expect(calls.map((c) => c.table)).toEqual(['presence_members', 'messaging_channels']);
    expect(calls[1].ops).toEqual([
      ['select', 'user_id, channel_id'],
      ['in', 'user_id', ['u-owner', 'u-comp', 'u-none']],
      ['eq', 'channel', 'whatsapp'],
      ['eq', 'is_enabled', true],
    ]);
    expect(r).toEqual({ data: [
      { user_id: 'u-owner', role: 'owner', phone: '+5511999990000' },
      { user_id: 'u-comp', role: 'companion', phone: '+5511888880000' },
    ], error: null });
  });

  it('passes a members read error through', async () => {
    respond = () => ({ data: null, error: { message: 'boom' } });
    await expect(store.listMemberWhatsApp(PRESENCE_ID)).resolves.toEqual({ data: null, error: { message: 'boom' } });
    expect(calls).toHaveLength(1);
  });
});
