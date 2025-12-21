/**
 * Error Service
 * Centralized error handling, logging, and categorization
 */

export type ErrorCategory =
  | 'authentication'
  | 'network'
  | 'validation'
  | 'permission'
  | 'rate_limit'
  | 'platform_api'
  | 'database'
  | 'unknown';

export interface ErrorLog {
  id: string;
  timestamp: Date;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  userAgent: string;
  url: string;
}

class ErrorService {
  private errorLogs: ErrorLog[] = [];
  private maxLogs = 100; // Keep last 100 errors in memory

  /**
   * Log an error with context
   */
  logError(error: unknown, category: ErrorCategory = 'unknown', context?: Record<string, any>): void {
    const errorLog: ErrorLog = {
      id: this.generateId(),
      timestamp: new Date(),
      category,
      message: this.extractMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Add to in-memory logs
    this.errorLogs.push(errorLog);

    // Keep only last maxLogs entries
    if (this.errorLogs.length > this.maxLogs) {
      this.errorLogs = this.errorLogs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorService]', {
        category,
        message: errorLog.message,
        context,
        stack: errorLog.stack,
      });
    }

    // TODO: Send to external logging service (e.g., Sentry, LogRocket)
    // this.sendToExternalService(errorLog);
  }

  /**
   * Get user-friendly error message based on error type
   */
  getUserMessage(error: unknown): string {
    const errorMessage = this.extractMessage(error);
    const lowerMessage = errorMessage.toLowerCase();

    // Network errors
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
      return 'Connection failed. Please check your internet connection and try again.';
    }

    // Authentication errors
    if (
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('token') ||
      lowerMessage.includes('authentication')
    ) {
      return 'Your session has expired. Please sign in again.';
    }

    // Permission errors
    if (
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('403') ||
      lowerMessage.includes('permission')
    ) {
      return "You don't have permission to perform this action.";
    }

    // Rate limiting
    if (
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('429') ||
      lowerMessage.includes('too many requests')
    ) {
      return "You're doing that too often. Please wait a moment and try again.";
    }

    // Validation errors
    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
      return 'Please check your input and try again.';
    }

    // Server errors
    if (lowerMessage.includes('500') || lowerMessage.includes('server error')) {
      return 'Our servers are having trouble. Please try again in a few moments.';
    }

    // Not found
    if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
      return 'The requested resource was not found.';
    }

    // Platform API errors
    if (
      lowerMessage.includes('spotify') ||
      lowerMessage.includes('youtube') ||
      lowerMessage.includes('netflix') ||
      lowerMessage.includes('oauth')
    ) {
      return 'Unable to connect to the platform. Please try reconnecting your account.';
    }

    // Database errors
    if (
      lowerMessage.includes('database') ||
      lowerMessage.includes('supabase') ||
      lowerMessage.includes('postgres')
    ) {
      return 'Failed to save your data. Please try again.';
    }

    // Generic fallback with the actual error message if it's user-friendly
    if (errorMessage.length < 100 && !errorMessage.includes('Error:')) {
      return errorMessage;
    }

    // Ultimate fallback
    return 'Something went wrong. Please try again or contact support if the problem persists.';
  }

  /**
   * Categorize error automatically based on error content
   */
  categorizeError(error: unknown): ErrorCategory {
    const message = this.extractMessage(error).toLowerCase();

    if (message.includes('unauthorized') || message.includes('401') || message.includes('token')) {
      return 'authentication';
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'network';
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }

    if (message.includes('forbidden') || message.includes('403') || message.includes('permission')) {
      return 'permission';
    }

    if (message.includes('rate limit') || message.includes('429')) {
      return 'rate_limit';
    }

    if (
      message.includes('spotify') ||
      message.includes('youtube') ||
      message.includes('oauth') ||
      message.includes('platform')
    ) {
      return 'platform_api';
    }

    if (message.includes('database') || message.includes('supabase')) {
      return 'database';
    }

    return 'unknown';
  }

  /**
   * Get all error logs
   */
  getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs];
  }

  /**
   * Get error logs by category
   */
  getErrorLogsByCategory(category: ErrorCategory): ErrorLog[] {
    return this.errorLogs.filter((log) => log.category === category);
  }

  /**
   * Clear all error logs
   */
  clearLogs(): void {
    this.errorLogs = [];
  }

  /**
   * Export error logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.errorLogs, null, 2);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error: unknown): boolean {
    const message = this.extractMessage(error).toLowerCase();

    // Network errors are retryable
    if (message.includes('network') || message.includes('fetch')) {
      return true;
    }

    // Rate limit errors are retryable (after waiting)
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    // Server errors are retryable
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }

    // Timeout errors are retryable
    if (message.includes('timeout')) {
      return true;
    }

    // Auth errors are not retryable without re-authentication
    if (message.includes('401') || message.includes('unauthorized')) {
      return false;
    }

    // Permission errors are not retryable
    if (message.includes('403') || message.includes('forbidden')) {
      return false;
    }

    // Validation errors are not retryable without fixing input
    if (message.includes('validation') || message.includes('invalid')) {
      return false;
    }

    return false;
  }

  /**
   * Extract error message from various error types
   */
  private extractMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      if ('message' in error && typeof error.message === 'string') {
        return error.message;
      }

      if ('error' in error && typeof error.error === 'string') {
        return error.error;
      }

      if ('statusText' in error && typeof error.statusText === 'string') {
        return error.statusText;
      }
    }

    return 'An unknown error occurred';
  }

  /**
   * Generate unique error ID
   */
  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    recent: number; // Last hour
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const byCategory: Record<ErrorCategory, number> = {
      authentication: 0,
      network: 0,
      validation: 0,
      permission: 0,
      rate_limit: 0,
      platform_api: 0,
      database: 0,
      unknown: 0,
    };

    let recentCount = 0;

    this.errorLogs.forEach((log) => {
      byCategory[log.category]++;
      if (log.timestamp.getTime() > oneHourAgo) {
        recentCount++;
      }
    });

    return {
      total: this.errorLogs.length,
      byCategory,
      recent: recentCount,
    };
  }
}

// Export singleton instance
export const errorService = new ErrorService();

// Export for use in error boundaries
export default errorService;
