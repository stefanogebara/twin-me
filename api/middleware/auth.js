import { clerkClient } from '@clerk/clerk-sdk-node';
import dotenv from 'dotenv';

dotenv.config();

// Authentication middleware for Clerk
export const authenticateUser = async (req, res, next) => {
  try {
    // Extract the authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    // Extract the token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }

    try {
      // Verify the JWT token with Clerk
      const payload = await clerkClient.verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });

      // Add user info to request
      req.user = {
        id: payload.sub,
        sessionId: payload.sid,
        ...payload
      };

      next();
    } catch (verifyError) {
      console.error('Token verification failed:', verifyError);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

  } catch (error) {
    console.error('Authentication middleware error:', error);
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
          const payload = await clerkClient.verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY
          });

          req.user = {
            id: payload.sub,
            sessionId: payload.sid,
            ...payload
          };
        } catch (verifyError) {
          // For optional auth, we don't fail on invalid tokens
          console.warn('Optional auth token verification failed:', verifyError.message);
        }
      }
    }

    next();
  } catch (error) {
    console.error('Optional authentication middleware error:', error);
    next(); // Continue without authentication for optional auth
  }
};

// Admin/Professor role check middleware
export const requireProfessor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // Check if user has professor role (you may need to adjust based on your Clerk setup)
  const userRoles = req.user.publicMetadata?.roles || [];
  const isProfessor = userRoles.includes('professor') || userRoles.includes('admin');

  if (!isProfessor) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Professor role required'
    });
  }

  next();
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

    // Add current request
    recentRequests.push(now);
    requests.set(userId, recentRequests);

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
    console.error('Twin ownership validation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate twin ownership'
    });
  }
};