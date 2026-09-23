/**
 * OAuth Rate Limiting Middleware
 *
 * Protects OAuth endpoints from:
 * - Brute force attacks on state validation
 * - DoS attacks overwhelming OAuth providers
 * - API quota exhaustion
 *
 * Security Features:
 * - Per-IP rate limiting
 * - Per-user rate limiting (if authenticated)
 * - Separate limits for different OAuth phases
 * - Redis support for distributed systems (optional)
 *
 * @module oauthRateLimiter
 */

import rateLimit, { ipKeyGenerator, MemoryStore } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient, isRedisAvailable } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('OAuthRateLimiter');

// =========================================================================
// Configuration
// =========================================================================

const RATE_LIMIT_CONFIG = {
  // OAuth authorization initiation (e.g., /connect/spotify)
  authorization: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per IP per 15 minutes
    message: {
      success: false,
      error: 'Too many OAuth requests. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    }
  },

  // OAuth callback handler (e.g., /oauth/callback)
  callback: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 callbacks per IP per 15 minutes (allows retries)
    message: {
      success: false,
      error: 'Too many authentication attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    }
  },

  // Token refresh endpoint (if exposed)
  refresh: {
    windowMs: 20 * 60 * 1000, // 20 minutes
    max: 5, // 5 manual refresh requests per user per 20 minutes
    message: {
      success: false,
      error: 'Token refresh rate limit exceeded. Please wait 20 minutes.',
      retryAfter: '20 minutes'
    }
  }
};

// =========================================================================
// Redis Store (Optional - for distributed systems)
// =========================================================================

/**
 * A store that is Redis when the API's one client is up and memory when it is not, decided
 * on first use rather than at load (M3-3, 2026-09-19). The limiters are built when this
 * module loads, and the Redis store used to be created afterwards by initializeRateLimiter,
 * so no limiter ever held it: on Vercel every instance counted alone. It also used to open a
 * second connection with the `redis` package beside the ioredis client every other module
 * shares; rate-limit-redis takes that client through sendCommand. Each limiter has its own
 * prefix, as each had its own memory.
 */
class SharedStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.memory = new MemoryStore();
    this.redis = null;
    this.localKeys = false;
  }
  init(options) {
    this.options = options;
    this.memory.init(options);
  }
  backend() {
    if (this.redis) return this.redis;
    if (!isRedisAvailable()) return this.memory;
    try {
      const client = getRedisClient();
      this.redis = new RedisStore({ sendCommand: (...args) => client.call(...args), prefix: this.prefix });
      if (this.options) this.redis.init(this.options);
      log.info('Rate limiting on the shared Redis client', { prefix: this.prefix });
      return this.redis;
    } catch (error) {
      log.error('Redis store initialization failed, counting in memory', { error: error.message });
      return this.memory;
    }
  }
  async increment(key) { return this.backend().increment(key); }
  async decrement(key) { return this.backend().decrement(key); }
  async resetKey(key) { return this.backend().resetKey(key); }
  async resetAll() { return this.backend().resetAll?.(); }
}

/**
 * Generates rate limit key based on IP and optionally user ID
 *
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function generateAuthorizationKey(req) {
  const userId = req.body?.userId || req.user?.id;

  // If user is authenticated, rate limit by user ID (stricter)
  // Otherwise, rate limit by IP (allows multiple users from same network)
  if (userId) {
    return `user:${userId}`;
  }

  // Use ipKeyGenerator for proper IPv6 handling
  return `ip:${ipKeyGenerator(req)}`;
}

/**
 * Generates callback key based on IP and state
 *
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function generateCallbackKey(req) {
  // Use ipKeyGenerator for proper IPv6 handling
  return `ip:${ipKeyGenerator(req)}`;
}

/**
 * Generates refresh key based on user ID
 *
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function generateRefreshKey(req) {
  const userId = req.user?.id || req.body?.userId || 'anonymous';
  return `user:${userId}`;
}

// =========================================================================
// Rate Limiter Middleware Factories
// =========================================================================

/**
 * OAuth Authorization Rate Limiter
 * Protects /connect/* endpoints from excessive OAuth flow initiations
 */
export const oauthAuthorizationLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.authorization.windowMs,
  max: RATE_LIMIT_CONFIG.authorization.max,
  message: RATE_LIMIT_CONFIG.authorization.message,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

  // Use Redis store if available, otherwise in-memory (default)
  store: new SharedStore('oauth_rl:auth:'),

  // Custom key generator (per-IP or per-user)
  keyGenerator: generateAuthorizationKey,

  // Skip rate limiting for certain conditions
  skip: (req) => {
    // Skip for health checks
    if (req.path === '/health' || req.path === '/ping') {
      return true;
    }
    // Skip for admins (if you have admin authentication)
    if (req.user?.role === 'admin') {
      return true;
    }
    return false;
  },

  // Custom handler when limit is exceeded
  handler: (req, res) => {
    log.warn('Authorization limit exceeded', {
      ip: req.ip,
      userId: req.body?.userId || req.user?.id || 'anonymous',
      platform: req.params?.platform || req.body?.platform,
      path: req.path
    });

    res.status(429).json(RATE_LIMIT_CONFIG.authorization.message);
  }
});

