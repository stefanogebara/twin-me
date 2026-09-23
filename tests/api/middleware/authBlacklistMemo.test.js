/**
 * The revocation check asks Redis once per token per half minute, not once per request:
 * a page of fourteen requests spent five seconds on the same question (M2-3, 2026-09-19).
 * A token revoked on this instance is refused at once.
 */
import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';
const redis = vi.hoisted(() => ({ exists: vi.fn(async () => 0), set: vi.fn(async () => 'OK') }));
vi.mock('../../../api/_app/services/redisClient.js', () => ({ getRedisClient: () => redis, isRedisAvailable: () => true }));
const { authenticateUser, blacklistToken } = await import('../../../api/_app/middleware/auth.js');

const res = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const run = async (token) => { const req = { headers: { authorization: `Bearer ${token}` }, path: '/auth/x' }; const next = vi.fn(); const r = res(); await authenticateUser(req, r, next); return { next, r }; };

describe('the blacklist memo', { timeout: 15_000 }, () => {
  it('asks Redis once for a burst of requests with the same token', async () => {
    const token = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    redis.exists.mockClear();
    for (let i = 0; i < 14; i += 1) expect((await run(token)).next).toHaveBeenCalled();
    expect(redis.exists).toHaveBeenCalledTimes(1);
  });
  it('refuses a token the moment this instance revokes it', async () => {
    const token = jwt.sign({ id: 'u2' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    expect((await run(token)).next).toHaveBeenCalled();
    await blacklistToken(token, 60);
    const { next, r } = await run(token);
    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(401);
  });
  it('forgets after the window and asks again', async () => {
    const token = jwt.sign({ id: 'u3' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    redis.exists.mockClear();
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now);
    await run(token); await run(token);
    spy.mockReturnValue(now + 31_000);
    await run(token);
    spy.mockRestore();
    expect(redis.exists).toHaveBeenCalledTimes(2);
  });
});
