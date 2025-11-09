import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  // Prevent double execution in React Strict Mode
  const hasRun = useRef(false);

  useEffect(() => {
    // Guard against double execution in React 18 Strict Mode
    if (hasRun.current) {
      console.log('⏭️  OAuth callback already processed, skipping duplicate execution');
      return;
    }
    hasRun.current = true;

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

            // Check if this is a connector OAuth (has userId or specific provider/platform)
            const platformOrProvider = stateData.provider || stateData.platform;
            isConnectorOAuth = !!stateData.userId ||
              (platformOrProvider && ['spotify', 'youtube', 'netflix', 'discord', 'github', 'linkedin', 'reddit', 'twitch', 'google_gmail', 'google_calendar', 'google_drive', 'slack', 'teams'].includes(platformOrProvider));
            // Check if this is an authentication OAuth
            isAuthOAuth = stateData.isAuth === true;

            console.log('🔍 Flow detection results:', { isConnectorOAuth, isAuthOAuth, hasUserId: !!stateData.userId, provider: stateData.provider, platform: stateData.platform });
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

            // DO NOT store connection in localStorage - this causes state sync issues
            // Connection status should ONLY come from the backend
            // Remove any stale localStorage data
            localStorage.removeItem('connectedServices');

            // If we're in a popup, close it; otherwise redirect
            setTimeout(() => {
              if (window.opener) {
                // We're in a popup - notify parent and close
                window.opener.postMessage({ type: 'oauth-success', provider: stateData?.provider }, window.location.origin);
                window.close();
              } else {
                // We're in the main window - redirect
                window.location.href = '/get-started?connected=true&provider=' + (stateData?.provider || '');
              }
            }, 1500);
          } else {
            // Check what type of flow this is
            if (isAuthOAuth && data.token) {
              // Handle auth OAuth success
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_provider', 'google');

              // Store user data if provided
              if (data.user) {
                localStorage.setItem('auth_user', JSON.stringify(data.user));
              }

              // Also store token in extension storage if extension is available
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                try {
                  chrome.runtime.sendMessage(
                    'acnofcjjfjaikcfnalggkkbghjaijepc', // Extension ID
                    { type: 'SET_AUTH_TOKEN', token: data.token },
                    (response) => {
                      if (chrome.runtime.lastError) {
                        console.log('Extension not available:', chrome.runtime.lastError.message);
                      } else {
                        console.log('✅ Token synced to extension:', response);
                      }
                    }
                  );
                } catch (error) {
                  console.log('Could not sync to extension:', error);
                }
              }

              console.log('✅ Authentication successful, token stored');
              setStatus('success');

              // Determine redirect based on whether user is new or existing
              const redirectPath = data.isNewUser ? '/onboarding' : '/dashboard';
              const welcomeMessage = data.isNewUser
                ? 'Welcome! Let\'s set up your Soul Signature'
                : 'Welcome back!';

              setMessage(`Authentication successful! ${welcomeMessage}`);

              // Show success toast
              toast.success(data.isNewUser ? 'Welcome to Twin Me!' : 'Welcome back!', {
                description: `Signed in as ${data.user?.email || 'user'}`,
                duration: 3000
              });

              // Redirect to appropriate page based on user type
              setTimeout(() => {
                window.location.href = redirectPath;
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

              // If we're in a popup, close it; otherwise redirect
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth-success', provider: stateData?.provider }, window.location.origin);
                  window.close();
                } else {
                  window.location.href = '/get-started?connected=true';
                }
              }, 1500);
            } else if (data.token && !isAuthOAuth && !isConnectorOAuth) {
              // Generic OAuth success (might be auth without explicit isAuth flag)
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_provider', 'google');

              if (data.user) {
                localStorage.setItem('auth_user', JSON.stringify(data.user));
              }

              // Also store token in extension storage if extension is available
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                try {
                  chrome.runtime.sendMessage(
                    'acnofcjjfjaikcfnalggkkbghjaijepc', // Extension ID
                    { type: 'SET_AUTH_TOKEN', token: data.token },
                    (response) => {
                      if (chrome.runtime.lastError) {
                        console.log('Extension not available:', chrome.runtime.lastError.message);
                      } else {
                        console.log('✅ Token synced to extension:', response);
                      }
                    }
                  );
                } catch (error) {
                  console.log('Could not sync to extension:', error);
                }
              }

              console.log('✅ OAuth successful, token stored');
              setStatus('success');

              // Determine redirect based on whether user is new or existing
              const redirectPath = data.isNewUser ? '/onboarding' : '/dashboard';
              const welcomeMessage = data.isNewUser
                ? 'Welcome! Let\'s set up your Soul Signature'
                : 'Welcome back!';

              setMessage(`Authentication successful! ${welcomeMessage}`);

              // Show success toast
              toast.success(data.isNewUser ? 'Welcome to Twin Me!' : 'Welcome back!', {
                description: 'Successfully signed in',
                duration: 3000
              });

              setTimeout(() => {
                window.location.href = redirectPath;
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

                // DO NOT store connection in localStorage - this causes state sync issues
                // Connection status should ONLY come from the backend

                setTimeout(() => {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'oauth-success', provider: data.provider }, window.location.origin);
                    window.close();
                  } else {
                    window.location.href = '/get-started?connected=true';
                  }
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
        return <Loader2 className="w-12 h-12 text-stone-900 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-12 h-12 text-stone-900" />;
      case 'error':
        return <XCircle className="w-12 h-12 text-stone-900" />;
    }
  };

  const getStatusTextColor = () => {
    switch (status) {
      case 'loading':
        return 'text-stone-900';
      case 'success':
        return 'text-stone-900';
      case 'error':
        return 'text-stone-900';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="max-w-md w-full mx-4 p-8 rounded-[16px] border border-black/[0.06] text-center bg-white/50 backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl mr-3 bg-stone-900">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl text-stone-900 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', letterSpacing: '-0.02em' }}>
            Twin Me
          </h1>
        </div>

        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {getStatusIcon()}
        </div>

        {/* Status Message */}
        <h2 className={`text-xl mb-2 font-medium ${getStatusTextColor()}`} style={{ fontFamily: 'var(--_typography---font--styrene-a)', letterSpacing: '-0.02em' }}>
          {status === 'loading' && 'Authenticating...'}
          {status === 'success' && 'Welcome!'}
          {status === 'error' && 'Authentication Failed'}
        </h2>

        <p className="text-sm text-stone-600" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
          {message}
        </p>

        {/* Progress indicator for loading state */}
        {status === 'loading' && (
          <div className="mt-6">
            <div className="w-full rounded-full h-1.5 bg-black/[0.06]">
              <div className="h-1.5 rounded-full bg-stone-900 w-3/5 transition-all duration-300" />
            </div>
          </div>
        )}

        {/* Error state - show retry button */}
        {status === 'error' && (
          <button
            onClick={() => navigate('/auth')}
            className="mt-6 px-6 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 font-medium transition-all shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
            style={{ fontFamily: 'var(--_typography---font--styrene-a)', letterSpacing: '-0.02em' }}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;