/**
 * OAuth Callback Rate Limiter
 * Protects /oauth/callback endpoint from replay attacks and brute force
 */
export const oauthCallbackLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.callback.windowMs,
  max: RATE_LIMIT_CONFIG.callback.max,
  message: RATE_LIMIT_CONFIG.callback.message,
  standardHeaders: true,
  legacyHeaders: false,

  store: new SharedStore('oauth_rl:callback:'),
  keyGenerator: generateCallbackKey,

  skip: (req) => {
    // Skip for health checks
    return req.path === '/health' || req.path === '/ping';
  },

  handler: (req, res) => {
    log.warn('Callback limit exceeded', {
      ip: req.ip,
      state: req.body?.state?.substring(0, 10) + '...',
      path: req.path
    });

    res.status(429).json(RATE_LIMIT_CONFIG.callback.message);
  }
});

/**
 * Token Refresh Rate Limiter
 * Protects token refresh endpoints from excessive manual refresh requests
 */
export const oauthRefreshLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.refresh.windowMs,
  max: RATE_LIMIT_CONFIG.refresh.max,
  message: RATE_LIMIT_CONFIG.refresh.message,
  standardHeaders: true,
  legacyHeaders: false,

  store: new SharedStore('oauth_rl:refresh:'),
  keyGenerator: generateRefreshKey,

  skip: (req) => {
    // Skip for health checks
    return req.path === '/health' || req.path === '/ping';
  },

  handler: (req, res) => {
    log.warn('Refresh limit exceeded', {
      userId: req.user?.id || 'anonymous',
      platform: req.body?.platform,
      path: req.path
    });

    res.status(429).json(RATE_LIMIT_CONFIG.refresh.message);
  }
});

// =========================================================================
// Global OAuth Rate Limiter (Apply to all OAuth routes)
// =========================================================================

/**
 * Global OAuth rate limiter - broader limits for all OAuth-related endpoints
 * Use this as a fallback/additional layer of protection
 */
export const globalOAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per IP per hour
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new SharedStore('oauth_rl:global:'),
  keyGenerator: ipKeyGenerator,

  handler: (req, res) => {
    log.error('Global OAuth limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
      retryAfter: '1 hour'
    });
  }
});

// =========================================================================
// Initialization
// =========================================================================

/**
 * Initialize rate limiter with Redis support (optional)
 * Call this in server.js on startup
 */
export async function initializeRateLimiter() {
  log.info('OAuth rate limiting initialized', {
    store: isRedisAvailable() ? 'the shared Redis client' : 'memory until Redis is up (single-instance)',
    authorization: '10 requests / 15 minutes',
    callback: '20 requests / 15 minutes',
    refresh: '5 requests / 20 minutes',
    global: '100 requests / 1 hour'
  });
}

/**
 * Cleanup rate limiter resources (call on server shutdown)
 */
export async function shutdownRateLimiter() {
  /* The shared client is closed by its own module; the stores hold no connection of their own. */
}

// =========================================================================
// Usage Examples
// =========================================================================

/**
 * Example 1: Apply to specific OAuth routes
 *
 * import { oauthAuthorizationLimiter, oauthCallbackLimiter } from './middleware/oauthRateLimiter.js';
 *
 * // Protect authorization endpoints
 * router.post('/connect/spotify', oauthAuthorizationLimiter, spotifyConnectHandler);
 * router.post('/connect/github', oauthAuthorizationLimiter, githubConnectHandler);
 *
 * // Protect callback endpoint
 * router.post('/oauth/callback', oauthCallbackLimiter, oauthCallbackHandler);
 */

/**
 * Example 2: Apply global rate limiter to all OAuth routes
 *
 * import { globalOAuthLimiter } from './middleware/oauthRateLimiter.js';
 *
 * app.use('/api/entertainment', globalOAuthLimiter);
 * app.use('/api/oauth', globalOAuthLimiter);
 */

/**
 * Example 3: Initialize in server.js
 *
 * import { initializeRateLimiter, shutdownRateLimiter } from './middleware/oauthRateLimiter.js';
 *
 * // On startup
 * await initializeRateLimiter();
 *
 * // On shutdown
 * process.on('SIGTERM', async () => {
 *   await shutdownRateLimiter();
 *   process.exit(0);
 * });
 */

export default {
  oauthAuthorizationLimiter,
  oauthCallbackLimiter,
  oauthRefreshLimiter,
  globalOAuthLimiter,
  initializeRateLimiter,
  shutdownRateLimiter
};
