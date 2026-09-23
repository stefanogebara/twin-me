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
 * Degradation policy (revised 2026-06-16): when REDIS_URL is configured but
 * Redis is unavailable (network error, client not initialized), we DEGRADE to
 * the in-memory Map rather than denying. Failing closed here once took the
 * entire twin offline during a Redis outage — every chat got "You've been
 * chatty (0/200 messages this hour)" with ZERO messages actually sent. A
 * working twin beats strict cross-instance limiting; the per-lambda Map still
 * bounds a single runaway loop, and the outage is logged loudly.
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

// audit-2026-05-09 S-M5: REDIS_URL must be set in production. The in-memory
// fallback resets per-lambda on Vercel, so without Redis the rate limiter
// silently becomes a no-op cross-instance — runaway-loop detection breaks
// without anything in the logs flagging it. Fail loud at boot in production.
if (!process.env.REDIS_URL) {
  if (process.env.NODE_ENV === 'production') {
    log.error('REDIS_URL is not set in production — chat rate limiter is effectively disabled. Configure Redis or runaway-loop detection breaks.');
  } else {
    log.warn('REDIS_URL is not set - chat rate limiting is in-memory only (not safe for multi-instance/serverless deployments)');
  }
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
      // audit-2026-05-09 self-audit: pipeline used to ZADD then ZCARD —
      // a denied request still burned a slot. Now: speculative ZADD with
      // a tracked member, then if over the limit, ZREM the just-added
      // member so the count reflects only allowed requests. One extra
      // Redis op on overage; zero on the happy path.
      const member = `${now}-${Math.random()}`;
      const pipe = client.pipeline();
      pipe.zremrangebyscore(key, '-inf', windowStart);
      pipe.zadd(key, now, member);
      pipe.zcard(key);
      pipe.zrange(key, 0, 0, 'WITHSCORES');
      pipe.expire(key, Math.ceil(CHAT_RATE_LIMIT_WINDOW_MS / 1000));
      const results = await pipe.exec();
      const used = results[2][1];
      if (used > CHAT_RATE_LIMIT_MAX) {
        // Undo the speculative add so the next request sees the true count.
        // Best-effort: a failed ZREM here only inflates the counter by 1
        // for the rest of the hour, which is conservative (denies one extra
        // legitimate request) — never the inverse.
        client.zrem(key, member).catch(err =>
          log.warn('zrem after rate-limit denial failed', { error: err?.message })
        );
        const oldestScore = parseFloat(results[3][1][1] || now);
        const retryAfterMs = CHAT_RATE_LIMIT_WINDOW_MS - (now - oldestScore);
        return { allowed: false, used: used - 1, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: Math.max(0, retryAfterMs) };
      }
      return { allowed: true, used, limit: CHAT_RATE_LIMIT_MAX, retryAfterMs: null };
    }
  } catch (redisErr) {
    // Graceful degradation (2026-06-16): Redis configured but erroring. We used
    // to fail CLOSED here, which took the whole twin offline on any Redis hiccup
    // (users saw "You've been chatty (0/200…)" having sent nothing). Fall through
    // to the in-memory limiter instead — loose on Vercel (per-lambda) but the
    // twin stays up. Logged loudly so the Redis outage is visible.
    log.warn('Redis rate limit check failed — degrading to in-memory limiter (twin stays up)', { error: redisErr?.message, redisConfigured });
  }

  if (redisConfigured) {
    // Same rationale: Redis configured but client not ready → degrade, don't deny.
    log.warn('Redis configured but client not ready — degrading to in-memory limiter (twin stays up)');
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
