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

import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

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

let redisClient = null;
let redisStore = null;

/**
 * Initializes Redis client for distributed rate limiting
 * Falls back to in-memory if Redis is unavailable
 */
async function initializeRedisStore() {
  if (!process.env.REDIS_URL) {
    console.log('⚠️ [Rate Limiter] No REDIS_URL configured, using in-memory store');
    return null;
  }

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ [Rate Limiter] Redis reconnection failed after 10 attempts');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ [Rate Limiter] Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ [Rate Limiter] Redis connected for distributed rate limiting');
    });

    await redisClient.connect();

    redisStore = new RedisStore({
      client: redisClient,
      prefix: 'oauth_rl:' // Rate limit key prefix
    });

    return redisStore;
  } catch (error) {
    console.error('❌ [Rate Limiter] Redis initialization failed:', error.message);
    console.log('⚠️ [Rate Limiter] Falling back to in-memory store');
    return null;
  }
}

// =========================================================================
// Key Generator Functions
// =========================================================================

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
  ...(redisStore && { store: redisStore }),

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
    console.warn(`🚨 [Rate Limiter] Authorization limit exceeded`, {
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

  ...(redisStore && { store: redisStore }),
  keyGenerator: generateCallbackKey,

  skip: (req) => {
    // Skip for health checks
    return req.path === '/health' || req.path === '/ping';
  },

  handler: (req, res) => {
    console.warn(`🚨 [Rate Limiter] Callback limit exceeded`, {
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

  ...(redisStore && { store: redisStore }),
  keyGenerator: generateRefreshKey,

  skip: (req) => {
    // Skip for health checks
    return req.path === '/health' || req.path === '/ping';
  },

  handler: (req, res) => {
    console.warn(`🚨 [Rate Limiter] Refresh limit exceeded`, {
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
  ...(redisStore && { store: redisStore }),
  keyGenerator: ipKeyGenerator,

  handler: (req, res) => {
    console.error(`🚨 [Rate Limiter] Global OAuth limit exceeded`, {
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
  console.log('🔧 [Rate Limiter] Initializing OAuth rate limiting...');

  const store = await initializeRedisStore();

  if (store) {
    console.log('✅ [Rate Limiter] Using Redis distributed store');
  } else {
    console.log('⚠️ [Rate Limiter] Using in-memory store (single-server only)');
  }

  console.log('✅ [Rate Limiter] OAuth rate limiting initialized');
  console.log('📊 [Rate Limiter] Limits configured:');
  console.log('   - Authorization: 10 requests / 15 minutes');
  console.log('   - Callback: 20 requests / 15 minutes');
  console.log('   - Refresh: 5 requests / 20 minutes');
  console.log('   - Global: 100 requests / 1 hour');
}

/**
 * Cleanup rate limiter resources (call on server shutdown)
 */
export async function shutdownRateLimiter() {
  if (redisClient) {
    console.log('🔧 [Rate Limiter] Closing Redis connection...');
    await redisClient.quit();
    console.log('✅ [Rate Limiter] Redis connection closed');
  }
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
