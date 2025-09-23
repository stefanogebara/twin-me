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
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            {/* Hero Section */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-[#1A1A4B] mb-4">
                Welcome to Twin Me
              </h1>
              <p className="text-gray-600 text-lg">
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
                <button className="w-full bg-[#FF5722] text-white hover:bg-[#FF5722]/90 h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign In
                </button>
              </SignInButton>

              <SignUpButton
                mode="modal"
                fallbackRedirectUrl="/"
                forceRedirectUrl="/"
              >
                <button className="w-full border border-[#1A1A4B] bg-white hover:bg-[#1A1A4B] hover:text-white h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </div>

            {/* Footer */}
            <div className="text-center mt-8 text-sm text-gray-500">
              <p>Join thousands of students learning with AI</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Auth;