/**
 * messagingChannelOtpService — ownership-proof codes for linking a messaging
 * channel_id (e.g. a WhatsApp phone) before it lands in messaging_channels.
 * Security-sensitive: codes are stored hashed (never plaintext), expire, are
 * single-use, attempt-capped, and resend-cooldowned. DB is mocked via a
 * thenable query-builder (matches reminderService.test.js style).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-otp';

let selectResult;        // drives whatever the select chain resolves to
const ops = [];          // records insert / update / delete operations

vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const state = { table, op: 'select' };
    const b = {
      select() { state.op = 'select'; return b; },
      insert(payload) { state.op = 'insert'; ops.push({ table, op: 'insert', payload }); return b; },
      update(patch) { state.op = 'update'; ops.push({ table, op: 'update', patch }); return b; },
      delete() { state.op = 'delete'; ops.push({ table, op: 'delete' }); return b; },
      eq() { return b; },
      is() { return b; },
      order() { return b; },
      limit() { return b; },
      // thenable: awaiting any chain resolves based on the operation kind
      then(resolve) {
        if (state.op === 'select') return resolve(selectResult ?? { data: [], error: null });
        return resolve({ error: null });
      },
    };
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) } };
});

const { requestChannelOtp, verifyChannelOtp, OTP_MAX_ATTEMPTS } = await import(
  '../../../api/services/messagingChannelOtpService.js'
);

const PHONE = '+5511999999999';
const future = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

beforeEach(() => {
  selectResult = { data: [], error: null };
  ops.length = 0;
});

describe('requestChannelOtp', () => {
  it('stores a hashed code (never plaintext) with a future expiry and returns the code', async () => {
    const out = await requestChannelOtp({ userId: 'u1', channelId: PHONE });
    expect(out.success).toBe(true);
    expect(out.code).toMatch(/^\d{6}$/);

    const ins = ops.find((o) => o.op === 'insert');
    expect(ins).toBeTruthy();
    expect(ins.payload.user_id).toBe('u1');
    expect(ins.payload.channel).toBe('whatsapp');
    expect(ins.payload.channel_id).toBe(PHONE);
    expect(ins.payload.attempts).toBe(0);
    expect(ins.payload.code_hash).toBeTruthy();
    expect(ins.payload.code_hash).not.toBe(out.code); // stored hashed, not in the clear
    expect(new Date(ins.payload.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('clears prior unconsumed codes before inserting a new one', async () => {
    await requestChannelOtp({ userId: 'u1', channelId: PHONE });
    expect(ops.some((o) => o.op === 'delete')).toBe(true);
  });

  it('rejects missing params without inserting', async () => {
    const out = await requestChannelOtp({ userId: 'u1' });
    expect(out.success).toBe(false);
    expect(ops.some((o) => o.op === 'insert')).toBe(false);
  });

  it('enforces a resend cooldown when a fresh code already exists', async () => {
    selectResult = { data: [{ id: 'o1', created_at: new Date(Date.now() - 5 * 1000).toISOString() }], error: null };
    const out = await requestChannelOtp({ userId: 'u1', channelId: PHONE });
    expect(out.success).toBe(false);
    expect(out.error).toBe('cooldown');
    expect(out.retryAfterMs).toBeGreaterThan(0);
    expect(ops.some((o) => o.op === 'insert')).toBe(false);
  });
});

describe('verifyChannelOtp', () => {
  it('accepts the correct code (round-trip) and marks it consumed', async () => {
    const req = await requestChannelOtp({ userId: 'u1', channelId: PHONE });
    const stored = ops.find((o) => o.op === 'insert').payload;
    ops.length = 0;
    selectResult = { data: [{ id: 'o1', code_hash: stored.code_hash, attempts: 0, expires_at: future(), consumed_at: null }], error: null };

    const out = await verifyChannelOtp({ userId: 'u1', channelId: PHONE, code: req.code });
    expect(out.success).toBe(true);
    const consume = ops.find((o) => o.op === 'update');
    expect(consume.patch.consumed_at).toBeTruthy();
  });

  it('rejects a wrong code and increments attempts', async () => {
    selectResult = { data: [{ id: 'o1', code_hash: 'deadbeef'.repeat(8), attempts: 1, expires_at: future(), consumed_at: null }], error: null };
    const out = await verifyChannelOtp({ userId: 'u1', channelId: PHONE, code: '123456' });
    expect(out.success).toBe(false);
    expect(out.reason).toBe('invalid');
    const upd = ops.find((o) => o.op === 'update');
    expect(upd.patch.attempts).toBe(2);
  });

  it('returns not_found when there is no pending code', async () => {
    selectResult = { data: [], error: null };
    const out = await verifyChannelOtp({ userId: 'u1', channelId: PHONE, code: '123456' });
    expect(out.success).toBe(false);
    expect(out.reason).toBe('not_found');
  });

  it('returns expired for a past expiry (before any hash compare)', async () => {
    selectResult = { data: [{ id: 'o1', code_hash: 'x'.repeat(64), attempts: 0, expires_at: past(), consumed_at: null }], error: null };
    const out = await verifyChannelOtp({ userId: 'u1', channelId: PHONE, code: '123456' });
    expect(out.reason).toBe('expired');
  });

  it('locks out after the attempt cap', async () => {
    selectResult = { data: [{ id: 'o1', code_hash: 'x'.repeat(64), attempts: OTP_MAX_ATTEMPTS, expires_at: future(), consumed_at: null }], error: null };
    const out = await verifyChannelOtp({ userId: 'u1', channelId: PHONE, code: '123456' });
    expect(out.reason).toBe('too_many_attempts');
  });

  it('rejects missing params', async () => {
    const out = await verifyChannelOtp({ userId: 'u1', channelId: PHONE });
    expect(out.success).toBe(false);
    expect(out.reason).toBe('missing_params');
  });
});
