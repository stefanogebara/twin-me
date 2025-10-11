import { SignedIn, SignedOut, SignInButton, SignUpButton, useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Brain, Users, Sparkles, Zap, ChevronRight, Shield, Trophy, Star } from 'lucide-react';

const Auth = () => {
  const { isSignedIn, isLoaded, user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    console.log('Auth component loaded. isSignedIn:', isSignedIn, 'isLoaded:', isLoaded, 'user:', user);
  }, [isSignedIn, isLoaded, user]);

  if (!mounted) return null;

  return (
    <>
      <SignedIn>
        <Navigate to="/" replace />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen flex" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
          {/* Left Panel - Hero Content */}
          <div className="hidden lg:flex lg:flex-1 flex-col justify-center px-12 xl:px-16">
            <div className="max-w-lg">
              {/* Logo/Brand */}
              <div className="flex items-center mb-12">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl mr-4"
                  style={{ backgroundColor: 'var(--_color-theme---accent)' }}
                >
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
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
              </div>

              {/* Hero Content */}
              <div className="space-y-6">
                <h2
                  className="text-4xl xl:text-5xl font-bold leading-tight"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    color: 'var(--_color-theme---text)'
                  }}
                >
                  Transform Your Teaching with
                  <span
                    className="block mt-2"
                    style={{ color: 'var(--_color-theme---accent)' }}
                  >
                    AI-Powered Twins
                  </span>
                </h2>

                <p
                  className="text-xl leading-relaxed"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  Create conversational AI twins that embody your unique teaching philosophy,
                  personality, and expertise. Reach every student in their preferred learning style.
                </p>

                {/* Feature Highlights */}
                <div className="space-y-4 mt-8">
                  {[
                    {
                      icon: <Users className="w-5 h-5" />,
                      text: "Personalized learning for every student"
                    },
                    {
                      icon: <Sparkles className="w-5 h-5" />,
                      text: "Preserve your teaching personality in AI"
                    },
                    {
                      icon: <Zap className="w-5 h-5" />,
                      text: "Scale your expertise beyond classroom limits"
                    }
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center space-x-3 group">
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 group-hover:scale-110"
                        style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}
                      >
                        <div style={{ color: 'var(--_color-theme---accent)' }}>
                          {feature.icon}
                        </div>
                      </div>
                      <span
                        className="text-base font-medium"
                        style={{ color: 'var(--_color-theme---text)' }}
                      >
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Social Proof */}
                <div className="mt-12 pt-8 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
                  <div className="flex items-center space-x-1 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" style={{ color: 'var(--_color-theme---accent)' }} />
                    ))}
                  </div>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--_color-theme---text-secondary)' }}
                  >
                    "Revolutionary approach to personalized education. My students are more engaged than ever."
                  </p>
                  <p
                    className="text-sm mt-2 font-medium"
                    style={{ color: 'var(--_color-theme---text)' }}
                  >
                    — Dr. Sarah Chen, Stanford University
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Authentication */}
          <div className="flex-1 lg:flex-none lg:w-96 xl:w-[28rem] flex items-center justify-center px-6 py-12">
            <div
              className="w-full max-w-sm p-8 rounded-2xl border backdrop-blur-sm"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)'
              }}
            >
              {/* Mobile Logo */}
              <div className="lg:hidden flex items-center justify-center mb-8">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl mr-3"
                  style={{ backgroundColor: 'var(--_color-theme---accent)' }}
                >
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <h1
                  className="text-xl font-bold"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    color: 'var(--_color-theme---text)'
                  }}
                >
                  Twin Me
                </h1>
              </div>

              {/* Auth Header */}
              <div className="text-center mb-8">
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    color: 'var(--_color-theme---text)'
                  }}
                >
                  Welcome Back
                </h2>
                <p
                  className="text-sm"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  Sign in to continue building your AI teaching twin
                </p>
              </div>

              {/* Auth Buttons */}
              <div className="space-y-4">
                <SignInButton
                  mode="modal"
                  fallbackRedirectUrl="/"
                  forceRedirectUrl="/"
                >
                  <button
                    className="w-full h-12 px-6 rounded-xl font-semibold transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg focus:scale-[1.02] focus:shadow-lg active:scale-[0.98] flex items-center justify-center space-x-2 group"
                    style={{
                      backgroundColor: 'var(--_color-theme---accent)',
                      color: 'white'
                    }}
                  >
                    <span>Sign In</span>
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </SignInButton>

                <SignUpButton
                  mode="modal"
                  fallbackRedirectUrl="/"
                  forceRedirectUrl="/"
                >
                  <button
                    className="w-full h-12 px-6 rounded-xl font-semibold border transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg focus:scale-[1.02] focus:shadow-lg active:scale-[0.98] group"
                    style={{
                      borderColor: 'var(--_color-theme---border)',
                      color: 'var(--_color-theme---text)',
                      backgroundColor: 'transparent'
                    }}
                  >
                    Create Your Twin
                  </button>
                </SignUpButton>
              </div>

              {/* Trust Signals */}
              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
                <div className="flex items-center justify-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4" style={{ color: 'var(--_color-theme---accent)' }} />
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--_color-theme---text-secondary)' }}
                    >
                      Secure
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-4 h-4" style={{ color: 'var(--_color-theme---accent)' }} />
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--_color-theme---text-secondary)' }}
                    >
                      Trusted by 1000+ educators
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile CTA */}
              <div className="lg:hidden mt-6 text-center">
                <p
                  className="text-xs"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  Join the future of personalized education
                </p>
              </div>
            </div>
          </div>

          {/* Background Pattern */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-5"
              style={{ backgroundColor: 'var(--_color-theme---accent)' }}
            />
            <div
              className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-5"
              style={{ backgroundColor: 'var(--_color-theme---accent)' }}
            />
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Auth;