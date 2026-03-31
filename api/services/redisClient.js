/**
 * Redis Client Service
 * Provides Redis connection and caching utilities for platform connection status
 *
 * Benefits:
 * - Reduces database load by caching frequently accessed platform connection status
 * - Improves response times for dashboard loads (from ~200ms to ~5ms)
 * - Automatic cache invalidation on connection changes
 * - Graceful fallback if Redis is unavailable (dev environments)
 */

import Redis from 'ioredis';
import { createLogger } from './logger.js';

const log = createLogger('Redis');

/**
 * Redis client instance
 * Lazy initialization to avoid crashes if Redis is not configured
 */
let redis = null;
let redisAvailable = false;

/**
 * Initialize Redis client
 * Returns null if Redis URL is not configured (dev mode)
 */
function getRedisClient() {
  if (redis !== null) {
    return redis;
  }

  try {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

    if (!redisUrl) {
      log.warn('Redis URL not configured - caching disabled (using database fallback)');
      redis = null;
      redisAvailable = false;
      return null;
    }

    log.info('Connecting to Redis...');
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        log.error('Redis reconnection error:', err.message);
        return true; // Always try to reconnect
      }
    });

    redis.on('connect', () => {
      log.info('Redis connected successfully');
      redisAvailable = true;
    });

    redis.on('error', (err) => {
      log.error('Redis error:', err.message);
      redisAvailable = false;
    });

    redis.on('close', () => {
      log.warn('Redis connection closed');
      redisAvailable = false;
    });

    return redis;
  } catch (error) {
    log.error('Failed to initialize Redis:', error.message);
    redis = null;
    redisAvailable = false;
    return null;
  }
}

/**
 * Cache TTL configurations (in seconds)
 */
const CACHE_TTL = {
  PLATFORM_STATUS: 300,      // 5 minutes - platform connection status
  USER_PROFILE: 600,         // 10 minutes - user profile data
  SOUL_SIGNATURE: 900,       // 15 minutes - soul signature data
  EXTRACTION_JOB: 60,        // 1 minute - extraction job status (more dynamic)
  IDENTITY_CONTEXT: 14400,   // 4 hours - identity context (matches twin summary TTL)
  DASHBOARD_CONTEXT: 600,    // 10 minutes - unified dashboard payload (heatmap/streak/stats are not real-time)
};

/**
 * Cache key generators
 */
const CACHE_KEYS = {
  platformStatus: (userId) => `platform_status:${userId}`,
  userProfile: (userId) => `user_profile:${userId}`,
  soulSignature: (userId) => `soul_signature:${userId}`,
  extractionJob: (jobId) => `extraction_job:${jobId}`,
  identityContext: (userId) => `identity_context:${userId}`,
  dashboardContext: (userId) => `dashboardCtx:${userId}`,
};

/**
 * Get cached platform connection status
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} Cached status or null
 */
async function getCachedPlatformStatus(userId) {
  const client = getRedisClient();
  if (!client || !redisAvailable) return null;

  try {
    const key = CACHE_KEYS.platformStatus(userId);
    const cached = await client.get(key);

    if (cached) {
      log.info(`Cache HIT: platform_status for user ${userId}`);
      return JSON.parse(cached);
    }

    log.info(`Cache MISS: platform_status for user ${userId}`);
    return null;
  } catch (error) {
    log.error('Error getting cached platform status:', error.message);
    return null; // Fail gracefully
  }
}

/**
 * Set cached platform connection status
 * @param {string} userId - User UUID
 * @param {Object} status - Connection status object
 * @param {number} ttl - Time to live in seconds (default: 5 minutes)
 */
async function setCachedPlatformStatus(userId, status, ttl = CACHE_TTL.PLATFORM_STATUS) {
  const client = getRedisClient();
  if (!client || !redisAvailable) return;

  try {
    const key = CACHE_KEYS.platformStatus(userId);
    await client.setex(key, ttl, JSON.stringify(status));
    log.info(`Cached platform_status for user ${userId} (TTL: ${ttl}s)`);
  } catch (error) {
    log.error('Error setting cached platform status:', error.message);
    // Fail gracefully - don't throw
  }
}

/**
 * Invalidate cached platform connection status
 * Called when user connects/disconnects a platform
 * @param {string} userId - User UUID
 */
async function invalidatePlatformStatusCache(userId) {
  const client = getRedisClient();
  if (!client || !redisAvailable) return;

  try {
    const key = CACHE_KEYS.platformStatus(userId);
    const deleted = await client.del(key);

    if (deleted) {
      log.info(`Invalidated platform_status cache for user ${userId}`);
    }
  } catch (error) {
    log.error('Error invalidating platform status cache:', error.message);
  }
}

// In-memory fallback cache when Redis is unavailable (dev, cold starts, Redis down)
const _memCache = new Map();
const _MEM_CACHE_MAX = 200;

function _memGet(key) {
  const entry = _memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _memCache.delete(key); return null; }
  return entry.value;
}

function _memSet(key, value, ttlSeconds) {
  if (_memCache.size >= _MEM_CACHE_MAX) {
    // Evict oldest entry
    const firstKey = _memCache.keys().next().value;
    _memCache.delete(firstKey);
  }
  _memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Get generic cached data (Redis with in-memory fallback)
 * @param {string} key - Cache key
 * @returns {Promise<any|null>}
 */
async function get(key) {
  const client = getRedisClient();
  if (!client || !redisAvailable) return _memGet(key);

  try {
    const value = await client.get(key);
    if (value) return JSON.parse(value);
    // Redis miss — check in-memory fallback
    return _memGet(key);
  } catch (error) {
    log.error(`Error getting cache key ${key}:`, error.message);
    return _memGet(key);
  }
}

/**
 * Set generic cached data (Redis with in-memory fallback)
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 */
async function set(key, value, ttl = 300) {
  // Always set in-memory fallback
  _memSet(key, value, ttl);

  const client = getRedisClient();
  if (!client || !redisAvailable) return;

  try {
    await client.setex(key, ttl, JSON.stringify(value));
  } catch (error) {
    log.error(`Error setting cache key ${key}:`, error.message);
  }
}

/**
 * Delete cached data
 * @param {string} key - Cache key
 */
async function del(key) {
  const client = getRedisClient();
  if (!client || !redisAvailable) return;

  try {
    await client.del(key);
    log.info(`Deleted cache key ${key}`);
  } catch (error) {
    log.error(`Error deleting cache key ${key}:`, error.message);
  }
}

/**
 * Check if Redis is available
 */
function isRedisAvailable() {
  return redisAvailable;
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const client = getRedisClient();
  if (!client || !redisAvailable) {
    return {
      available: false,
      message: 'Redis not configured or unavailable'
    };
  }

  try {
    const info = await client.info('stats');
    const keyspace = await client.info('keyspace');

    return {
      available: true,
      stats: info,
      keyspace: keyspace
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

export {
  getRedisClient,
  isRedisAvailable,
  getCachedPlatformStatus,
  setCachedPlatformStatus,
  invalidatePlatformStatusCache,
  get,
  set,
  del,
  getCacheStats,
  CACHE_TTL,
  CACHE_KEYS,
};

export default {
  getRedisClient,
  isRedisAvailable,
  getCachedPlatformStatus,
  setCachedPlatformStatus,
  invalidatePlatformStatusCache,
  get,
  set,
  del,
  getCacheStats,
  CACHE_TTL,
  CACHE_KEYS,
};
