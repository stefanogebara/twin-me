# Error Handling Implementation Guide

## Overview

This guide documents the comprehensive error handling system implemented for the Twin AI Learn platform. The system provides user-friendly error messages, automatic retry mechanisms, centralized logging, and pre-configured toast notifications for common scenarios.

## Architecture

### Core Components

1. **ErrorBoundary** (`src/components/ErrorBoundary.tsx`)
   - Catches React errors and prevents app crashes
   - Displays user-friendly error messages
   - Logs errors to the error service
   - Provides retry and navigation options

2. **useError Hook** (`src/hooks/useError.ts`)
   - Provides error handling utilities for components
   - Shows toast notifications
   - Handles specific error types (auth, network, validation, etc.)
   - Supports retry mechanisms

3. **Error Service** (`src/services/errorService.ts`)
   - Centralizes error logging and categorization
   - Provides user-friendly error messages
   - Tracks error statistics
   - Determines if errors are retryable

4. **API Service with Retry** (`src/services/apiService.ts`)
   - Automatic retry for failed requests (up to 3 attempts)
   - Exponential backoff for rate limits
   - Comprehensive error handling for all API calls
   - Logs all API errors

5. **Notification Helpers** (`src/lib/notifications.ts`)
   - Pre-configured toast notifications for common scenarios
   - Success, error, warning, and info notifications
   - Promise-based notifications for async operations

## Usage Examples

### 1. Using ErrorBoundary

Wrap sensitive components with ErrorBoundary to catch and handle errors gracefully:

```tsx
import ErrorBoundary from '@/components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary showHomeButton showReloadButton>
      <YourComponent />
    </ErrorBoundary>
  );
}
```

**Props:**
- `showHomeButton`: Show "Go Home" button in error UI
- `showReloadButton`: Show "Reload Page" button in error UI
- `fallback`: Custom fallback UI component
- `onError`: Custom error handler function

### 2. Using useError Hook

Import and use the hook in your components:

```tsx
import { useError } from '@/hooks/useError';

function MyComponent() {
  const { handleError, showSuccess, handleNetworkError } = useError();

  const fetchData = async () => {
    try {
      const response = await fetch('/api/data');
      const data = await response.json();
      showSuccess('Data loaded successfully!');
      return data;
    } catch (error) {
      handleError(error, {
        customMessage: 'Failed to load data. Please try again.',
        category: 'network',
        onRetry: fetchData, // Adds retry button
      });
    }
  };

  return <button onClick={fetchData}>Load Data</button>;
}
```

**Available Methods:**
- `handleError(error, options)`: General error handler with customization
- `showSuccess(message, options)`: Show success toast
- `showWarning(message, duration)`: Show warning toast
- `showInfo(message, duration)`: Show info toast
- `handleAuthError(error)`: Handle authentication errors specifically
- `handleNetworkError(error, onRetry)`: Handle network errors with retry
- `handlePermissionError(error, requiredPermission)`: Handle permission errors
- `handleValidationError(error, fieldName)`: Handle validation errors
- `showLoading(message)`: Show loading toast (returns ID for dismissal)
- `dismissToast(toastId)`: Dismiss specific toast
- `dismissAllToasts()`: Dismiss all toasts

### 3. Using Pre-configured Notifications

Import notification helpers for common scenarios:

```tsx
import {
  successNotifications,
  errorNotifications,
  warningNotifications,
  promiseNotifications
} from '@/lib/notifications';

// Success notification
successNotifications.platformConnected('Spotify');

// Error with retry
errorNotifications.platformConnectionFailed('Spotify', () => reconnect());

// Warning
warningNotifications.tokenExpiringSoon('YouTube');

// Promise-based notification (automatic loading/success/error)
const loadData = async () => {
  return promiseNotifications.async(
    fetchDataFromAPI(),
    {
      loading: 'Loading your data...',
      success: 'Data loaded successfully!',
      error: 'Failed to load data',
    }
  );
};
```

