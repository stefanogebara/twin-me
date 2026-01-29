/**
 * Platform Connection Validation Middleware
 * Validates platform connections before allowing soul extraction
 */

import { createClient } from '@supabase/supabase-js';
import {
  PlatformNotConnectedError,
  PlatformTokenExpiredError,
  ValidationError,
  UserNotFoundError,
  asyncHandler
} from './errors.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Supported platforms configuration
 */
export const SUPPORTED_PLATFORMS = {
  // Entertainment platforms
  spotify: { name: 'Spotify', category: 'entertainment', requiresAuth: true },
  netflix: { name: 'Netflix', category: 'entertainment', requiresAuth: false },
  youtube: { name: 'YouTube', category: 'entertainment', requiresAuth: true },
  discord: { name: 'Discord', category: 'social', requiresAuth: true },
  twitch: { name: 'Twitch', category: 'entertainment', requiresAuth: true },
  steam: { name: 'Steam', category: 'gaming', requiresAuth: false },

  // Professional platforms
  google_gmail: { name: 'Gmail', category: 'professional', requiresAuth: true },
  google_calendar: { name: 'Google Calendar', category: 'professional', requiresAuth: true },
  github: { name: 'GitHub', category: 'professional', requiresAuth: true },
  linkedin: { name: 'LinkedIn', category: 'professional', requiresAuth: true },
  slack: { name: 'Slack', category: 'professional', requiresAuth: true },

  // Social platforms
  reddit: { name: 'Reddit', category: 'social', requiresAuth: true },
  twitter: { name: 'Twitter/X', category: 'social', requiresAuth: true }
};

/**
 * Validates that userId is provided and exists
 */
export const validateUserId = asyncHandler(async (req, res, next) => {
  const userId = req.body?.userId || req.params?.userId || req.query?.userId;

  if (!userId) {
    throw new ValidationError([{
      field: 'userId',
      message: 'userId is required',
      value: null
    }], {
      suggestion: 'Include userId in request body, params, or query string'
    });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    throw new ValidationError([{
      field: 'userId',
      message: 'userId must be a valid UUID',
      value: userId
    }], {
      suggestion: 'Use the UUID format (e.g., 47f1efef-fca8-4a00-91b5-353ffdde5bc6)'
    });
  }

  // Check if user exists
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new UserNotFoundError(userId, {
      suggestion: 'Verify the user exists and the ID is correct'
    });
  }

  // Attach user to request for downstream middleware
  req.user = user;
  req.userId = userId;

  next();
});

/**
 * Validates that platform parameter is supported
 */
export const validatePlatform = (req, res, next) => {
  const platform = req.params?.platform || req.body?.platform;

  if (!platform) {
    throw new ValidationError([{
      field: 'platform',
      message: 'platform is required',
      value: null
    }], {
      supportedPlatforms: Object.keys(SUPPORTED_PLATFORMS),
      suggestion: 'Specify a platform from the supported list'
    });
  }

  const normalizedPlatform = platform.toLowerCase();

  if (!SUPPORTED_PLATFORMS[normalizedPlatform]) {
    throw new ValidationError([{
      field: 'platform',
      message: `Unsupported platform: ${platform}`,
      value: platform
    }], {
      supportedPlatforms: Object.keys(SUPPORTED_PLATFORMS),
      suggestion: 'Use one of the supported platforms'
    });
  }

  // Attach normalized platform to request
  req.platform = normalizedPlatform;
  req.platformConfig = SUPPORTED_PLATFORMS[normalizedPlatform];

  next();
};

/**
 * Validates that platform is connected for the user
 */
