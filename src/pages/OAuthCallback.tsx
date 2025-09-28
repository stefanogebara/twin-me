import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        console.log('🔄 OAuth callback received:', { code: !!code, state: !!state, error });

        if (error) {
          setStatus('error');
          setMessage(`Authentication failed: ${error}`);
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received');
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        console.log('📤 Exchanging code for token...');

        // Determine if this is a connector OAuth or auth OAuth by checking state
        let stateData = null;
        let isConnectorOAuth = false;
        try {
          if (state) {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            // Check if this is a connector OAuth (has provider field other than just 'google')
            isConnectorOAuth = stateData.provider && ['google_gmail', 'google_calendar', 'google_drive', 'slack', 'teams', 'discord'].includes(stateData.provider);
          }
        } catch (e) {
          console.log('Could not decode state, assuming auth OAuth');
        }

        console.log('🔍 OAuth type detected:', { isConnectorOAuth, stateData });

        let response;
        if (isConnectorOAuth) {
          // Handle connector OAuth callback
          response = await fetch(`${import.meta.env.VITE_API_URL}/connectors/callback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code,
              state
            })
          });
        } else {
          // Handle main auth OAuth callback
          response = await fetch(`${import.meta.env.VITE_API_URL}/auth/oauth/callback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code,
              state,
              provider: 'google'
            })
          });
        }

        if (!response.ok) {
          throw new Error(`Token exchange failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('📥 Token exchange response:', { success: data.success, isConnector: isConnectorOAuth });

        if (data.success) {
          if (isConnectorOAuth) {
            // Handle connector OAuth success
            console.log('✅ Connector OAuth successful');
            setStatus('success');
            setMessage(`${stateData?.provider || 'Service'} connected successfully! Redirecting...`);

            // Redirect back to the onboarding page with success flag
            setTimeout(() => {
              window.location.href = '/get-started?connected=true';
            }, 1500);
          } else if (data.token) {
            // Handle auth OAuth success
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_provider', 'google');

            console.log('✅ Authentication successful, token stored');
            setStatus('success');
            setMessage('Authentication successful! Redirecting...');

            // Trigger a page reload to ensure AuthContext picks up the new token
            setTimeout(() => {
              window.location.href = '/get-started';
            }, 1500);
          } else {
            throw new Error('Missing token in auth response');
          }
        } else {
          throw new Error(data.error || 'OAuth exchange failed');
        }

      } catch (error) {
        console.error('❌ OAuth callback error:', error);
        setStatus('error');
        setMessage('An unexpected error occurred during authentication');
        setTimeout(() => navigate('/auth'), 3000);
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate]);

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="w-12 h-12 animate-spin" style={{ color: 'var(--_color-theme---accent)' }} />;
      case 'success':
        return <CheckCircle className="w-12 h-12" style={{ color: '#10B981' }} />;
      case 'error':
        return <XCircle className="w-12 h-12" style={{ color: '#EF4444' }} />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'var(--_color-theme---text)';
      case 'success':
        return '#10B981';
      case 'error':
        return '#EF4444';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      <div
        className="max-w-md w-full mx-4 p-8 rounded-2xl border text-center"
        style={{
          backgroundColor: 'var(--_color-theme---surface)',
          borderColor: 'var(--_color-theme---border)'
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl mr-3"
            style={{ backgroundColor: 'var(--_color-theme---accent)' }}
          >
            <Brain className="w-6 h-6 text-white" />
          </div>
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              color: 'var(--_color-theme---text)'
            }}
          >
            Twin AI Learn
          </h1>
        </div>

        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {getStatusIcon()}
        </div>

        {/* Status Message */}
        <h2
          className="text-xl font-semibold mb-2"
          style={{
            color: getStatusColor(),
            fontFamily: 'var(--_typography---font--styrene-a)'
          }}
        >
          {status === 'loading' && 'Authenticating...'}
          {status === 'success' && 'Welcome!'}
          {status === 'error' && 'Authentication Failed'}
        </h2>

        <p
          className="text-sm"
          style={{ color: 'var(--_color-theme---text-secondary)' }}
        >
          {message}
        </p>

        {/* Progress indicator for loading state */}
        {status === 'loading' && (
          <div className="mt-6">
            <div
              className="w-full bg-gray-200 rounded-full h-1.5"
              style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}
            >
              <div
                className="h-1.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: 'var(--_color-theme---accent)',
                  width: '60%'
                }}
              />
            </div>
          </div>
        )}

        {/* Error state - show retry button */}
        {status === 'error' && (
          <button
            onClick={() => navigate('/auth')}
            className="mt-6 px-6 py-2 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: 'var(--_color-theme---accent)',
              color: 'white'
            }}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;