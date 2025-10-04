// Comprehensive error handling middleware for authentication and general errors

class AuthError extends Error {
  constructor(message, code, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

class ValidationError extends Error {
  constructor(message, details = [], statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.statusCode = statusCode;
  }
}

class DatabaseError extends Error {
  constructor(message, originalError, statusCode = 500) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
    this.statusCode = statusCode;
  }
}

// Authentication error handling
const handleAuthError = (error, req, res, next) => {
  // Handle Clerk-specific errors
  if (error.name === 'ClerkAPIError' || error.code?.startsWith('clerk_')) {
    const errorMap = {
      'session_token_not_found': {
        message: 'Please sign in to continue',
        code: 'AUTH_REQUIRED',
        statusCode: 401
      },
      'session_token_invalid': {
        message: 'Your session has expired. Please sign in again',
        code: 'SESSION_EXPIRED',
        statusCode: 401
      },
      'session_token_expired': {
        message: 'Your session has expired. Please sign in again',
        code: 'SESSION_EXPIRED',
        statusCode: 401
      },
      'invalid_authorization_header': {
        message: 'Invalid authorization format. Please sign in again',
        code: 'INVALID_AUTH_HEADER',
        statusCode: 401
      },
      'unauthorized': {
        message: 'Access denied. Please check your permissions',
        code: 'ACCESS_DENIED',
        statusCode: 403
      }
    };

    const errorInfo = errorMap[error.code] || {
      message: 'Authentication failed. Please sign in again',
      code: 'AUTH_FAILED',
      statusCode: 401
    };

    return res.status(errorInfo.statusCode).json({
      error: errorInfo.code,
      message: errorInfo.message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      ...(process.env.NODE_ENV === 'development' && {
        originalError: error.message,
        stack: error.stack
      })
    });
  }

  // Handle custom auth errors
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }

  next(error);
};

// General error handler
const handleGeneralError = (error, req, res, next) => {
  console.error(`Error ${req.method} ${req.originalUrl}:`, {
    message: error.message,
    stack: error.stack,
    user: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString()
  });

  // Handle validation errors
  if (error instanceof ValidationError) {
    return res.status(error.statusCode).json({
      error: 'VALIDATION_ERROR',
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }

  // Handle database errors
  if (error instanceof DatabaseError) {
    return res.status(error.statusCode).json({
      error: 'DATABASE_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? error.message
        : 'A database error occurred',
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      ...(process.env.NODE_ENV === 'development' && {
        originalError: error.originalError?.message,
        stack: error.stack
      })
    });
  }

  // Handle rate limiting errors
  if (error.status === 429 || error.statusCode === 429) {
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: error.retryAfter || 60,
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }

  // Handle CORS errors
  if (error.message && error.message.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS_ERROR',
      message: 'Cross-origin request not allowed',
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }

  // Handle JSON parsing errors
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Invalid JSON format in request body',
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }

  // Handle file size errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      message: 'File size exceeds the maximum allowed limit',
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    });
  }

  // Handle unknown/generic errors
  const statusCode = error.statusCode || error.status || 500;

  res.status(statusCode).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development'
      ? error.message
      : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack
    })
  });
};

// Async error wrapper to catch async errors
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for non-existent endpoints
const handle404 = (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `The requested endpoint ${req.method} ${req.originalUrl} was not found`,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    availableEndpoints: {
      '/api/health': 'GET - Health check',
      '/api/ai/chat': 'POST - AI chat',
      '/api/twins': 'GET, POST - Digital twins',
      '/api/twins/:id': 'GET, PUT, DELETE - Specific twin',
      '/api/conversations': 'GET, POST - Conversations',
      '/api/documents': 'POST - Document upload',
      '/api/voice': 'POST - Voice generation',
      '/api/dashboard/stats': 'GET - Dashboard statistics',
      '/api/dashboard/activity': 'GET - Recent activity',
      '/api/training/status': 'GET - Training status',
      '/api/training/start': 'POST - Start training',
      '/api/training/stop': 'POST - Stop training',
      '/api/training/reset': 'POST - Reset model'
    }
  });
};

// Success response helper
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

// Error response helper
const errorResponse = (res, error, message, statusCode = 500, details = null) => {
  res.status(statusCode).json({
    success: false,
    error: error || 'UNKNOWN_ERROR',
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString()
  });
};

export {
  AuthError,
  ValidationError,
  DatabaseError,
  handleAuthError,
  handleGeneralError,
  asyncHandler,
  handle404,
  successResponse,
  errorResponse
};