/**
 * Enhanced useError Hook
 * Provides comprehensive error handling with retry mechanisms, categorization, and user-friendly messages
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { errorService, ErrorCategory } from '@/services/errorService';

export interface ErrorOptions {
  /**
   * Whether to show a toast notification (default: true)
   */
  showToast?: boolean;

  /**
   * Custom user-friendly error message
   */
  customMessage?: string;

  /**
   * Whether this error should be logged to the error service
   */
  logError?: boolean;

  /**
   * Error category for logging and analytics
   */
  category?: ErrorCategory;

  /**
   * Retry function to be called when user clicks retry
   */
  onRetry?: () => void | Promise<void>;

  /**
   * Additional context for error logging
   */
  context?: Record<string, any>;

  /**
   * Toast duration in milliseconds (default: 5000)
   */
  duration?: number;
}

export interface SuccessOptions {
  /**
   * Duration in milliseconds (default: 3000)
   */
  duration?: number;

  /**
   * Custom action button
   */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Enhanced error handling hook with retry mechanisms and user-friendly messages
 */
export function useError() {
  /**
   * Handle and display an error with optional retry mechanism
   */
  const handleError = useCallback((error: unknown, options: ErrorOptions = {}) => {
    const {
      showToast = true,
      customMessage,
      logError = true,
      category = 'unknown',
      onRetry,
      context,
      duration = 5000,
    } = options;

    // Get user-friendly error message
    const userMessage = customMessage || errorService.getUserMessage(error);

    // Log error if enabled
    if (logError) {
      errorService.logError(error, category, context);
    }

    // Show toast notification
    if (showToast) {
      if (onRetry) {
        toast.error(userMessage, {
          duration,
          action: {
            label: 'Retry',
            onClick: onRetry,
          },
        });
      } else {
        toast.error(userMessage, { duration });
      }
    }

    return userMessage;
  }, []);

  /**
   * Show a success message
   */
  const showSuccess = useCallback((message: string, options: SuccessOptions = {}) => {
    const { duration = 3000, action } = options;

    toast.success(message, {
      duration,
      ...(action && { action }),
    });
  }, []);

  /**
   * Show a warning message
   */
  const showWarning = useCallback((message: string, duration: number = 4000) => {
    toast.warning(message, { duration });
  }, []);

  /**
   * Show an info message
   */
  const showInfo = useCallback((message: string, duration: number = 3000) => {
    toast.info(message, { duration });
  }, []);

  /**
   * Handle authentication errors specifically
   */
  const handleAuthError = useCallback((error: unknown) => {
    const message = errorService.getUserMessage(error);
    errorService.logError(error, 'authentication');

    toast.error(message, {
      duration: 6000,
      action: {
        label: 'Sign In',
        onClick: () => {
          window.location.href = '/auth';
        },
      },
    });
  }, []);

  /**
   * Handle network errors with retry
   */
  const handleNetworkError = useCallback((error: unknown, onRetry?: () => void | Promise<void>) => {
    const message = errorService.getUserMessage(error);
    errorService.logError(error, 'network');

    toast.error(message, {
      duration: 6000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  }, []);

  /**
   * Handle permission errors
   */
  const handlePermissionError = useCallback((error: unknown, requiredPermission?: string) => {
    const message = requiredPermission
      ? `You don't have permission to ${requiredPermission}. Please contact support if you believe this is an error.`
      : errorService.getUserMessage(error);

    errorService.logError(error, 'permission', { requiredPermission });

    toast.error(message, { duration: 6000 });
  }, []);

  /**
   * Handle validation errors
   */
  const handleValidationError = useCallback((error: unknown, fieldName?: string) => {
    const message = fieldName
      ? `${fieldName} is invalid. Please check your input and try again.`
      : errorService.getUserMessage(error);

    toast.error(message, { duration: 4000 });
  }, []);

  /**
   * Show loading toast that can be updated
   */
  const showLoading = useCallback((message: string) => {
    return toast.loading(message);
  }, []);

  /**
   * Dismiss a specific toast
   */
  const dismissToast = useCallback((toastId: string | number) => {
    toast.dismiss(toastId);
  }, []);

  /**
   * Dismiss all toasts
   */
  const dismissAllToasts = useCallback(() => {
    toast.dismiss();
  }, []);

  return {
    handleError,
    showSuccess,
    showWarning,
    showInfo,
    handleAuthError,
    handleNetworkError,
    handlePermissionError,
    handleValidationError,
    showLoading,
    dismissToast,
    dismissAllToasts,
  };
}

/**
 * Hook for handling async operations with automatic error handling
 */
export function useAsyncError() {
  const { handleError, showSuccess } = useError();

  /**
   * Wraps an async function with error handling
   */
  const wrapAsync = useCallback(
    <T>(
      asyncFn: () => Promise<T>,
      options: {
        successMessage?: string;
        errorMessage?: string;
        category?: ErrorCategory;
        onRetry?: () => void | Promise<void>;
      } = {}
    ) => {
      return async (): Promise<T | null> => {
        try {
          const result = await asyncFn();

          if (options.successMessage) {
            showSuccess(options.successMessage);
          }

          return result;
        } catch (error) {
          handleError(error, {
            customMessage: options.errorMessage,
            category: options.category,
            onRetry: options.onRetry,
          });
          return null;
        }
      };
    },
    [handleError, showSuccess]
  );

  return { wrapAsync };
}
