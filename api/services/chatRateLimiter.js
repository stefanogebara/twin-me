/**
 * Per-user chat rate limit (200 messages / hour).
 *
 * Extracted from twin-chat.js (audit ARCH-1: 1672-line monolith).
 *
 * Storage strategy:
 *   - Redis when REDIS_URL is configured (cross-instance, survives cold starts).
 *   - In-memory Map fallback only when REDIS_URL is unset (local dev). On
 *     Vercel each invocation is a fresh lambda — the in-memory Map is empty
 *     per request and effectively a no-op, but we keep the surface so
 *     `npm run dev` doesn't require a local Redis.
 *
 * Fail-closed policy: when REDIS_URL is configured but Redis is unavailable
 * (network error, client not initialized), we DENY the request rather than
 * silently falling through to the per-instance Map and bypassing the limit.
 */

import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { createLogger } from './logger.js';

const log = createLogger('ChatRateLimiter');

// Bumped 2026-04-23 from 50 -> 200 to reduce friction during power-user
// bursts. Still tight enough to catch runaway loops or compromised accounts.
export const CHAT_RATE_LIMIT_MAX = 200;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const chatRateLimitMap = new Map();
let _cleanupInterval = null;

if (!process.env.REDIS_URL) {
  log.warn('REDIS_URL is not set - chat rate limiting is in-memory only (not safe for multi-instance/serverless deployments)');
}

// Periodic cleanup of expired entries (in-memory fallback only).
// Backend audit HIGH-4: skip on Vercel + when Redis is configured.
if (!process.env.VERCEL && !process.env.REDIS_URL && !_cleanupInterval) {
  _cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of chatRateLimitMap.entries()) {
      const fresh = entry.timestamps.filter(ts => now - ts < CHAT_RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) {
        chatRateLimitMap.delete(userId);
      } else {
        entry.timestamps = fresh;
      }
    }
  }, 10 * 60 * 1000);
  _cleanupInterval.unref?.();
}

/**
 * Check + record a chat message against the per-user rate limit.
 */
export async function checkChatRateLimit(userId) {
  const now = Date.now();
  const windowStart = now - CHAT_RATE_LIMIT_WINDOW_MS;
  const redisConfigured = Boolean(process.env.REDIS_URL);

  try {
    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      const key = `chatRateLimit:${userId}`;
      const pipe = client.pipeline();
      pipe.zremrangebyscore(key, '-inf', windowStart);
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      pipe.zcard(key);
      pipe.zrange(key, 0, 0, 'WITHSCORES');
      pipe.expire(key, Math.ceil(CHAT_RATE_LIMIT_WINDOW_MS / 1000));
      const results = await pipe.exec();
      const used = results[2][1];
      if (used > CHAT_RATE_LIMIT_MAX) {
        const oldestScore = parseFloat(results[3][1][1] || now);
        const retryAfterMs = CHAT_RATE_LIMIT_WINDOW_MS - (now - oldestScore);
        return { allowed: false, used, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: Math.max(0, retryAfterMs) };
      }
      return { allowed: true, used, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: null };
    }
  } catch (redisErr) {
    if (redisConfigured) {
      log.warn('Redis rate limit check failed - denying request (fail-closed)', { error: redisErr });
      return { allowed: false, used: 0, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: null, reason: 'rate_limit_unavailable' };
    }
    log.warn('Redis rate limit check failed, using in-memory fallback (dev mode)', { error: redisErr });
  }

  if (redisConfigured) {
    log.warn('Redis configured but client not ready - denying request (fail-closed)');
    return { allowed: false, used: 0, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: null, reason: 'rate_limit_unavailable' };
  }

  const entry = chatRateLimitMap.get(userId);
  if (!entry) {
    chatRateLimitMap.set(userId, { timestamps: [now] });
    return { allowed: true, used: 1, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: null };
  }

  const fresh = entry.timestamps.filter(ts => now - ts < CHAT_RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= CHAT_RATE_LIMIT_MAX) {
    const oldestInWindow = Math.min(...fresh);
    const retryAfterMs = CHAT_RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, used: fresh.length, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs };
  }
  chatRateLimitMap.set(userId, { timestamps: [...fresh, now] });
  return { allowed: true, used: fresh.length + 1, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: null };
}
