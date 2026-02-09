/**
 * Extraction Error Handler
 * Categorizes and handles platform-specific errors
 */

export const ErrorCategory = {
  AUTH_EXPIRED: 'auth_expired',
  RATE_LIMITED: 'rate_limited',
  PERMISSION_DENIED: 'permission_denied',
  NOT_FOUND: 'not_found',
  SERVER_ERROR: 'server_error',
  NETWORK_ERROR: 'network_error',
  UNKNOWN: 'unknown'
};

export function categorizeError(error, platform) {
  const status = error.status || error.response?.status;
  const message = error.message?.toLowerCase() || error.error?.toLowerCase() || '';

  // Auth errors
  if (status === 401 || message.includes('unauthorized') || message.includes('token')) {
    return {
      category: ErrorCategory.AUTH_EXPIRED,
      userMessage: `Your ${platform} connection has expired. Please reconnect.`,
      action: 'reconnect',
      retryable: false
    };
  }

  // Rate limiting
  if (status === 429 || message.includes('rate limit')) {
    return {
      category: ErrorCategory.RATE_LIMITED,
      userMessage: `${platform} rate limit reached. We'll retry automatically.`,
      action: 'wait',
      retryable: true,
      retryAfter: error.response?.headers?.['retry-after'] || 60
    };
  }

  // Permission errors
  if (status === 403 || message.includes('forbidden') || message.includes('permission')) {
    return {
      category: ErrorCategory.PERMISSION_DENIED,
      userMessage: `${platform} requires additional permissions. Please reconnect with full access.`,
      action: 'reconnect_with_scopes',
      retryable: false
    };
  }

  // Not found
  if (status === 404) {
    return {
      category: ErrorCategory.NOT_FOUND,
      userMessage: `Data not available from ${platform}.`,
      action: 'skip',
      retryable: false
    };
  }

  // Server errors
  if (status >= 500 && status < 600) {
    return {
      category: ErrorCategory.SERVER_ERROR,
      userMessage: `${platform} is temporarily unavailable.`,
      action: 'retry',
      retryable: true
    };
  }

  // Network errors
  if (message.includes('network') || message.includes('econnrefused') || message.includes('timeout')) {
    return {
      category: ErrorCategory.NETWORK_ERROR,
      userMessage: `Could not connect to ${platform}.`,
      action: 'retry',
      retryable: true
    };
  }

  // Unknown
  return {
    category: ErrorCategory.UNKNOWN,
    userMessage: `An error occurred with ${platform}.`,
    action: 'log',
    retryable: false
  };
}

export function formatExtractionResult(platform, data, errors) {
  const hasData = Object.keys(data).length > 0;
  const hasErrors = errors.length > 0;

  return {
    platform,
    success: hasData && !hasErrors,
    partial: hasData && hasErrors,
    data,
    errors: errors.map(e => ({
      endpoint: e.endpoint,
      ...categorizeError(e.error, platform)
    })),
    extractedAt: new Date().toISOString()
  };
}

export default {
  ErrorCategory,
  categorizeError,
  formatExtractionResult
};
