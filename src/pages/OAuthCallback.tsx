import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
        console.log('🔄 Full URL:', window.location.href);
        console.log('🔄 Search params:', searchParams.toString());
        console.log('🔄 All URL params:', Object.fromEntries(searchParams.entries()));

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
        let isAuthOAuth = false;

        console.log('🔍 Raw state parameter:', state);
        console.log('🔍 State type:', typeof state);
        console.log('🔍 State length:', state?.length);

        try {
          if (state) {
            console.log('🔄 Attempting to decode state...');
            // Use atob instead of Buffer for browser compatibility
            const decodedState = atob(state);
            console.log('🔄 Decoded state string:', decodedState);
            stateData = JSON.parse(decodedState);
            console.log('🔄 Parsed state data:', stateData);

            // Check if this is a connector OAuth (has userId or specific provider)
            isConnectorOAuth = stateData.userId ||
              (stateData.provider && ['google_gmail', 'google_calendar', 'google_drive', 'slack', 'teams', 'discord'].includes(stateData.provider));
            // Check if this is an authentication OAuth
            isAuthOAuth = stateData.isAuth === true;

            console.log('🔍 Flow detection results:', { isConnectorOAuth, isAuthOAuth, hasUserId: !!stateData.userId, provider: stateData.provider });
          } else {
            console.log('❌ No state parameter found');
          }
        } catch (e) {
          console.error('❌ State decoding failed:', e);
          console.log('🔍 Raw state for debugging:', state);
          // If we can't decode state, try to determine from the error response later
        }

        console.log('🔍 OAuth type detected:', { isConnectorOAuth, isAuthOAuth, stateData });

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
        console.log('📥 Token exchange response:', {
          success: data.success,
          isConnector: isConnectorOAuth,
          data: data,
          hasToken: !!data.token,
          hasUser: !!data.user,
          error: data.error
        });

        if (data.success) {
          if (isConnectorOAuth) {
            // Handle connector OAuth success
            console.log('✅ Connector OAuth successful');
            setStatus('success');

            // Get provider display name
            const providerName = stateData?.provider?.replace('google_', '').replace('_', ' ') || 'Service';
            const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

            setMessage(`${displayName} connected successfully! Redirecting...`);

            // Show success toast
            toast.success(`${displayName} Connected!`, {
              description: 'Your data is now being synced and analyzed',
              duration: 3000
            });

            // Store connection in localStorage to persist across refreshes
            const existingConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
            if (!existingConnections.includes(stateData?.provider)) {
              existingConnections.push(stateData?.provider);
              localStorage.setItem('connectedServices', JSON.stringify(existingConnections));
            }

            // Redirect back to the onboarding page with success flag
            setTimeout(() => {
              window.location.href = '/get-started?connected=true&provider=' + (stateData?.provider || '');
            }, 1500);
          } else {
            // Check what type of flow this is
            if (isAuthOAuth && data.token) {
              // Handle auth OAuth success
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_provider', 'google');

              // Store user data if provided
              if (data.user) {
                localStorage.setItem('user_data', JSON.stringify(data.user));
              }

              console.log('✅ Authentication successful, token stored');
              setStatus('success');
              setMessage('Authentication successful! Redirecting...');

              // Show success toast
              toast.success('Welcome to Twin Me!', {
                description: `Signed in as ${data.user?.email || 'user'}`,
                duration: 3000
              });

              // Redirect to get-started page
              setTimeout(() => {
                window.location.href = '/get-started';
              }, 1500);
            } else if (!data.token && stateData?.userId) {
              // This is likely a connector flow that was misidentified
              console.log('✅ Connector OAuth successful (fallback detection)');
              setStatus('success');
              setMessage(`Service connected successfully! Redirecting...`);

              // Show success toast
              toast.success('Service Connected!', {
                description: 'Your data is now being synced',
                duration: 3000
              });

              // Redirect back to the onboarding page
              setTimeout(() => {
                window.location.href = '/get-started?connected=true';
              }, 1500);
            } else if (data.token && !isAuthOAuth && !isConnectorOAuth) {
              // Generic OAuth success (might be auth without explicit isAuth flag)
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_provider', 'google');

              if (data.user) {
                localStorage.setItem('user_data', JSON.stringify(data.user));
              }

              console.log('✅ OAuth successful, token stored');
              setStatus('success');
              setMessage('Authentication successful! Redirecting...');

              // Show success toast
              toast.success('Welcome!', {
                description: 'Successfully signed in',
                duration: 3000
              });

              setTimeout(() => {
                window.location.href = '/get-started';
              }, 1500);
            } else {
              // Check if this might be a connector flow based on the response data structure
              if (data.success && (data.provider || data.connected || data.hasAccess)) {
                console.log('✅ Detected connector OAuth based on response data');
                setStatus('success');
                setMessage(`Service connected successfully! Redirecting...`);

                // Get provider display name
                const providerName = data.provider?.replace('google_', '').replace('_', ' ') || 'Service';
                const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

                // Show success toast
                toast.success(`${displayName} Connected!`, {
                  description: 'Your data connection is now active',
                  duration: 3000
                });

                // Store connection info if we can determine the provider
                if (data.provider) {
                  const existingConnections = JSON.parse(localStorage.getItem('connectedServices') || '[]');
                  if (!existingConnections.includes(data.provider)) {
                    existingConnections.push(data.provider);
                    localStorage.setItem('connectedServices', JSON.stringify(existingConnections));
                  }
                }

                setTimeout(() => {
                  window.location.href = '/get-started?connected=true';
                }, 1500);
              } else {
                // This is truly an error - no valid data received
                console.error('OAuth callback failed - no valid data received', { data, stateData, isAuthOAuth, isConnectorOAuth });
                throw new Error('OAuth authentication failed. Please try again.');
              }
            }
          }
        } else {
          throw new Error(data.error || 'OAuth exchange failed');
        }

      } catch (error) {
        console.error('❌ OAuth callback error:', error);
        setStatus('error');
        setMessage('Connection failed. Please try again.');

        // Show error toast
        toast.error('Connection Failed', {
          description: 'Unable to complete authentication. Please try again.',
          duration: 4000
        });

        // Don't redirect to auth for connector OAuth failures - stay on get-started
        setTimeout(() => {
          window.location.href = '/get-started';
        }, 3000);
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
            Twin Me
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