import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { Component as AnimatedBackground } from '@/components/ui/open-ai-codex-animated-background';

const Auth = () => {
  return (
    <>
      <SignedIn>
        <Navigate to="/" replace />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen bg-slate-900 flex items-center justify-center relative overflow-hidden">
          {/* Animated Background */}
          <div className="absolute inset-0 w-full h-full opacity-20 -z-10">
            <AnimatedBackground />
          </div>
          
          <div className="max-w-md w-full mx-4 relative z-10">
            {/* Hero Section */}
            <div className="text-center mb-8">
              <h1 className="text-6xl md:text-7xl font-serif text-white mb-4 leading-tight italic">
                Welcome to Twin Me
              </h1>
              <p className="text-slate-300 text-lg font-medium">
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
                <button className="w-full border border-white/20 bg-white/10 text-white hover:bg-white/20 h-12 px-8 rounded-lg font-medium transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </div>

            {/* Footer */}
            <div className="text-center mt-8 text-sm text-slate-300">
              <p>Join thousands of students learning with AI</p>
            </div>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Auth;