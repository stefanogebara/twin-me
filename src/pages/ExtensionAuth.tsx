/**
 * Extension Authentication Page
 *
 * Users land here when connecting the browser extension.
 * After login, sends auth token to extension via postMessage.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function ExtensionAuth() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'authenticating' | 'success' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (user) {
      // User is authenticated, send token to extension
      sendTokenToExtension();
    } else {
      // User not authenticated, redirect to auth
      setStatus('authenticating');
      navigate('/auth?redirect=/extension-auth');
    }
  }, [user, navigate]);

  const sendTokenToExtension = async () => {
    try {
      // Get auth token from localStorage
      const authToken = localStorage.getItem('auth_token') || localStorage.getItem('token');

      if (!authToken || !user) {
        setStatus('error');
        setErrorMessage('No authentication token found');
        return;
      }

      // Set up listener for confirmation from extension
      const confirmationPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Extension did not respond. Make sure the extension is installed and enabled.'));
        }, 5000);

        const messageHandler = (event: MessageEvent) => {
          console.log('[Extension Auth] 📨 Received window message:', event.data);

          if (event.data.type === 'TWIN_AI_EXTENSION_AUTH_RECEIVED') {
            console.log('[Extension Auth] ✅ Got confirmation from extension!', event.data);
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            if (event.data.success) {
              resolve(true);
            } else {
              reject(new Error(event.data.error || 'Extension failed to save authentication'));
            }
          }
        };

        window.addEventListener('message', messageHandler);
      });

      // Send message to extension via window.postMessage
      // The content script will pick this up and forward to service worker
      const authMessage = {
        type: 'TWIN_AI_EXTENSION_AUTH',
        data: {
          authToken,
          userId: user.id,
          expiresIn: 86400 // 24 hours
        }
      };

      console.log('[Extension Auth] 📤 Sending auth message to extension:', {
        type: authMessage.type,
        userId: authMessage.data.userId,
        tokenLength: authMessage.data.authToken?.length,
        origin: window.location.origin
      });

      window.postMessage(authMessage, window.location.origin);

      console.log('[Extension Auth] ⏳ Message sent, waiting for confirmation...');

      // Wait for confirmation
      await confirmationPromise;

      console.log('[Extension Auth] Confirmation received!');
      setStatus('success');

      // Redirect back to dashboard after 2 seconds
      setTimeout(() => {
        // Try to close the window first
        const closed = window.close();

        // If can't close (security restrictions), redirect to dashboard
        if (!closed) {
          window.location.href = '/dashboard';
        }
      }, 2000);

    } catch (error) {
      console.error('Extension auth error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      backgroundColor: 'hsl(var(--claude-bg))'
    }}>
      <div className="max-w-md w-full mx-4">
        {/* Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            {status === 'checking' && (
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="animate-spin h-8 w-8 text-[hsl(var(--claude-accent))]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
            {status === 'success' && (
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {status === 'error' && (
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>

          {/* Title & Message */}
          <div className="text-center">
            {status === 'checking' && (
              <>
                <h2 className="text-2xl font-heading font-medium text-slate-800 mb-2">
                  Checking Authentication
                </h2>
                <p className="text-slate-600">
                  Verifying your Twin Me account...
                </p>
              </>
            )}

            {status === 'authenticating' && (
              <>
                <h2 className="text-2xl font-heading font-medium text-slate-800 mb-2">
                  Please Log In
                </h2>
                <p className="text-slate-600">
                  Redirecting to login page...
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <h2 className="text-2xl font-heading font-medium text-slate-800 mb-2">
                  Extension Connected!
                </h2>
                <p className="text-slate-600 mb-4">
                  Your Soul Signature Collector is now connected to Twin Me.
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
                  <p className="text-sm text-green-800 font-medium mb-2">✓ Authentication successful</p>
                  <p className="text-sm text-green-700">
                    You can now close this window and start browsing Netflix, YouTube, or Reddit.
                    The extension will automatically capture your authentic viewing and browsing patterns.
                  </p>
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  This window will close automatically in 2 seconds...
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <h2 className="text-2xl font-heading font-medium text-slate-800 mb-2">
                  Connection Failed
                </h2>
                <p className="text-slate-600 mb-4">
                  Unable to connect the extension to your account.
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                  <p className="text-sm text-red-800 font-medium mb-1">Error:</p>
                  <p className="text-sm text-red-700 font-mono">{errorMessage}</p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-6 px-4 py-2 bg-[hsl(var(--claude-accent))] text-white rounded-lg hover:bg-[hsl(var(--claude-accent-hover))] transition-colors"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            Having trouble? Check that the{' '}
            <a
              href="chrome://extensions/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--claude-accent))] hover:underline"
            >
              extension is installed and enabled
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
