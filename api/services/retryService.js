/**
 * Retry Service
 * Provides exponential backoff retry logic for API calls
 */

export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryableStatuses = [408, 429, 500, 502, 503, 504],
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const status = error.response?.status || error.status;
      const isRetryable = retryableStatuses.includes(status) || !status;

      if (attempt === maxRetries || !isRetryable) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);

      if (onRetry) {
        onRetry(attempt, error, delay);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default { withRetry };
