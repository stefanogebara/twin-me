/**
 * Privacy Filter Middleware
 *
 * Middleware to automatically filter API responses based on user privacy settings.
 * Applies cluster-based privacy filtering to protect user data.
 */

import privacyService from '../services/privacyService.js';

/**
 * Middleware to filter response data based on privacy settings
 * Usage: router.get('/endpoint', authenticateUser, applyPrivacyFilter('platform-name'), handler)
 */
export function applyPrivacyFilter(platformName, options = {}) {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override res.json to filter data before sending
    res.json = async function (data) {
      try {
        // Get user ID from authenticated request
        const userId = req.user?.id;

        if (!userId) {
          // No user, skip filtering
          return originalJson(data);
        }

        // Get audience context from query params or default to 'social'
        const audienceId = req.query.audience || options.defaultAudience || 'social';

        // Apply privacy filtering
        const filteredData = await privacyService.filterDataByPrivacy(
          userId,
          data,
          platformName,
          audienceId
        );

        // Add privacy metadata to response
        const responseWithMetadata = {
          ...filteredData,
          _privacy: {
            filtered: true,
            platform: platformName,
            audience: audienceId,
            appliedAt: new Date().toISOString()
          }
        };

        return originalJson(responseWithMetadata);
      } catch (error) {
        console.error('Error applying privacy filter:', error);
        // On error, return original data
        return originalJson(data);
      }
    };

    next();
  };
}

/**
 * Middleware to check if user has permission to access specific cluster data
 */
export function requireClusterAccess(clusterId, minPrivacyLevel = 1) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      const audienceId = req.query.audience || 'social';
      const effectiveLevel = await privacyService.getEffectivePrivacyLevel(
        userId,
        clusterId,
        audienceId
      );

      if (effectiveLevel < minPrivacyLevel) {
        return res.status(403).json({
          error: 'Access denied',
          message: `Privacy settings prevent access to ${clusterId} data`,
          requiredLevel: minPrivacyLevel,
          currentLevel: effectiveLevel
        });
      }

      // Store effective level in request for handler use
      req.privacyLevel = effectiveLevel;
      next();
    } catch (error) {
      console.error('Error checking cluster access:', error);
      res.status(500).json({
        error: 'Failed to check privacy permissions',
        details: error.message
      });
    }
  };
}

/**
 * Middleware to add privacy context to request
 */
export function addPrivacyContext() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (userId) {
        // Get user's privacy profile
        const result = await privacyService.getOrCreatePrivacyProfile(userId);

        if (result.success) {
          // Attach privacy profile to request
          req.privacyProfile = result.profile;

          // Helper function to check revelation
          req.shouldReveal = async (clusterId, sensitivity = 50, audience = 'social') => {
            return await privacyService.shouldRevealData(
              userId,
              clusterId,
              sensitivity,
              audience
            );
          };

          // Helper function to filter data
          req.filterByPrivacy = async (data, platformName, audience = 'social') => {
            return await privacyService.filterDataByPrivacy(
              userId,
              data,
              platformName,
              audience
            );
          };
        }
      }

      next();
    } catch (error) {
      console.error('Error adding privacy context:', error);
      next(); // Continue without privacy context on error
    }
  };
}

/**
 * Middleware to validate privacy level in request body
 */
export function validatePrivacyLevel() {
  return (req, res, next) => {
    const { privacyLevel, revelationLevel, globalPrivacy } = req.body;

    const levelToCheck = privacyLevel || revelationLevel || globalPrivacy;

    if (levelToCheck !== undefined) {
      const level = parseInt(levelToCheck);

      if (isNaN(level) || level < 0 || level > 100) {
        return res.status(400).json({
          error: 'Invalid privacy level',
          message: 'Privacy level must be a number between 0 and 100'
        });
      }

      // Normalize field name
      if (privacyLevel !== undefined) req.body.privacyLevel = level;
      if (revelationLevel !== undefined) req.body.revelationLevel = level;
      if (globalPrivacy !== undefined) req.body.globalPrivacy = level;
    }

    next();
  };
}

/**
 * Middleware to rate limit privacy setting changes
 */
export function rateLimitPrivacy() {
  const userUpdateCounts = new Map();
  const RATE_LIMIT = 100; // 100 updates per hour
  const WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

  return (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userKey = userId;

    // Get user's update history
    let userHistory = userUpdateCounts.get(userKey) || { count: 0, resetAt: now + WINDOW };

    // Reset if window has passed
    if (now >= userHistory.resetAt) {
      userHistory = { count: 0, resetAt: now + WINDOW };
    }

    // Check rate limit
    if (userHistory.count >= RATE_LIMIT) {
      const resetIn = Math.ceil((userHistory.resetAt - now) / 1000 / 60); // minutes
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `You can make ${RATE_LIMIT} privacy updates per hour. Please try again in ${resetIn} minutes.`,
        resetIn
      });
    }

    // Increment count
    userHistory.count++;
    userUpdateCounts.set(userKey, userHistory);

    next();
  };
}

/**
 * Middleware to log privacy-related actions
 */
export function logPrivacyAction(action) {
  return (req, res, next) => {
    const userId = req.user?.id;

    if (userId) {
      // Log the action asynchronously (don't block request)
      setImmediate(async () => {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          );

          await supabase.from('privacy_audit_log').insert({
            user_id: userId,
            action,
            metadata: {
              method: req.method,
              path: req.path,
              params: req.params,
              query: req.query,
              ip: req.ip,
              userAgent: req.headers['user-agent']
            },
            changed_at: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error logging privacy action:', error);
        }
      });
    }

    next();
  };
}

/**
 * Helper to get privacy summary for response headers
 */
export function addPrivacyHeaders() {
  return async (req, res, next) => {
    const userId = req.user?.id;

    if (userId) {
      try {
        const result = await privacyService.getPrivacyStats(userId);

        if (result.success) {
          res.setHeader('X-Privacy-Level', result.stats.averageRevelation);
          res.setHeader('X-Privacy-Global', result.stats.globalPrivacy);
        }
      } catch (error) {
        console.error('Error adding privacy headers:', error);
      }
    }

    next();
  };
}

/**
 * Express error handler for privacy-related errors
 */
export function handlePrivacyErrors(err, req, res, next) {
  if (err.name === 'PrivacyError' || err.type === 'privacy') {
    return res.status(err.statusCode || 403).json({
      error: err.message,
      type: 'privacy_error',
      details: err.details
    });
  }

  next(err);
}

export default {
  applyPrivacyFilter,
  requireClusterAccess,
  addPrivacyContext,
  validatePrivacyLevel,
  rateLimitPrivacy,
  logPrivacyAction,
  addPrivacyHeaders,
  handlePrivacyErrors
};
