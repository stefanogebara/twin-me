import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAnalytics } from '@/contexts/AnalyticsContext';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { trackFunnel } = useAnalytics();
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
      return;
    }
    hasRun.current = true;

    const handleOAuthCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');  // Changed to let so we can reassign for fallback
        const error = searchParams.get('error');

        // CRITICAL: Prevent duplicate API calls using sessionStorage
        // This handles cases where component remounts or React Strict Mode causes re-execution
        if (code) {
          const processedKey = `oauth_processed_${code.substring(0, 32)}`;
          const alreadyProcessed = sessionStorage.getItem(processedKey);

          if (alreadyProcessed) {
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
        }

        if (error) {
          setStatus('error');
          setMessage(`Authentication failed: ${error}`);
          // Delay showing error to prevent transient 401 flash
          errorTimeoutRef.current = setTimeout(() => setShowError(true), 500);
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        // Handle one-time auth code from GET redirect (secure: tokens stored server-side)
        const authCodeParam = searchParams.get('auth_code');
        if (authCodeParam && !code) {
          const claimResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/auth/oauth/claim?auth_code=${encodeURIComponent(authCodeParam)}`
          );
          if (!claimResponse.ok) {
            setStatus('error');
            setMessage('Authentication failed. Please try again.');
            errorTimeoutRef.current = setTimeout(() => setShowError(true), 500);
            setTimeout(() => navigate('/auth'), 3000);
            return;
          }
          const claimData = await claimResponse.json();
          if (claimData.token) {
            localStorage.removeItem('demo_mode');
            localStorage.setItem('auth_token', claimData.token);
            localStorage.setItem('auth_provider', claimData.provider || searchParams.get('provider') || 'google');
            if (claimData.refreshToken) {
              localStorage.setItem('refresh_token', claimData.refreshToken);
            }
            setStatus('success');
            setMessage('Authentication successful! Redirecting...');
            toast.success('Welcome!', { description: 'Successfully signed in', duration: 3000 });
            const isRelativePath = (path: string) => path.startsWith('/') && !path.startsWith('//');
            const redirectPath = (claimData.redirectAfterAuth && isRelativePath(claimData.redirectAfterAuth))
              ? claimData.redirectAfterAuth
              : '/dashboard';
            setTimeout(() => { window.location.href = redirectPath; }, 1500);
            return;
          }
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received');
          // Delay showing error to prevent transient 401 flash
          errorTimeoutRef.current = setTimeout(() => setShowError(true), 500);
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        // Determine OAuth flow type from encrypted state prefix or sessionStorage
        // All state is now encrypted with a flow type prefix: "auth.", "arctic.", "connector.", "entertainment.", "health."
        let stateData = null;
        let isConnectorOAuth = false;
        let isAuthOAuth = false;
        let flowType: string | null = null;

        if (state) {
          // Extract flow type from prefix (e.g. "auth.iv:encrypted:tag" → "auth")
          const dotIdx = state.indexOf('.');
          if (dotIdx > 0 && dotIdx < 20) {
            flowType = state.substring(0, dotIdx);
          }

          if (flowType === 'auth') {
            isAuthOAuth = true;
          } else if (flowType) {
            isConnectorOAuth = true;
          }

          // Try to get provider info from sessionStorage for UI display
          const connectingProvider = sessionStorage.getItem('connecting_provider') || sessionStorage.getItem('reconnecting_platform');
          if (connectingProvider) {
            stateData = { provider: connectingProvider, platform: connectingProvider };
          }
        } else {
          // No state parameter — check sessionStorage fallback
          const connectingProvider = sessionStorage.getItem('connecting_provider');
          const currentUser = localStorage.getItem('userId') || sessionStorage.getItem('userId');

          if (connectingProvider) {
            stateData = {
              provider: connectingProvider === 'google_calendar' ? 'google' : connectingProvider,
              platform: connectingProvider,
              userId: currentUser,
              timestamp: Date.now()
            };
            isConnectorOAuth = true;
          }
        }

        // Determine the correct callback endpoint based on flow type prefix
        let response;
        if (isConnectorOAuth) {
          let callbackEndpoint: string;
          // Get provider from sessionStorage for endpoint routing
          const sessionProvider = sessionStorage.getItem('connecting_provider') || sessionStorage.getItem('reconnecting_platform') || '';

          switch (flowType) {
            case 'entertainment':
              callbackEndpoint = '/entertainment/oauth/callback';
              break;
            case 'arctic':
              callbackEndpoint = '/arctic/callback';
              break;
            case 'health':
              // Health callbacks are provider-specific: /health/oauth/callback/{provider}
              callbackEndpoint = `/health/oauth/callback/${sessionProvider}`;
              break;
            case 'connector':
            default:
              callbackEndpoint = '/connectors/callback';
              break;
          }

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

        if (data.success) {
          // Clear any pending error timeout on success
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }

          if (isConnectorOAuth) {
            // Handle connector OAuth success

            // Mark the OAuth code as successfully processed in sessionStorage
            if (code) {
              const processedKey = `oauth_processed_${code.substring(0, 32)}`;
              sessionStorage.setItem(processedKey, 'success');
              sessionStorage.setItem(`oauth_provider_${code.substring(0, 32)}`, stateData?.provider || '');
            }

            // Track platform connection in analytics
            trackFunnel('platform_connected', {
              platform: stateData?.provider || stateData?.platform || 'unknown',
            });

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
            // Use provider from backend response first, then sessionStorage fallback
            const connectedProvider = data.provider || stateData?.provider || '';

            setTimeout(() => {
              if (window.opener) {
                // We're in a popup - notify parent and close
                if (flowType === 'arctic') {
                  window.opener.postMessage({
                    type: 'ARCTIC_OAUTH_SUCCESS',
                    provider: connectedProvider
                  }, window.location.origin);
                } else {
                  window.opener.postMessage({
                    type: 'oauth-success',
                    provider: connectedProvider
                  }, window.location.origin);
                }
                window.close();
              } else {
                // If we came from the onboarding flow, return there
                const fromOnboarding = sessionStorage.getItem('onboarding_platform_step');
                if (fromOnboarding) {
                  sessionStorage.removeItem('onboarding_platform_step');
                  window.location.href = '/onboarding?step=platform&connected=' + connectedProvider;
                } else {
                  window.location.href = '/get-started?connected=true&provider=' + connectedProvider;
                }
              }
            }, 1500);
          } else {
            // Check what type of flow this is
            if (isAuthOAuth && data.token) {
              // Handle auth OAuth success
              localStorage.removeItem('demo_mode');
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_provider', 'google');

              // Store refresh token if provided
              if (data.refreshToken) {
                localStorage.setItem('refresh_token', data.refreshToken);
              }

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
                    () => {
                      // Chrome extension sync callback
                    }
                  );
                } catch {
                  // Could not sync to extension
                }
              }

              // Track signup/signin in analytics
              trackFunnel(data.isNewUser ? 'user_signed_up' : 'user_signed_in', {
                provider: 'google',
                is_new_user: !!data.isNewUser,
              });

              setStatus('success');

              // Determine redirect based on URL param, response data, state, user type, or default
              let redirectPath = '/dashboard';  // Default

              // First check URL param (from backend redirect)
              // Only allow relative paths to prevent open redirect attacks
              const urlRedirectParam = searchParams.get('redirect');
              const isRelativePath = (path: string) => path.startsWith('/') && !path.startsWith('//');
              if (urlRedirectParam && isRelativePath(decodeURIComponent(urlRedirectParam))) {
                redirectPath = decodeURIComponent(urlRedirectParam);
              } else if (data.redirectAfterAuth && isRelativePath(data.redirectAfterAuth)) {
                redirectPath = data.redirectAfterAuth;
              } else if (stateData?.redirectAfterAuth && isRelativePath(stateData.redirectAfterAuth)) {
                redirectPath = stateData.redirectAfterAuth;
              } else if (data.isNewUser) {
                // New users go to cinematic onboarding (interview is step 2 inside)
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
                  const fromOnboarding = sessionStorage.getItem('onboarding_platform_step');
                  if (fromOnboarding) {
                    sessionStorage.removeItem('onboarding_platform_step');
                    window.location.href = '/onboarding?step=platform&connected=' + (stateData?.provider || '');
                  } else {
                    window.location.href = '/get-started?connected=true';
                  }
                }
              }, 1500);
            } else if (data.token && !isAuthOAuth && !isConnectorOAuth) {
              // Generic OAuth success (might be auth without explicit isAuth flag)
              localStorage.removeItem('demo_mode');
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_provider', 'google');

              // Store refresh token if provided
              if (data.refreshToken) {
                localStorage.setItem('refresh_token', data.refreshToken);
              }

              if (data.user) {
                localStorage.setItem('auth_user', JSON.stringify(data.user));
              }

              // Also store token in extension storage if extension is available
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                try {
                  chrome.runtime.sendMessage(
                    'acnofcjjfjaikcfnalggkkbghjaijepc', // Extension ID
                    { type: 'SET_AUTH_TOKEN', token: data.token },
                    () => {
                      // Chrome extension sync callback
                    }
                  );
                } catch {
                  // Could not sync to extension
                }
              }

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
        console.error('OAuth callback error:', error);

        // Clear the processing marker on error to allow retry
        const code = searchParams.get('code');
        if (code) {
          const processedKey = `oauth_processed_${code.substring(0, 32)}`;
          sessionStorage.removeItem(processedKey);
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
    // Don't show error icon until showError is true (prevents 401 flash)
    const displayStatus = status === 'error' && !showError ? 'loading' : status;
    switch (displayStatus) {
      case 'loading':
        return <Loader2 className="w-12 h-12 animate-spin" style={{ color: 'var(--foreground)' }} />;
      case 'success':
        return <CheckCircle className="w-12 h-12" style={{ color: 'var(--foreground)' }} />;
      case 'error':
        return <XCircle className="w-12 h-12" style={{ color: 'var(--foreground)' }} />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" >
      <div
        className="max-w-md w-full mx-4 p-8 text-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img
            src="/images/backgrounds/flower-hero.png"
            alt="Twin Me"
            className="w-10 h-10 object-contain drop-shadow-md"
          />
          <h1
            className="text-2xl"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}
          >
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
              <h2
                className="text-xl mb-2"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}
              >
                {displayStatus === 'loading' && 'Authenticating...'}
                {displayStatus === 'success' && 'Welcome!'}
                {displayStatus === 'error' && 'Authentication Failed'}
              </h2>

              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {displayMessage}
              </p>
            </>
          );
        })()}

        {/* Progress indicator for loading state */}
        {(status === 'loading' || (status === 'error' && !showError)) && (
          <div className="mt-6">
            <div className="w-full rounded-full h-1.5" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
              <div className="h-1.5 rounded-full w-3/5 transition-all duration-300" style={{ backgroundColor: '#000000' }} />
            </div>
          </div>
        )}

        {/* Error state - show retry button only after delay */}
        {status === 'error' && showError && (
          <button
            onClick={() => navigate('/auth')}
            className="mt-6 px-6 py-2 rounded-full"
            style={{ backgroundColor: '#10b77f', color: '#0a0f0a', fontWeight: 600 }}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
