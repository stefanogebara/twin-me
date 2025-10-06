/**
 * Custom Error Classes for Soul Signature Platform
 * Provides specific error types for better error handling and user feedback
 */

/**
 * Base class for all platform-related errors
 */
export class PlatformError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      errorType: this.name,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Error thrown when a required platform is not connected
 */
export class PlatformNotConnectedError extends PlatformError {
  constructor(platform, userId, details = {}) {
    const message = `Platform "${platform}" is not connected for this user. Please connect it first.`;
    super(message, 404, {
      platform,
      userId,
      action: 'connect_platform',
      connectUrl: `/get-started?platform=${platform}`,
      ...details
    });
  }
}

/**
 * Error thrown when a platform token is expired or invalid
 */
export class PlatformTokenExpiredError extends PlatformError {
  constructor(platform, userId, details = {}) {
    const message = `Access token for "${platform}" has expired. Please reconnect the platform.`;
    super(message, 401, {
      platform,
      userId,
      action: 'reconnect_platform',
      reconnectUrl: `/get-started?platform=${platform}`,
      ...details
    });
  }
}

/**
 * Error thrown when platform API returns an error
 */
export class PlatformAPIError extends PlatformError {
  constructor(platform, apiError, statusCode = 500, details = {}) {
    const message = `Platform API error for "${platform}": ${apiError}`;
    super(message, statusCode, {
      platform,
      apiError,
      action: 'retry_later',
      ...details
    });
  }
}

/**
 * Error thrown when user has insufficient data for soul extraction
 */
export class InsufficientDataError extends PlatformError {
  constructor(platform, minRequired, currentCount, details = {}) {
    const message = `Insufficient data from "${platform}". Need at least ${minRequired} data points, but found ${currentCount}.`;
    super(message, 400, {
      platform,
      minRequired,
      currentCount,
      action: 'collect_more_data',
      suggestion: `Use "${platform}" more to generate enough data for analysis.`,
      ...details
    });
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends PlatformError {
  constructor(errors, details = {}) {
    const message = 'Request validation failed';
    super(message, 400, {
      errors: Array.isArray(errors) ? errors : [errors],
      action: 'fix_validation_errors',
      ...details
    });
  }
}

/**
 * Error thrown when user is not found
 */
export class UserNotFoundError extends PlatformError {
  constructor(userId, details = {}) {
    const message = `User not found: ${userId}`;
    super(message, 404, {
      userId,
      action: 'verify_user_id',
      ...details
    });
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends PlatformError {
  constructor(platform, retryAfter, details = {}) {
    const message = `Rate limit exceeded for "${platform}". Please try again later.`;
    super(message, 429, {
      platform,
      retryAfter,
      action: 'retry_after_delay',
      ...details
    });
  }
}

/**
 * Global error handler middleware for Express
 * Must be placed after all routes
 */
export function errorHandler(err, req, res, next) {
  // Log error for debugging
  console.error('❌ Error caught by handler:', {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
    userId: req.body?.userId || req.query?.userId || 'unknown',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Handle custom platform errors
  if (err instanceof PlatformError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Supabase errors
  if (err.code && err.code.startsWith('PGRST')) {
    return res.status(400).json({
      success: false,
      error: 'Database query error',
      errorType: 'DatabaseError',
      statusCode: 400,
      details: {
        code: err.code,
        message: err.message,
        action: 'check_database_schema'
      },
      timestamp: new Date().toISOString()
    });
  }

  // Handle validation errors from express-validator
  if (err.errors && Array.isArray(err.errors)) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errorType: 'ValidationError',
      statusCode: 400,
      details: {
        errors: err.errors,
        action: 'fix_validation_errors'
      },
      timestamp: new Date().toISOString()
    });
  }

  // Handle generic errors
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    errorType: err.name || 'Error',
    statusCode,
    details: {
      action: 'contact_support'
    },
    timestamp: new Date().toISOString(),
    // Include stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404 Not Found handler
 * Must be placed after all routes but before error handler
 */
export function notFoundHandler(req, res, next) {
  const error = new PlatformError(
    `Route not found: ${req.method} ${req.path}`,
    404,
    {
      method: req.method,
      path: req.path,
      action: 'check_api_documentation',
      suggestion: 'Verify the endpoint URL is correct'
    }
  );

  res.status(404).json(error.toJSON());
}

/**
 * Async error wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
