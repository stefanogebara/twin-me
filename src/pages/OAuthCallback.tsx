import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ARCTIC_PROVIDERS } from '@/services/arcticService';
import { useTheme } from '@/contexts/ThemeContext';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');
  const [showError, setShowError] = useState(false); // Delay error visibility to prevent 401 flash

  // Prevent double execution in React Strict Mode
  const hasRun = useRef(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

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
        let state = searchParams.get('state');  // Changed to let so we can reassign for fallback
        const error = searchParams.get('error');

        console.log('🔄 OAuth callback received:', { code: !!code, state: !!state, error });
        console.log('🔄 Full URL:', window.location.href);
        console.log('🔄 Search params:', searchParams.toString());
        console.log('🔄 All URL params:', Object.fromEntries(searchParams.entries()));

        // CRITICAL: Prevent duplicate API calls using sessionStorage
        // This handles cases where component remounts or React Strict Mode causes re-execution
        if (code) {
          const processedKey = `oauth_processed_${code.substring(0, 32)}`;
          const alreadyProcessed = sessionStorage.getItem(processedKey);

          if (alreadyProcessed) {
            console.log('✅ OAuth code already processed successfully, redirecting...');
            setStatus('success');
            setMessage('Connection successful! Redirecting...');

            // Get the stored provider for proper redirect
            const storedProvider = sessionStorage.getItem(`oauth_provider_${code.substring(0, 32)}`);

            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-success',
                  provider: storedProvider
                }, window.location.origin);
                window.close();
              } else {
                window.location.href = '/get-started?connected=true&provider=' + (storedProvider || '');
              }
            }, 500);
            return;
          }

          // Mark this code as being processed BEFORE making API call
          sessionStorage.setItem(processedKey, 'processing');
          console.log('🔒 Marked OAuth code as processing to prevent duplicates');
        }

        if (error) {
          setStatus('error');
          setMessage(`Authentication failed: ${error}`);
          // Delay showing error to prevent transient 401 flash
          errorTimeoutRef.current = setTimeout(() => setShowError(true), 500);
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received');
          // Delay showing error to prevent transient 401 flash
          errorTimeoutRef.current = setTimeout(() => setShowError(true), 500);
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

            // Check if this is an Arctic OAuth provider
            const isArcticProvider = platformOrProvider && ARCTIC_PROVIDERS.includes(platformOrProvider);

            // Health platforms need special handling
            const isHealthProvider = platformOrProvider && ['whoop', 'oura'].includes(platformOrProvider);

            isConnectorOAuth = !!stateData.userId ||
              isArcticProvider ||
              isHealthProvider ||
              (platformOrProvider && ['youtube', 'netflix', 'google_gmail', 'google_calendar', 'google_drive', 'slack', 'teams', 'linkedin', 'whoop', 'oura'].includes(platformOrProvider));
            // Check if this is an authentication OAuth
            isAuthOAuth = stateData.isAuth === true;

            console.log('🔍 Flow detection results:', { isConnectorOAuth, isAuthOAuth, hasUserId: !!stateData.userId, provider: stateData.provider, platform: stateData.platform });
          } else {
            console.log('❌ No state parameter found');
            // Fallback: Check sessionStorage for connecting_provider
            const connectingProvider = sessionStorage.getItem('connecting_provider');
            const currentUser = localStorage.getItem('userId') || sessionStorage.getItem('userId');

            if (connectingProvider) {
              console.log('📦 Found connecting_provider in sessionStorage:', connectingProvider);
              console.log('📦 Found userId:', currentUser);

              // Reconstruct state data from sessionStorage
              stateData = {
                provider: connectingProvider === 'google_calendar' ? 'google' : connectingProvider,
                platform: connectingProvider,
                userId: currentUser,
                timestamp: Date.now()
              };

              // Mark as connector OAuth
              isConnectorOAuth = true;

              // Create a fake state for the backend
              state = btoa(JSON.stringify(stateData));
              console.log('📦 Reconstructed state:', stateData);
            }
          }
        } catch (e) {
          console.error('❌ State decoding failed:', e);
          console.log('🔍 Raw state for debugging:', state);
          // If we can't decode state, try to determine from the error response later
        }

        console.log('🔍 OAuth type detected:', { isConnectorOAuth, isAuthOAuth, stateData });

        let response;
        if (isConnectorOAuth) {
          // Check if this is an Arctic OAuth callback
          const platformOrProvider = stateData?.provider || stateData?.platform;
          const isArcticProvider = platformOrProvider && ARCTIC_PROVIDERS.includes(platformOrProvider);

          const callbackEndpoint = isArcticProvider ? '/arctic/callback' : '/connectors/callback';

          // Handle connector OAuth callback
          response = await fetch(`${import.meta.env.VITE_API_URL}${callbackEndpoint}`, {
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
          // Clear any pending error timeout on success
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }

          if (isConnectorOAuth) {
            // Handle connector OAuth success
            console.log('✅ Connector OAuth successful');

            // Mark the OAuth code as successfully processed in sessionStorage
            if (code) {
              const processedKey = `oauth_processed_${code.substring(0, 32)}`;
              sessionStorage.setItem(processedKey, 'success');
              sessionStorage.setItem(`oauth_provider_${code.substring(0, 32)}`, stateData?.provider || '');
              console.log('✅ Marked OAuth code as successfully processed');
            }

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

            // Check if this is an Arctic OAuth callback
            const platformOrProvider = stateData?.provider || stateData?.platform;
            const isArcticProvider = platformOrProvider && ARCTIC_PROVIDERS.includes(platformOrProvider);

            // If we're in a popup, close it; otherwise redirect
            setTimeout(() => {
              if (window.opener) {
                // We're in a popup - notify parent and close
                if (isArcticProvider) {
                  // Arctic OAuth uses specific message format
                  window.opener.postMessage({
                    type: 'ARCTIC_OAUTH_SUCCESS',
                    provider: stateData?.provider
                  }, window.location.origin);
                } else {
                  // Other OAuth connectors use generic format
                  window.opener.postMessage({
                    type: 'oauth-success',
                    provider: stateData?.provider
                  }, window.location.origin);
                }
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

              // Determine redirect based on redirectAfterAuth in state, user type, or default
              let redirectPath = '/dashboard';  // Default

              if (stateData?.redirectAfterAuth) {
                // Use the redirect parameter from the auth flow (e.g., /extension-auth)
                redirectPath = stateData.redirectAfterAuth;
                console.log('✅ Using post-auth redirect from state:', redirectPath);
              } else if (data.isNewUser) {
                // New users go to onboarding
                redirectPath = '/onboarding';
              }

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

        // Clear the processing marker on error to allow retry
        const code = searchParams.get('code');
        if (code) {
          const processedKey = `oauth_processed_${code.substring(0, 32)}`;
          sessionStorage.removeItem(processedKey);
          console.log('🔄 Cleared OAuth processing marker for retry');
        }

        setStatus('error');
        setMessage('Connection failed. Please try again.');

        // Delay showing error to prevent transient 401 flash
        errorTimeoutRef.current = setTimeout(() => {
          setShowError(true);
          // Show error toast only after delay
          toast.error('Connection Failed', {
            description: 'Unable to complete authentication. Please try again.',
            duration: 4000
          });
        }, 500);

        // Don't redirect to auth for connector OAuth failures - stay on get-started
        setTimeout(() => {
          window.location.href = '/get-started';
        }, 3000);
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate]);

  const getStatusIcon = () => {
    const iconColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
    // Don't show error icon until showError is true (prevents 401 flash)
    const displayStatus = status === 'error' && !showError ? 'loading' : status;
    switch (displayStatus) {
      case 'loading':
        return <Loader2 className="w-12 h-12 animate-spin" style={{ color: iconColor }} />;
      case 'success':
        return <CheckCircle className="w-12 h-12" style={{ color: iconColor }} />;
      case 'error':
        return <XCircle className="w-12 h-12" style={{ color: iconColor }} />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}>
      <div className="max-w-md w-full mx-4 p-8 rounded-[16px] border text-center backdrop-blur-[16px]" style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        boxShadow: theme === 'dark' ? '0 4px 16px rgba(0, 0, 0, 0.3)' : '0 4px 16px rgba(0, 0, 0, 0.03)'
      }}>
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl mr-3" style={{ backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            <Brain className="w-6 h-6" style={{ color: theme === 'dark' ? '#232320' : '#ffffff' }} />
          </div>
          <h1 className="text-2xl font-medium" style={{
            fontFamily: 'var(--_typography---font--styrene-a)',
            letterSpacing: '-0.02em',
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}>
            Twin Me
          </h1>
        </div>

        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {getStatusIcon()}
        </div>

        {/* Status Message - use displayStatus to prevent error flash */}
        {(() => {
          const displayStatus = status === 'error' && !showError ? 'loading' : status;
          const displayMessage = status === 'error' && !showError ? 'Processing authentication...' : message;
          return (
            <>
              <h2 className="text-xl mb-2 font-medium" style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}>
                {displayStatus === 'loading' && 'Authenticating...'}
                {displayStatus === 'success' && 'Welcome!'}
                {displayStatus === 'error' && 'Authentication Failed'}
              </h2>

              <p className="text-sm" style={{
                fontFamily: 'var(--_typography---font--tiempos)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
              }}>
                {displayMessage}
              </p>
            </>
          );
        })()}

        {/* Progress indicator for loading state */}
        {(status === 'loading' || (status === 'error' && !showError)) && (
          <div className="mt-6">
            <div className="w-full rounded-full h-1.5" style={{ backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)' }}>
              <div className="h-1.5 rounded-full w-3/5 transition-all duration-300" style={{ backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
            </div>
          </div>
        )}

        {/* Error state - show retry button only after delay */}
        {status === 'error' && showError && (
          <button
            onClick={() => navigate('/auth')}
            className="mt-6 px-6 py-2 rounded-lg font-medium transition-all"
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              letterSpacing: '-0.02em',
              backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
              color: theme === 'dark' ? '#232320' : '#ffffff',
              boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(193, 192, 182, 0.9)' : '#1c1917';
              e.currentTarget.style.boxShadow = theme === 'dark' ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
              e.currentTarget.style.boxShadow = theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.1)';
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