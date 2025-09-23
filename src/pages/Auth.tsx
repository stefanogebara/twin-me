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
        <div className="min-h-screen bg-[hsl(var(--lenny-cream))] flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            {/* Hero Section */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-display font-medium text-[hsl(var(--lenny-black))] mb-4 gradient-text">
                Welcome to Twin Me
              </h1>
              <p className="text-[hsl(var(--muted-foreground))] text-lg">
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
                <button className="w-full btn-lenny h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign In
                </button>
              </SignInButton>

              <SignUpButton
                mode="modal"
                fallbackRedirectUrl="/"
                forceRedirectUrl="/"
              >
                <button className="w-full btn-lenny-secondary h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </div>

            {/* Footer */}
            <div className="text-center mt-8 text-sm text-[hsl(var(--muted-foreground))]">
              <p>Join thousands of students learning with AI</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Auth;