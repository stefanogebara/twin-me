/**
 * chatRateLimiter — Redis degradation behavior.
 *
 * Regression for the 2026-06-16 incident: with REDIS_URL set in production but
 * Redis unreachable, the limiter failed CLOSED and returned
 * { allowed:false, used:0 }, so the twin replied "You've been chatty (0/200
 * messages this hour)" to a user who had sent ONE message. Desired behavior:
 * degrade to the in-memory limiter (allow), never hard-deny at 0 usage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let redisClientValue;   // what getRedisClient() returns
let redisAvailable;     // what isRedisAvailable() returns
let getClientThrows;    // make getRedisClient throw

vi.mock('../../../api/services/redisClient.js', () => ({
  getRedisClient: () => {
    if (getClientThrows) throw new Error('redis client boom');
    return redisClientValue;
  },
  isRedisAvailable: () => redisAvailable,
}));

const { checkChatRateLimit, CHAT_RATE_LIMIT_MAX } = await import(
  '../../../api/services/chatRateLimiter.js'
);

const uid = () => `u-${Math.random().toString(36).slice(2)}`;

describe('checkChatRateLimit — Redis unavailable degrades, never hard-denies', () => {
  beforeEach(() => {
    redisClientValue = null;
    redisAvailable = false;
    getClientThrows = false;
  });
  afterEach(() => { delete process.env.REDIS_URL; });

  it('REDIS_URL set but client not ready → degrades to in-memory (ALLOWED, not 0/200 deny)', async () => {
    process.env.REDIS_URL = 'redis://configured-but-down';
    const r = await checkChatRateLimit(uid());
    expect(r.allowed).toBe(true);           // before the fix: false
    expect(r.used).toBeGreaterThan(0);      // before the fix: 0
    expect(r.limit).toBe(CHAT_RATE_LIMIT_MAX);
  });

  it('REDIS_URL set but getRedisClient throws → degrades to in-memory (ALLOWED)', async () => {
    process.env.REDIS_URL = 'redis://configured-but-down';
    getClientThrows = true;
    const r = await checkChatRateLimit(uid());
    expect(r.allowed).toBe(true);
    expect(r.used).toBeGreaterThan(0);
  });

  it('no REDIS_URL (dev) → in-memory allows a fresh user', async () => {
    const r = await checkChatRateLimit(uid());
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(1);
  });
});
