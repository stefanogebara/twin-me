import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createLogger } from '../services/logger.js';

const log = createLogger('Auth');

dotenv.config();

// Token blacklist helpers (Redis-backed, in-memory fallback)
const TOKEN_BLACKLIST_PREFIX = 'jwt:revoked:';
const inMemoryBlacklist = new Map();
const EMAIL_VERIFICATION_CACHE_TTL_MS = 60 * 1000;
const emailVerificationCache = new Map();

function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

export async function blacklistToken(token, expiresInSeconds) {
  const key = TOKEN_BLACKLIST_PREFIX + tokenFingerprint(token);
  try {
    const { getRedisClient, isRedisAvailable } = await import('../services/redisClient.js');
    if (isRedisAvailable()) {
      const client = getRedisClient();
      await client.set(key, '1', 'EX', expiresInSeconds);
      return;
    }
  } catch {}
  inMemoryBlacklist.set(key, Date.now() + expiresInSeconds * 1000);
}

async function isTokenBlacklisted(token) {
  const key = TOKEN_BLACKLIST_PREFIX + tokenFingerprint(token);
  try {
    const { getRedisClient, isRedisAvailable } = await import('../services/redisClient.js');
    if (isRedisAvailable()) {
      const client = getRedisClient();
      return await client.exists(key) === 1;
    }
  } catch {}
  const expiry = inMemoryBlacklist.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) { inMemoryBlacklist.delete(key); return false; }
  return true;
}

function getCachedEmailVerification(userId) {
  const cached = emailVerificationCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > EMAIL_VERIFICATION_CACHE_TTL_MS) {
    emailVerificationCache.delete(userId);
    return null;
  }
  return cached.value;
}

function setCachedEmailVerification(userId, value) {
  emailVerificationCache.set(userId, {
    value,
    fetchedAt: Date.now(),
  });
}

// JWT secret from environment (required)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  log.error('FATAL: JWT_SECRET environment variable is not set — all auth will fail');
}

// Authentication middleware for JWT tokens
export const authenticateUser = async (req, res, next) => {
  try {
    // Extract the authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log.warn('Missing authorization header', { path: req.path });
      return res.status(401).json({ success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    // Extract the token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      log.warn('No token provided', { path: req.path });
      return res.status(401).json({ success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    if (!JWT_SECRET) {
      log.error('JWT_SECRET missing — cannot verify token', { path: req.path });
      return res.status(500).json({ error: 'Authentication service misconfigured' });
    }

    try {
      // Verify the JWT token
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

      // Check if token has been revoked (logout blacklist)
      if (await isTokenBlacklisted(token)) {
        return res.status(401).json({ success: false,
          error: 'Unauthorized',
          message: 'Token has been revoked'
        });
      }

      // Add user info to request
      req.user = {
        id: payload.id || payload.userId, // Support both 'id' and 'userId' for backwards compatibility
        email: payload.email,
        ...payload
      };

      // Email verification check with 24-hour grace period
      // Skip for auth-related paths (verify-email, refresh, etc.) so users can still verify
      const skipVerificationPaths = ['/auth/', '/verify-email'];
      const shouldCheckVerification = !skipVerificationPaths.some(p => req.path.includes(p));

      if (shouldCheckVerification) {
        try {
          let dbUser = getCachedEmailVerification(req.user.id);
          if (!dbUser) {
            const { supabaseAdmin } = await import('../services/database.js');
            const result = await supabaseAdmin
              .from('users')
              .select('email_verified, created_at')
              .eq('id', req.user.id)
              .single();
            dbUser = result.data;
            if (dbUser) {
              setCachedEmailVerification(req.user.id, dbUser);
            }
          }

          if (dbUser && !dbUser.email_verified) {
            const accountAgeMs = Date.now() - new Date(dbUser.created_at).getTime();
            const twentyFourHoursMs = 24 * 60 * 60 * 1000;

            if (accountAgeMs > twentyFourHoursMs) {
              return res.status(403).json({
                error: 'Email not verified',
                message: 'Please verify your email to continue using TwinMe',
                code: 'EMAIL_NOT_VERIFIED',
              });
            }
          }
        } catch (verifyCheckError) {
          // Non-blocking: if the check fails, let the request through
          // This prevents email verification from breaking the app if DB is slow
          log.warn('Email verification check failed (non-blocking)', { error: verifyCheckError });
        }
      }

      next();
    } catch (verifyError) {
      log.error('Token verification failed', { path: req.path, errorName: verifyError.name });
      return res.status(401).json({ success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        tokenExpired: process.env.NODE_ENV === 'development' ? verifyError.name === 'TokenExpiredError' : undefined,
        details: process.env.NODE_ENV === 'development' ? verifyError.message : undefined
      });
    }

  } catch (error) {
    log.error('Unexpected error', { error });
    return res.status(500).json({
      error: 'Authentication service error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Optional authentication middleware (allows both authenticated and unauthenticated requests)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token && JWT_SECRET) {
        try {
          const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

          req.user = {
            id: payload.id || payload.userId, // Support both 'id' and 'userId' for backwards compatibility
            email: payload.email,
            ...payload
          };
        } catch (verifyError) {
          // For optional auth, we don't fail on invalid tokens
          log.warn('Optional auth token verification failed', { error: verifyError });
        }
      }
    }

    next();
  } catch (error) {
    log.error('Optional authentication middleware error', { error });
    next(); // Continue without authentication for optional auth
  }
};

// Admin/Professor role check middleware — re-validates role from DB
export const requireProfessor = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false,
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  try {
    const { supabaseAdmin } = await import('../services/database.js');
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (!dbUser) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const dbRole = dbUser.role;
    const isProfessor = dbRole === 'professor' || dbRole === 'admin';

    if (!isProfessor) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Professor role required'
      });
    }

    next();
  } catch (err) {
    log.error('requireProfessor DB check failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// userRateLimit: Redis-backed sliding window per user, in-memory Map fallback.
const _rateLimitStore = new Map();

export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) return next();

  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `rateLimit:${userId}:${maxRequests}:${windowMs}`;

  try {
    const { getRedisClient, isRedisAvailable } = await import('../services/redisClient.js');
    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      const pipe = client.pipeline();
      pipe.zremrangebyscore(key, '-inf', windowStart);
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      pipe.zcard(key);
      pipe.expire(key, Math.ceil(windowMs / 1000));
      const results = await pipe.exec();
      const used = results[2][1];
      if (used > maxRequests) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      return next();
    }
  } catch (rateLimitErr) {
    log.warn('userRateLimit Redis check failed, using in-memory fallback', { error: rateLimitErr.message });
  }

  // In-memory fallback
  const entry = _rateLimitStore.get(key);
  const fresh = entry ? entry.filter(ts => now - ts < windowMs) : [];
  if (fresh.length >= maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  _rateLimitStore.set(key, [...fresh, now]);
  next();
};

// Twin ownership validation middleware
export const validateTwinOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false,
        error: 'Authentication required',
        message: 'User must be authenticated to access this resource'
      });
    }

    const twinId = req.params.id || req.body.twinId;

    if (!twinId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Twin ID is required'
      });
    }

    const { serverDb } = await import('../services/database.js');
    const twin = await serverDb.getTwin(twinId);

    if (!twin) {
      return res.status(404).json({
        error: 'Twin not found',
        message: 'The requested twin does not exist'
      });
    }

    if (twin.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this twin'
      });
    }

    req.twin = twin;
    next();
  } catch (error) {
    log.error('Twin ownership validation error', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate twin ownership'
    });
  }
};

// Alias for backward compatibility
export { authenticateUser as authenticateToken };
