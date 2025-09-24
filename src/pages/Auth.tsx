import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { useEffect } from 'react';

const Auth = () => {
  const { isSignedIn, isLoaded, user } = useUser();

  useEffect(() => {
    console.log('Auth component loaded. isSignedIn:', isSignedIn, 'isLoaded:', isLoaded, 'user:', user);
  }, [isSignedIn, isLoaded, user]);

  return (
    <>
      <SignedIn>
        <Navigate to="/" replace />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
          <div className="max-w-md w-full mx-4">
            {/* Hero Section */}
            <div className="text-center mb-8">
              <h1 className="u-display-l text-heading mb-4" style={{ color: 'var(--_color-theme---text)' }}>
                Welcome to Twin Me
              </h1>
              <p className="text-body-large" style={{ color: 'var(--_color-theme---text)' }}>
                Your AI-powered educational platform
              </p>
            </div>

            {/* Auth Buttons */}
            <div className="space-y-4">
              <SignInButton
                mode="modal"
                fallbackRedirectUrl="/"
                forceRedirectUrl="/"
              >
                <button className="w-full btn-anthropic-primary h-12">
                  Sign In
                </button>
              </SignInButton>

              <SignUpButton
                mode="modal"
                fallbackRedirectUrl="/"
                forceRedirectUrl="/"
              >
                <button className="w-full btn-anthropic-secondary h-12">
                  Sign Up
                </button>
              </SignUpButton>
            </div>

            {/* Footer */}
            <div className="text-center mt-8">
              <p className="text-body text-sm opacity-70">Join thousands of educators and students using AI twins</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Auth;