### 4. Using API Service with Automatic Retry

The API service now includes automatic retry for failed requests:

```tsx
import { dashboardAPI, trainingAPI } from '@/services/apiService';

// Automatically retries up to 3 times with exponential backoff
const stats = await dashboardAPI.getStats(userId);

// Training operations with error handling
try {
  await trainingAPI.startTraining(userId, 10);
  successNotifications.trainingStarted();
} catch (error) {
  errorNotifications.generic('Failed to start training', () => retryTraining());
}
```

### 5. Using useAsyncError Hook

Simplify async error handling:

```tsx
import { useAsyncError } from '@/hooks/useError';

function MyComponent() {
  const { wrapAsync } = useAsyncError();

  const handleSave = wrapAsync(
    async () => {
      await saveToAPI(data);
    },
    {
      successMessage: 'Saved successfully!',
      errorMessage: 'Failed to save',
      category: 'network',
      onRetry: handleSave,
    }
  );

  return <button onClick={handleSave}>Save</button>;
}
```

## Error Categories

The system categorizes errors for better logging and analytics:

- `authentication`: Auth token issues, expired sessions
- `network`: Connection failures, fetch errors
- `validation`: Invalid input, form validation errors
- `permission`: Forbidden actions, access denied
- `rate_limit`: API rate limiting (429 errors)
- `platform_api`: External platform API errors (Spotify, YouTube, etc.)
- `database`: Supabase/database errors
- `unknown`: Uncategorized errors

## User-Friendly Error Messages

The error service automatically converts technical errors into user-friendly messages:

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| `Network request failed` | "Connection failed. Please check your internet connection and try again." |
| `401 Unauthorized` | "Your session has expired. Please sign in again." |
| `403 Forbidden` | "You don't have permission to perform this action." |
| `429 Too Many Requests` | "You're doing that too often. Please wait a moment and try again." |
| `500 Internal Server Error` | "Our servers are having trouble. Please try again in a few moments." |
| `Spotify API error` | "Unable to connect to the platform. Please try reconnecting your account." |

## Retry Mechanism

### Automatic Retry (API Service)

The API service automatically retries failed requests:

- **Retries**: Up to 3 attempts
- **Delay**: 1 second (exponential backoff: 1s, 2s, 4s)
- **Retryable Errors**:
  - Network failures
  - Server errors (500, 502, 503)
  - Rate limits (429)
- **Non-Retryable Errors**:
  - Authentication (401)
  - Permission (403)
  - Validation (400)

### Manual Retry (User Action)

Users can manually retry failed operations via toast notifications:

```tsx
errorNotifications.networkError(() => {
  // Retry logic
  fetchData();
});
```

## Error Logging

### In-Memory Logging

The error service maintains the last 100 errors in memory:

```tsx
import { errorService } from '@/services/errorService';

// Get all error logs
const logs = errorService.getErrorLogs();

// Get logs by category
const authErrors = errorService.getErrorLogsByCategory('authentication');

// Get error statistics
const stats = errorService.getErrorStats();
// Returns: { total, byCategory, recent (last hour) }

// Export logs as JSON
const json = errorService.exportLogs();

// Clear all logs
errorService.clearLogs();
```

### Error Log Structure

```typescript
interface ErrorLog {
  id: string;                      // Unique error ID
  timestamp: Date;                 // When error occurred
  category: ErrorCategory;         // Error category
  message: string;                 // Error message
  stack?: string;                  // Stack trace (if available)
  context?: Record<string, any>;   // Additional context
  userAgent: string;               // Browser info
  url: string;                     // Page URL
}
```

## Best Practices

### 1. Always Handle Errors

```tsx
// BAD: Unhandled error
const data = await fetchData();

// GOOD: Handled with user feedback
try {
  const data = await fetchData();
  showSuccess('Data loaded!');
} catch (error) {
  handleError(error, { onRetry: fetchData });
}
```

### 2. Use Appropriate Error Types