export const requirePlatformConnection = asyncHandler(async (req, res, next) => {
  const userId = req.userId;
  const platform = req.platform;
  const platformConfig = req.platformConfig;

  // Skip check if platform doesn't require auth
  if (!platformConfig.requiresAuth) {
    console.log(`⏭️ Skipping connection check for ${platform} (no auth required)`);
    return next();
  }

  // Check database for platform connection
  // Note: The 'connected' column doesn't exist - use 'status' column instead
  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'connected')
    .single();

  if (error || !connection) {
    throw new PlatformNotConnectedError(platform, userId, {
      availableActions: [
        'Connect the platform from the dashboard',
        'Skip this platform and try another one',
        'Use demo data for testing'
      ],
      howToConnect: `Navigate to /get-started and click "Connect" on the ${platformConfig.name} card`
    });
  }

  // Check if token is expired
  if (connection.token_expires_at) {
    const expiryDate = new Date(connection.token_expires_at);
    const now = new Date();

    if (expiryDate <= now) {
      throw new PlatformTokenExpiredError(platform, userId, {
        expiredAt: connection.token_expires_at,
        availableActions: [
          'Reconnect the platform to refresh the token',
          'Try again after reconnecting'
        ],
        howToReconnect: `Navigate to /get-started, disconnect ${platformConfig.name}, then connect it again`
      });
    }
  }

  // Attach connection to request
  req.platformConnection = connection;

  console.log(`✅ Platform connection validated for ${platform}`);
  next();
});

/**
 * Validates multiple platforms at once
 */
export const validateMultiplePlatforms = asyncHandler(async (req, res, next) => {
  const userId = req.userId;
  const platforms = req.body?.platforms;

  if (!platforms || !Array.isArray(platforms)) {
    throw new ValidationError([{
      field: 'platforms',
      message: 'platforms array is required',
      value: platforms
    }], {
      example: { platforms: ['spotify', 'github', 'discord'] },
      suggestion: 'Provide an array of platform names'
    });
  }

  if (platforms.length === 0) {
    throw new ValidationError([{
      field: 'platforms',
      message: 'At least one platform must be specified',
      value: []
    }], {
      suggestion: 'Add at least one platform to the array'
    });
  }

  // Validate each platform
  const invalidPlatforms = platforms.filter(p => !SUPPORTED_PLATFORMS[p?.toLowerCase()]);

  if (invalidPlatforms.length > 0) {
    throw new ValidationError([{
      field: 'platforms',
      message: `Unsupported platforms: ${invalidPlatforms.join(', ')}`,
      value: invalidPlatforms
    }], {
      supportedPlatforms: Object.keys(SUPPORTED_PLATFORMS),
      suggestion: 'Remove unsupported platforms from the array'
    });
  }

  // Check which platforms are connected
  const normalizedPlatforms = platforms.map(p => p.toLowerCase());

  const { data: connections, error } = await supabase
    .from('platform_connections')
    .select('platform, connected_at, token_expires_at, status')
    .eq('user_id', userId)
    .in('platform', normalizedPlatforms)
    .eq('status', 'connected');

  if (error) {
    console.error('Error checking platform connections:', error);
  }

  const connectedPlatforms = connections?.map(c => c.platform) || [];
  const disconnectedPlatforms = normalizedPlatforms.filter(p => {
    const config = SUPPORTED_PLATFORMS[p];
    return config.requiresAuth && !connectedPlatforms.includes(p);
  });

  // Attach connection info to request
  req.connectedPlatforms = connectedPlatforms;
  req.disconnectedPlatforms = disconnectedPlatforms;
  req.platformConnections = connections || [];

  // Don't throw error, just warn - allow partial extraction
  if (disconnectedPlatforms.length > 0) {
    console.warn(`⚠️ Some platforms not connected: ${disconnectedPlatforms.join(', ')}`);
  }

  next();
});

/**
 * Validates request body has required fields
 */
export const validateRequestBody = (requiredFields = []) => {
  return (req, res, next) => {
    const errors = [];

    for (const field of requiredFields) {
      if (!req.body || req.body[field] === undefined || req.body[field] === null) {
        errors.push({
          field,
          message: `${field} is required`,
          value: null
        });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors, {
        requiredFields,
        suggestion: 'Include all required fields in request body'
      });
    }

    next();
  };
};

/**
 * Validates query parameters
 */
export const validateQueryParams = (requiredParams = []) => {
  return (req, res, next) => {
    const errors = [];

    for (const param of requiredParams) {
      if (!req.query || req.query[param] === undefined || req.query[param] === null) {
        errors.push({
          field: param,
          message: `${param} query parameter is required`,
          value: null
        });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors, {
        requiredParams,
        suggestion: 'Include all required query parameters'
      });
    }

    next();
  };
};
