import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createLogger } from '../services/logger.js';

const log = createLogger('Auth');

dotenv.config();

// Token blacklist helpers (Redis-backed, in-memory fallback)
const TOKEN_BLACKLIST_PREFIX = 'jwt:revoked:';
const inMemoryBlacklist = new Map();

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

// JWT secret from environment (required)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Authentication middleware for JWT tokens
export const authenticateUser = async (req, res, next) => {
  try {
    // Extract the authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log.warn('Missing authorization header', { path: req.path });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    // Extract the token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      log.warn('No token provided', { path: req.path });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }

    try {
      // Verify the JWT token
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

      // Check if token has been revoked (logout blacklist)
      if (await isTokenBlacklisted(token)) {
        return res.status(401).json({
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

      next();
    } catch (verifyError) {
      log.error('Token verification failed', { path: req.path, errorName: verifyError.name });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        tokenExpired: verifyError.name === 'TokenExpiredError',
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

      if (token) {
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
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  try {
    const { supabaseAdmin } = await import('../services/database.js');
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('role, user_type')
      .eq('id', req.user.id)
      .single();

    if (!dbUser) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const dbRole = dbUser.role || dbUser.user_type;
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

// Rate limiting middleware per user
export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next(); // Skip rate limiting for unauthenticated requests (they have global rate limiting)
    }

    const userId = req.user.id;
    const now = Date.now();
    const userRequests = requests.get(userId) || [];

    // Filter out old requests
    const recentRequests = userRequests.filter(timestamp => now - timestamp < windowMs);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.floor(windowMs / 60000)} minutes.`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    // Add current request (immutable — create new array rather than mutating)
    // Delete stale entry when window has fully lapsed to keep Map tidy
    if (recentRequests.length === 0 && requests.has(userId)) {
      requests.delete(userId);
    }
    requests.set(userId, [...recentRequests, now]);

    next();
  };
};

// Twin ownership validation middleware
export const validateTwinOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
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
