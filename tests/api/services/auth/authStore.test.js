/**
 * The sign-in tables, named (M2-D, 2026-09-22). Each function is a thin builder over one
 * table; this records the chain each one makes so the table, the columns and the filters
 * cannot drift from what auth-simple.js relied on when the calls lived inline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rec = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../../api/_app/services/database.js', () => {
  const chain = (table) => {
    const q = new Proxy({}, {
      get: (_t, key) => {
        if (key === 'then') return (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
        return (...args) => { rec.calls.push([table, key, ...args]); return q; };
      },
    });
    return q;
  };
  return { supabaseAdmin: { from: (table) => { rec.calls.push([table, 'from']); return chain(table); } } };
});
import * as store from '../../../../api/_app/services/auth/authStore.js';

const chainOf = () => rec.calls.map(([table, op, ...args]) => `${op}${args.length ? `(${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(', ')})` : ''}`).join(' > ');

describe('authStore', () => {
  beforeEach(() => { rec.calls.length = 0; });

  it('finds a user by email, strictly or maybe', async () => {
    await store.findUserByEmail('a@b.c', 'id, email');
    expect(chainOf()).toBe("from > select(id, email) > eq(email, a@b.c) > single");
    rec.calls.length = 0;
    await store.findUserByEmail('a@b.c', 'id', { maybe: true });
    expect(chainOf()).toBe('from > select(id) > eq(email, a@b.c) > maybeSingle');
    expect(rec.calls[0][0]).toBe('users');
  });
  it('finds a user by id, by the legacy refresh hash and by the verification token', async () => {
    await store.findUserById('u1', 'id');
    expect(chainOf()).toBe('from > select(id) > eq(id, u1) > single');
    rec.calls.length = 0;
    await store.findUserByLegacyRefreshHash('h', 'id');
    expect(chainOf()).toBe('from > select(id) > eq(refresh_token_hash, h) > single');
    rec.calls.length = 0;
    await store.findUserByVerificationToken('t', 'id');
    expect(chainOf()).toBe('from > select(id) > eq(email_verification_token, t) > single');
  });
  it('creates a user and reads it back, every column unless told which', async () => {
    await store.createUser({ email: 'a@b.c' });
    expect(chainOf()).toBe('from > insert({"email":"a@b.c"}) > select(*) > single');
    rec.calls.length = 0;
    await store.createUser({ email: 'a@b.c' }, 'id, email');
    expect(chainOf()).toBe('from > insert({"email":"a@b.c"}) > select(id, email) > single');
  });
  it('updates by id, and clears the legacy hash only when it still matches', async () => {
    await store.updateUser('u1', { email_verified: true });
    expect(chainOf()).toBe('from > update({"email_verified":true}) > eq(id, u1)');
    rec.calls.length = 0;
    await store.clearLegacyRefreshHash('u1', 'h');
    expect(chainOf()).toBe('from > update({"refresh_token_hash":null}) > eq(id, u1) > eq(refresh_token_hash, h)');
  });
  it('keeps refresh tokens by hash and rotates only the row that still carries the hash it read', async () => {
    await store.insertRefreshToken({ user_id: 'u1', token_hash: 'h' });
    expect(rec.calls[0][0]).toBe('user_refresh_tokens');
    rec.calls.length = 0;
    await store.findRefreshToken('h');
    /* The row carries what it replaced and when, since 2026-09-25: two tabs sharing one
       cookie jar raced on reload and the loser was told its session was invalid. */
    expect(chainOf()).toBe('from > select(id, user_id, expires_at, token_hash, previous_token_hash, rotated_at) > eq(token_hash, h) > single');
    rec.calls.length = 0;
    await store.findRefreshTokenByPrevious('h');
    expect(chainOf()).toBe('from > select(id, user_id, expires_at, token_hash, previous_token_hash, rotated_at) > eq(previous_token_hash, h) > maybeSingle');
    rec.calls.length = 0;
    await store.rotateRefreshToken('r1', 'h', { token_hash: 'h2' });
    expect(chainOf()).toBe('from > update({"token_hash":"h2"}) > eq(id, r1) > eq(token_hash, h) > select(id)');
    rec.calls.length = 0;
    await store.deleteRefreshTokenById('r1');
    expect(chainOf()).toBe('from > delete > eq(id, r1)');
    rec.calls.length = 0;
    await store.deleteRefreshTokenByHash('h');
    expect(chainOf()).toBe('from > delete > eq(token_hash, h)');
  });
  it('consumes a magic link once', async () => {
    await store.findMagicLink('h');
    expect(chainOf()).toBe('from > select(id, email, invite_code, expires_at, consumed_at) > eq(token_hash, h) > maybeSingle');
    expect(rec.calls[0][0]).toBe('magic_link_tokens');
    rec.calls.length = 0;
    await store.consumeMagicLink('m1');
    expect(chainOf()).toMatch(/^from > update\(\{"consumed_at":"20\d\d-.*"\}\) > eq\(id, m1\) > is\(consumed_at, null\)$/);
  });
  it('hands a pending auth code out once', async () => {
    await store.findPendingAuthCode('c');
    expect(chainOf()).toBe('from > select(*) > eq(code, c) > single');
    expect(rec.calls[0][0]).toBe('pending_auth_codes');
    rec.calls.length = 0;
    await store.deletePendingAuthCode('c');
    expect(chainOf()).toBe('from > delete > eq(code, c)');
  });
  it('upserts a platform connection on the user and platform pair', async () => {
    await store.upsertPlatformConnection({ user_id: 'u1', platform: 'google' });
    expect(chainOf()).toBe('from > upsert({"user_id":"u1","platform":"google"}, {"onConflict":"user_id,platform"})');
    expect(rec.calls[0][0]).toBe('platform_connections');
  });
});
