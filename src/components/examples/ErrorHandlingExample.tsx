/**
 * Error Handling Example Component
 * Demonstrates how to use the comprehensive error handling system
 *
 * This file serves as a reference implementation and can be removed in production
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useError, useAsyncError } from '@/hooks/useError';
import {
  successNotifications,
  errorNotifications,
  warningNotifications,
  promiseNotifications,
} from '@/lib/notifications';
import { dashboardAPI } from '@/services/apiService';
import { errorService } from '@/services/errorService';

export default function ErrorHandlingExample() {
  const [loading, setLoading] = useState(false);
  const {
    handleError,
    showSuccess,
    handleNetworkError,
    handleAuthError,
    handleValidationError
  } = useError();
  const { wrapAsync } = useAsyncError();

  // Example 1: Basic error handling with custom message
  const handleBasicError = () => {
    try {
      throw new Error('Something went wrong!');
    } catch (error) {
      handleError(error, {
        customMessage: 'Failed to perform action. Please try again.',
        category: 'unknown',
      });
    }
  };

  // Example 2: Network error with retry
  const handleNetworkErrorExample = () => {
    const retryFn = () => {
      console.log('Retrying network request...');
      handleNetworkErrorExample();
    };

    try {
      throw new Error('Network request failed');
    } catch (error) {
      handleNetworkError(error, retryFn);
    }
  };

  // Example 3: Authentication error
  const handleAuthErrorExample = () => {
    try {
      throw new Error('401 Unauthorized');
    } catch (error) {
      handleAuthError(error);
    }
  };

  // Example 4: Validation error
  const handleValidationErrorExample = () => {
    handleValidationError('Email format is invalid', 'Email');
  };

  // Example 5: Using pre-configured success notification
  const handleSuccessNotification = () => {
    successNotifications.platformConnected('Spotify');
  };

  // Example 6: Using pre-configured error notification with retry
  const handleErrorNotificationWithRetry = () => {
    errorNotifications.platformConnectionFailed('YouTube', () => {
      console.log('Retrying platform connection...');
    });
  };

  // Example 7: Warning notification
  const handleWarningNotification = () => {
    warningNotifications.tokenExpiringSoon('Netflix');
  };

  // Example 8: Promise-based notification (automatic loading/success/error)
  const handlePromiseNotification = async () => {
    const mockApiCall = () =>
      new Promise((resolve) => setTimeout(() => resolve('Data loaded!'), 2000));

    await promiseNotifications.async(mockApiCall(), {
      loading: 'Loading your data...',
      success: 'Data loaded successfully!',
      error: 'Failed to load data',
    });
  };

  // Example 9: Using useAsyncError hook
  const handleAsyncOperation = wrapAsync(
    async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Simulate random success/failure
      if (Math.random() > 0.5) {
        throw new Error('Random failure');
      }
      setLoading(false);
    },
    {
      successMessage: 'Async operation completed!',
      errorMessage: 'Async operation failed',
      category: 'network',
      onRetry: handleAsyncOperation,
    }
  );

  // Example 10: API call with automatic retry
  const handleApiCallWithRetry = async () => {
    try {
      const stats = await dashboardAPI.getStats();
      showSuccess('Dashboard stats loaded successfully!');
      console.log('Stats:', stats);
    } catch (error) {
      handleError(error, {
        customMessage: 'Failed to load dashboard stats',
        onRetry: handleApiCallWithRetry,
      });
    }
  };

  // Example 11: View error logs
  const handleViewErrorLogs = () => {
    const logs = errorService.getErrorLogs();
    const stats = errorService.getErrorStats();

    console.log('Error Logs:', logs);
    console.log('Error Stats:', stats);

    showSuccess(`Found ${stats.total} errors (${stats.recent} in last hour)`);
  };

  // Example 12: Clear error logs
  const handleClearErrorLogs = () => {
    errorService.clearLogs();
    showSuccess('Error logs cleared');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Error Handling Examples</h1>
        <p className="text-muted-foreground">
          Reference implementation for the comprehensive error handling system
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Error Handling */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Error Handling</CardTitle>
            <CardDescription>
              Simple error with custom message
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleBasicError} variant="outline" className="w-full">
              Trigger Basic Error
            </Button>
          </CardContent>
        </Card>

        {/* Network Error with Retry */}
        <Card>
          <CardHeader>
            <CardTitle>Network Error with Retry</CardTitle>
            <CardDescription>
              Network error with retry button
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleNetworkErrorExample} variant="outline" className="w-full">
              Trigger Network Error
            </Button>
          </CardContent>
        </Card>

        {/* Authentication Error */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication Error</CardTitle>
            <CardDescription>
              Shows session expired message with sign-in action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAuthErrorExample} variant="outline" className="w-full">
              Trigger Auth Error
            </Button>
          </CardContent>
        </Card>

        {/* Validation Error */}
        <Card>
          <CardHeader>
            <CardTitle>Validation Error</CardTitle>
            <CardDescription>
              Form validation error message
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleValidationErrorExample} variant="outline" className="w-full">
              Trigger Validation Error
            </Button>
          </CardContent>
        </Card>

        {/* Success Notification */}
        <Card>
          <CardHeader>
            <CardTitle>Success Notification</CardTitle>
            <CardDescription>
              Pre-configured success message
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSuccessNotification} variant="default" className="w-full">
              Show Success
            </Button>
          </CardContent>
        </Card>

        {/* Error Notification with Retry */}
        <Card>
          <CardHeader>
            <CardTitle>Error with Retry Action</CardTitle>
            <CardDescription>
              Pre-configured error with retry button
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleErrorNotificationWithRetry} variant="outline" className="w-full">
              Show Error with Retry
            </Button>
          </CardContent>
        </Card>

        {/* Warning Notification */}
        <Card>
          <CardHeader>
            <CardTitle>Warning Notification</CardTitle>
            <CardDescription>
              Pre-configured warning message
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleWarningNotification} variant="outline" className="w-full">
              Show Warning
            </Button>
          </CardContent>
        </Card>

        {/* Promise Notification */}
        <Card>
          <CardHeader>
            <CardTitle>Promise Notification</CardTitle>
            <CardDescription>
              Automatic loading/success/error for async ops
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handlePromiseNotification} variant="outline" className="w-full">
              Start Async Operation
            </Button>
          </CardContent>
        </Card>

        {/* Async Error Hook */}
        <Card>
          <CardHeader>
            <CardTitle>useAsyncError Hook</CardTitle>
            <CardDescription>
              Wrapped async with automatic error handling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleAsyncOperation}
              variant="outline"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Random Success/Failure'}
            </Button>
          </CardContent>
        </Card>

        {/* API Call with Retry */}
        <Card>
          <CardHeader>
            <CardTitle>API Call with Auto Retry</CardTitle>
            <CardDescription>
              Automatic retry on failure (up to 3 times)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleApiCallWithRetry} variant="outline" className="w-full">
              Load Dashboard Stats
            </Button>
          </CardContent>
        </Card>

        {/* View Error Logs */}
        <Card>
          <CardHeader>
            <CardTitle>View Error Logs</CardTitle>
            <CardDescription>
              Check console for error logs and statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleViewErrorLogs} variant="outline" className="w-full">
              View Error Logs
            </Button>
          </CardContent>
        </Card>

        {/* Clear Error Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Clear Error Logs</CardTitle>
            <CardDescription>
              Clear all in-memory error logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleClearErrorLogs} variant="destructive" className="w-full">
              Clear Logs
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Implementation Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • All errors are automatically logged to the error service
          </p>
          <p>
            • Network errors automatically retry up to 3 times with exponential backoff
          </p>
          <p>
            • User-friendly messages are generated based on error type
          </p>
          <p>
            • Toast notifications include retry actions where appropriate
          </p>
          <p>
            • Error logs are kept in memory (last 100 errors)
          </p>
          <p>
            • Check browser console for detailed error information in development mode
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