```tsx
// Use specific handlers for better UX
try {
  await authenticateUser();
} catch (error) {
  // Use auth-specific handler (redirects to login)
  handleAuthError(error);
}
```

### 3. Provide Retry Options

```tsx
// Add retry for transient errors
errorNotifications.networkError(() => retryOperation());

// Don't add retry for permanent errors
errorNotifications.validationError('Invalid email format');
```

### 4. Add Context to Errors

```tsx
try {
  await connectPlatform('spotify');
} catch (error) {
  handleError(error, {
    category: 'platform_api',
    context: {
      platform: 'spotify',
      userId: currentUser.id,
      attemptNumber: 3,
    },
  });
}
```

### 5. Use Promise Notifications for Async Operations

```tsx
// Automatically handles loading/success/error states
await promiseNotifications.async(
  saveSettings(formData),
  {
    loading: 'Saving your settings...',
    success: 'Settings saved successfully!',
    error: 'Failed to save settings',
  }
);
```

## Common Error Scenarios

### Authentication Failure

```tsx
import { useError } from '@/hooks/useError';

const { handleAuthError } = useError();

try {
  await api.fetchUserData();
} catch (error) {
  handleAuthError(error); // Shows "Session expired" + Sign In button
}
```

### Network Connection Issues

```tsx
import { errorNotifications } from '@/lib/notifications';

try {
  await api.syncPlatformData();
} catch (error) {
  errorNotifications.networkError(() => retrySyncData());
}
```

### Platform API Failures

```tsx
import { errorNotifications, successNotifications } from '@/lib/notifications';

const connectSpotify = async () => {
  try {
    await platformAPI.connect('spotify');
    successNotifications.platformConnected('Spotify');
  } catch (error) {
    errorNotifications.platformConnectionFailed('Spotify', connectSpotify);
  }
};
```

### Form Validation Errors

```tsx
import { useError } from '@/hooks/useError';

const { handleValidationError } = useError();

const handleSubmit = async (formData) => {
  if (!formData.email) {
    handleValidationError('Email is required', 'Email');
    return;
  }

  // Continue with submission...
};
```

### Rate Limiting

```tsx
import { errorNotifications } from '@/lib/notifications';

try {
  await api.bulkOperation();
} catch (error) {
  if (error.status === 429) {
    const retryAfter = error.headers?.['retry-after'];
    errorNotifications.rateLimitExceeded(retryAfter);
  }
}
```

## Testing Error Handling

### Simulate Errors

```tsx
// Test network error
throw new Error('Network request failed');

// Test auth error
throw new Error('401 Unauthorized');

// Test rate limit
const error = new Error('Too many requests');
(error as any).status = 429;
throw error;
```

### Check Error Logs

```tsx
import { errorService } from '@/services/errorService';

// In development, check error logs
console.log('Error stats:', errorService.getErrorStats());
console.log('Recent errors:', errorService.getErrorLogs());
```

## Future Enhancements

1. **External Logging Service Integration**
   - Send errors to Sentry or LogRocket
   - Real-time error monitoring
   - Error aggregation and alerting

2. **Error Recovery Strategies**
   - Automatic reconnection for WebSocket errors
   - Offline mode with queue for failed requests
   - Optimistic UI updates with rollback

3. **User Error Reporting**
   - Allow users to report errors with context
   - Screenshot capture for bug reports
   - User feedback on error messages

4. **Advanced Analytics**
   - Error rate dashboards
   - Error correlation analysis
   - Performance impact tracking

## Support

For questions or issues with error handling:
1. Check this guide for common patterns
2. Review error logs with `errorService.getErrorLogs()`
3. Test with different error scenarios
4. Ensure error messages are user-friendly

## Changelog

**Version 1.0.0** (Current)
- Initial comprehensive error handling implementation
- ErrorBoundary with user-friendly messages
- useError hook with retry mechanisms
- Error service with logging and categorization
- API service with automatic retry
- Pre-configured notification helpers
- Promise-based notifications
