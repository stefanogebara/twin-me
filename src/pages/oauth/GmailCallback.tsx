/**
 * Gmail OAuth Callback Handler
 *
 * This page receives the OAuth callback from Pipedream Connect
 * and sends the result to the parent window (popup opener)
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const GmailCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing Gmail connection...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get OAuth parameters from URL
      const accountId = searchParams.get('account_id');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      console.log('📧 [Gmail Callback] Received OAuth callback:', {
        hasAccountId: !!accountId,
        hasState: !!state,
        hasError: !!error
      });

      // Handle OAuth errors
      if (error) {
        console.error('❌ [Gmail Callback] OAuth error:', error, errorDescription);
        setStatus('error');
        setMessage(errorDescription || 'Failed to connect Gmail');

        // Send error message to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'GMAIL_OAUTH_ERROR',
            error: errorDescription || 'Failed to connect Gmail'
          }, window.location.origin);
        }

        // Close window after 2 seconds
        setTimeout(() => {
          window.close();
        }, 2000);

        return;
      }

      // Validate required parameters
      if (!accountId || !state) {
        throw new Error('Missing required OAuth parameters');
      }

      // Send callback data to backend
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const token = localStorage.getItem('authToken');

      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      console.log('📧 [Gmail Callback] Sending callback to backend...');

      const response = await fetch(`${apiUrl}/pipedream-gmail/callback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: accountId,
          state: state
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process OAuth callback');
      }

      const data = await response.json();

      console.log('✅ [Gmail Callback] Connection successful!');

      setStatus('success');
      setMessage('Gmail connected successfully!');

      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'GMAIL_OAUTH_SUCCESS',
          data: data.data
        }, window.location.origin);

        // Close popup after 1 second
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        // If no opener (direct navigation), redirect to dashboard
        setTimeout(() => {
          const returnUrl = data.data.returnUrl || '/onboarding/analysis';
          navigate(returnUrl);
        }, 2000);
      }

    } catch (error) {
      console.error('❌ [Gmail Callback] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to connect Gmail';

      setStatus('error');
      setMessage(errorMessage);

      // Send error to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'GMAIL_OAUTH_ERROR',
          error: errorMessage
        }, window.location.origin);

        setTimeout(() => {
          window.close();
        }, 2000);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20" style={{ background: '#FAFAFA' }}>
      <div className="w-full max-w-md">
        <div
          className="rounded-3xl overflow-hidden p-8 text-center space-y-6"
          style={{
            background: 'rgba(255, 255, 255, 0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.03)',
          }}
        >
          {/* Status Icon */}
          <div className="flex justify-center">
            {status === 'loading' && (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0, 0, 0, 0.04)' }}
              >
                <Loader2 className="w-8 h-8 text-stone-600 animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(34, 197, 94, 0.1)' }}
              >
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            )}
            {status === 'error' && (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239, 68, 68, 0.1)' }}
              >
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
            )}
          </div>

          {/* Status Message */}
          <div className="space-y-2">
            <h2 className="text-xl font-medium text-stone-900">
              {status === 'loading' && 'Connecting Gmail...'}
              {status === 'success' && 'Success!'}
              {status === 'error' && 'Connection Failed'}
            </h2>
            <p className="text-[15px] text-stone-600">
              {message}
            </p>
          </div>

          {/* Additional Info */}
          {status === 'loading' && (
            <p className="text-[13px] text-stone-500">
              Please wait while we connect your Gmail account
            </p>
          )}
          {status === 'success' && (
            <p className="text-[13px] text-stone-500">
              This window will close automatically
            </p>
          )}
          {status === 'error' && (
            <button
              onClick={() => window.close()}
              className="text-[13px] text-stone-600 hover:text-stone-900 underline"
            >
              Close this window
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GmailCallback;
