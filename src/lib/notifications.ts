/**
 * Toast Notification Helpers
 * Pre-configured toast notifications for common scenarios
 */

import { toast } from 'sonner';

/**
 * Success notifications
 */
export const successNotifications = {
  /**
   * Platform connection successful
   */
  platformConnected: (platformName: string) => {
    toast.success(`${platformName} connected successfully!`, {
      description: 'Your data will be synced shortly.',
      duration: 4000,
    });
  },

  /**
   * Platform disconnection successful
   */
  platformDisconnected: (platformName: string) => {
    toast.success(`${platformName} disconnected`, {
      description: 'Your connection has been removed.',
      duration: 3000,
    });
  },

  /**
   * Data extraction completed
   */
  extractionComplete: (platformName: string, dataPoints: number) => {
    toast.success('Data extraction complete!', {
      description: `Extracted ${dataPoints} data points from ${platformName}.`,
      duration: 4000,
    });
  },

  /**
   * Soul signature updated
   */
  soulSignatureUpdated: () => {
    toast.success('Soul signature updated!', {
      description: 'Your digital twin has been refreshed with new data.',
      duration: 4000,
    });
  },

  /**
   * Privacy settings saved
   */
  privacySettingsSaved: () => {
    toast.success('Privacy settings saved', {
      description: 'Your revelation preferences have been updated.',
      duration: 3000,
    });
  },

  /**
   * Training started
   */
  trainingStarted: () => {
    toast.success('Training started!', {
      description: 'Your digital twin is learning from your data.',
      duration: 4000,
    });
  },

  /**
   * Training completed
   */
  trainingCompleted: () => {
    toast.success('Training complete!', {
      description: 'Your digital twin is now ready to chat.',
      duration: 5000,
    });
  },

  /**
   * Profile saved
   */
  profileSaved: () => {
    toast.success('Profile saved', {
      description: 'Your changes have been saved successfully.',
      duration: 3000,
    });
  },

  /**
   * Generic save success
   */
  saved: (itemName: string = 'Changes') => {
    toast.success(`${itemName} saved successfully`, {
      duration: 3000,
    });
  },

  /**
   * Generic creation success
   */
  created: (itemName: string) => {
    toast.success(`${itemName} created successfully`, {
      duration: 3000,
    });
  },

  /**
   * Generic deletion success
   */
  deleted: (itemName: string) => {
    toast.success(`${itemName} deleted successfully`, {
      duration: 3000,
    });
  },
};

/**
 * Error notifications
 */
