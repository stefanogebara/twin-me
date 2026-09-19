/**
 * The OAuth rate limiter counts on the one Redis client the API holds when it is up, and in
 * memory when it is not, decided on first use (M3-3). It never opens a connection of its own.
 */
import { describe, expect, it, vi } from 'vitest';
const shared = vi.hoisted(() => ({ call: vi.fn(async () => 1), available: false }));
const made = vi.hoisted(() => ({ redis: [], memory: [] }));
vi.mock('../../../api/services/redisClient.js', () => ({ getRedisClient: () => shared, isRedisAvailable: () => shared.available }));
vi.mock('rate-limit-redis', () => ({ default: class { constructor(opts) { this.opts = opts; made.redis.push(this); } init() {} async increment(key) { await this.opts.sendCommand('INCR', this.opts.prefix + key); return { totalHits: 1, resetTime: new Date() }; } async decrement() {} async resetKey() {} } }));
vi.mock('express-rate-limit', () => ({
  default: (opts) => Object.assign((req, res, next) => next(), { opts }),
  ipKeyGenerator: (ip) => ip,
  MemoryStore: class { constructor() { made.memory.push(this); this.hits = {}; } init() {} async increment(key) { this.hits[key] = (this.hits[key] || 0) + 1; return { totalHits: this.hits[key], resetTime: new Date() }; } async decrement() {} async resetKey() {} },
}));

describe('the OAuth rate limiter and Redis', () => {
  it('counts in memory while Redis is down, then on the shared client once it is up, with its own prefix', async () => {
    const mod = await import('../../../api/middleware/oauthRateLimiter.js');
    const store = mod.oauthAuthorizationLimiter.opts.store;
    expect(made.memory.length).toBe(4);
    expect(new Set(['oauthAuthorizationLimiter', 'oauthCallbackLimiter', 'oauthRefreshLimiter', 'globalOAuthLimiter'].map((n) => mod[n].opts.store.prefix)).size).toBe(4);
    await store.increment('1.2.3.4');
    expect(made.redis.length).toBe(0);
    shared.available = true;
    await store.increment('1.2.3.4');
    expect(made.redis.length).toBe(1);
    expect(shared.call).toHaveBeenCalledWith('INCR', 'oauth_rl:auth:1.2.3.4');
    await store.increment('1.2.3.4');
    expect(made.redis.length).toBe(1);
  });
  it('imports nothing from the redis package', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../api/middleware/oauthRateLimiter.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from 'redis'|createClient\(/);
  });
});
