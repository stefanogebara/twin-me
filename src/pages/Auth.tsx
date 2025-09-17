import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

const Auth = () => {
  return (
    <>
      <SignedIn>
        <Navigate to="/" replace />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            {/* Hero Section */}
            <div className="text-center mb-8">
              <h1 className="hero-text text-foreground mb-4">
                Welcome to Twin Me
              </h1>
              <p className="text-muted-foreground text-lg">
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
                <button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign In
                </button>
              </SignInButton>
              
              <SignUpButton 
                mode="modal"
                fallbackRedirectUrl="/"
                forceRedirectUrl="/"
              >
                <button className="w-full border border-border bg-background hover:bg-accent hover:text-accent-foreground h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </div>

            {/* Footer */}
            <div className="text-center mt-8 text-sm text-muted-foreground">
              <p>Join thousands of students learning with AI</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Auth;