export const errorNotifications = {
  /**
   * Platform connection failed
   */
  platformConnectionFailed: (platformName: string, onRetry?: () => void) => {
    toast.error(`Failed to connect to ${platformName}`, {
      description: 'Please check your credentials and try again.',
      duration: 5000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  },

  /**
   * Data extraction failed
   */
  extractionFailed: (platformName: string, onRetry?: () => void) => {
    toast.error(`Failed to extract data from ${platformName}`, {
      description: 'There was a problem accessing your data. Please try again.',
      duration: 5000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  },

  /**
   * Authentication expired
   */
  authenticationExpired: () => {
    toast.error('Session expired', {
      description: 'Please sign in again to continue.',
      duration: 6000,
      action: {
        label: 'Sign In',
        onClick: () => {
          window.location.href = '/auth';
        },
      },
    });
  },

  /**
   * Network error
   */
  networkError: (onRetry?: () => void) => {
    toast.error('Connection failed', {
      description: 'Please check your internet connection and try again.',
      duration: 5000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  },

  /**
   * Rate limit exceeded
   */
  rateLimitExceeded: (retryAfterSeconds?: number) => {
    const description = retryAfterSeconds
      ? `Please wait ${retryAfterSeconds} seconds before trying again.`
      : "You're doing that too often. Please wait a moment.";

    toast.error('Rate limit exceeded', {
      description,
      duration: 6000,
    });
  },

  /**
   * Permission denied
   */
  permissionDenied: (action?: string) => {
    const description = action
      ? `You don't have permission to ${action}.`
      : "You don't have permission to perform this action.";

    toast.error('Permission denied', {
      description,
      duration: 5000,
    });
  },

  /**
   * Validation error
   */
  validationError: (message: string) => {
    toast.error('Validation error', {
      description: message,
      duration: 4000,
    });
  },

  /**
   * Save failed
   */
  saveFailed: (itemName: string = 'Changes', onRetry?: () => void) => {
    toast.error(`Failed to save ${itemName.toLowerCase()}`, {
      description: 'Please try again.',
      duration: 4000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  },

  /**
   * Load failed
   */
  loadFailed: (itemName: string, onRetry?: () => void) => {
    toast.error(`Failed to load ${itemName.toLowerCase()}`, {
      description: 'Please try again.',
      duration: 4000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  },

  /**
   * Generic error
   */
  generic: (message: string, onRetry?: () => void) => {
    toast.error('Error', {
      description: message,
      duration: 5000,
      ...(onRetry && {
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      }),
    });
  },
};

/**
 * Warning notifications
 */
export const warningNotifications = {
  /**
   * Platform token expiring soon
   */
  tokenExpiringSoon: (platformName: string) => {
    toast.warning(`${platformName} connection will expire soon`, {
      description: 'Please reconnect to continue syncing your data.',
      duration: 6000,
      action: {
        label: 'Reconnect',
        onClick: () => {
          window.location.href = '/platform-hub';
        },
      },
    });
  },

  /**
   * Incomplete profile
   */
  incompleteProfile: () => {
    toast.warning('Profile incomplete', {
      description: 'Complete your profile to get the most out of your soul signature.',
      duration: 5000,
      action: {
        label: 'Complete',
        onClick: () => {
          window.location.href = '/settings';
        },
      },
    });
  },

  /**
   * Low data quality
   */
  lowDataQuality: (platformName: string) => {
    toast.warning('Limited data available', {
      description: `${platformName} has limited data. Connect more platforms for better insights.`,
      duration: 5000,
    });
  },

  /**
   * Training required
   */
  trainingRequired: () => {
    toast.warning('Training required', {
      description: 'Train your digital twin before starting a conversation.',
      duration: 5000,
      action: {
        label: 'Start Training',
        onClick: () => {
          window.location.href = '/training';
        },
      },
    });
  },

  /**
   * Generic warning
   */
  generic: (message: string) => {
    toast.warning('Warning', {
      description: message,
      duration: 4000,
    });
  },
};

/**
 * Info notifications
 */
export const infoNotifications = {
  /**
   * Sync in progress
   */
  syncInProgress: (platformName: string) => {
    return toast.loading(`Syncing ${platformName}...`, {
      description: 'This may take a few moments.',
    });
  },

  /**
   * Processing data
   */
  processingData: () => {
    return toast.loading('Processing your data...', {
      description: 'Analyzing patterns and extracting insights.',
    });
  },

  /**
   * Training in progress
   */
  trainingInProgress: (progress?: number) => {
    const description = progress
      ? `Training progress: ${progress}%`
      : 'This may take several minutes.';

    return toast.loading('Training your digital twin...', {
      description,
    });
  },

  /**
   * Generic info
   */
  generic: (message: string) => {
    toast.info('Info', {
      description: message,
      duration: 4000,
    });
  },

  /**
   * Feature coming soon
   */
  comingSoon: (featureName: string) => {
    toast.info('Coming soon!', {
      description: `${featureName} will be available in a future update.`,
      duration: 4000,
    });
  },
};

/**
 * Promise-based notifications (for async operations)
 */
export const promiseNotifications = {
  /**
   * Wrap an async operation with loading/success/error toasts
   */
  async: <T>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, {
      loading,
      success: (data) => (typeof success === 'function' ? success(data) : success),
      error: (err) => (typeof error === 'function' ? error(err) : error),
    });
  },
};

/**
 * Dismiss toasts
 */
export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

export const dismissAllToasts = () => {
  toast.dismiss();
};
