/**
 * Policy Engine — Declarative Guardrails for Agent Actions
 * ==========================================================
 * Inspired by NVIDIA NemoClaw's policy-based guardrails.
 * Enforces action-type allowlists per autonomy level, blocks
 * dangerous actions globally, and rate-limits per action type.
 *
 * Layered on top of autonomyService.js (which handles per-skill
 * level settings). This engine enforces WHAT each level can do.
 *
 * Usage:
 *   import { checkPolicy } from './policyEngine.js';
 *   const { allowed, reason } = await checkPolicy(userId, 3, 'execute', 'morning_briefing');
 */

import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { createLogger } from './logger.js';

const log = createLogger('PolicyEngine');

// What action types each autonomy level is allowed to perform
const ACTION_ALLOWLIST = Object.freeze({
  0: ['observe'],
  1: ['observe', 'suggest'],
  2: ['observe', 'suggest', 'draft'],
  3: ['observe', 'suggest', 'draft', 'execute', 'send_message', 'nudge', 'reminder'],
  4: ['observe', 'suggest', 'draft', 'execute', 'send_message', 'nudge', 'reminder', 'modify_memory', 'call_api'],
});

// Actions that are NEVER allowed regardless of autonomy level
const BLOCKED_ACTIONS = Object.freeze(new Set([
  'delete_account',
  'send_money',
  'post_public',
  'modify_auth',
  'delete_data',
  'share_private_data',
]));

// Rate limits per action type (per user, sliding window)
const RATE_LIMITS = Object.freeze({
  execute: { max: 10, windowMs: 3_600_000 },     // 10/hour
  send_message: { max: 20, windowMs: 3_600_000 }, // 20/hour
  modify_memory: { max: 30, windowMs: 3_600_000 }, // 30/hour
  draft: { max: 15, windowMs: 3_600_000 },        // 15/hour
  nudge: { max: 5, windowMs: 3_600_000 },         // 5/hour
});

// In-memory rate limit fallback (per userId:actionType)
const rateLimitCache = new Map();

/**
 * Check if an action is allowed by policy.
 *
 * @param {string} userId
 * @param {number} autonomyLevel - Current effective autonomy level (0-4)
 * @param {string} actionType - The action being attempted
 * @param {string} skillName - Which skill is requesting (for logging)
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export async function checkPolicy(userId, autonomyLevel, actionType, skillName = 'unknown') {
  // 1. Global block list
  if (BLOCKED_ACTIONS.has(actionType)) {
    log.warn('Blocked action attempted', { userId, actionType, skillName });
    return { allowed: false, reason: `Action "${actionType}" is globally blocked for safety` };
  }

  // 2. Autonomy level allowlist
  const level = Math.max(0, Math.min(4, autonomyLevel));
  const allowed = ACTION_ALLOWLIST[level] || ACTION_ALLOWLIST[0];
  if (!allowed.includes(actionType)) {
    return {
      allowed: false,
      reason: `Autonomy level ${level} does not permit "${actionType}". Allowed: ${allowed.join(', ')}`,
    };
  }

  // 3. Rate limiting
  const limit = RATE_LIMITS[actionType];
  if (limit) {
    const isOverLimit = await checkRateLimit(userId, actionType, limit);
    if (isOverLimit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for "${actionType}": max ${limit.max} per ${limit.windowMs / 60000} minutes`,
      };
    }
  }

  return { allowed: true, reason: null };
}

/**
 * Check rate limit for a user + action type combination.
 * Uses Redis sorted sets for precision, in-memory fallback otherwise.
 */
async function checkRateLimit(userId, actionType, limit) {
  const key = `policy_rate:${userId}:${actionType}`;
  const now = Date.now();
  const windowStart = now - limit.windowMs;

  try {
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      // Remove expired entries, count remaining, add current
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcard(key);
      if (count >= limit.max) return true;
      await redis.zadd(key, now, `${now}`);
      await redis.expire(key, Math.ceil(limit.windowMs / 1000));
      return false;
    }
  } catch (err) {
    log.warn('Redis rate limit check failed, using memory', { error: err.message });
  }

  // In-memory fallback
  const entry = rateLimitCache.get(key) || [];
  const filtered = entry.filter(ts => ts > windowStart);
  if (filtered.length >= limit.max) return true;
  filtered.push(now);
  rateLimitCache.set(key, filtered);
  return false;
}

/**
 * Get the action allowlist for a given autonomy level.
 */
export function getAllowedActions(autonomyLevel) {
  const level = Math.max(0, Math.min(4, autonomyLevel));
  return [...(ACTION_ALLOWLIST[level] || ACTION_ALLOWLIST[0])];
}
