import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Brain, Mail, Lock, User, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, signInWithOAuth } = useAuth();
  const { theme } = useTheme();

  const [mode, setMode] = useState<'signin' | 'signup'>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, firstName, lastName);
      }
      navigate('/get-started');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google') => {
    setLoading(true);
    setError('');
    try {
      // Get redirect parameter from URL if present
      const redirectAfterAuth = searchParams.get('redirect');
      await signInWithOAuth(provider, redirectAfterAuth || undefined);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : `${provider} sign in failed`;
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-20" style={{ backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA' }}>
      {/* Back button - top left */}
      <div className="fixed top-6 left-6 z-50">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium backdrop-blur-md rounded-lg transition-all duration-200"
          style={{
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
            backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.6)' : 'rgba(255, 255, 255, 0.6)',
            borderWidth: '1px',
            borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(231, 229, 228, 0.6)'
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
      </div>

      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-normal tracking-tight font-garamond" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            {mode === 'signin' ? 'Welcome Back' : 'Create Your Account'}
          </h1>
          <p className="mt-3 text-[15px] leading-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            {mode === 'signin'
              ? 'Sign in to continue your soul signature journey'
              : 'Almost there! Create your account to save your soul signature.'
            }
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="flex items-center gap-3 p-4 rounded-xl"
            style={{
              background: 'rgba(255, 235, 235, 0.5)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
            }}
          >
            <Mail className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Liquid Glass Form Container */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div className="p-8 space-y-6">

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleOAuthSignIn('google')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 text-[15px] leading-5 font-medium border rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                  borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)' }}></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3" style={{
                  backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
                }}>
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] leading-5 font-medium mb-1.5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                      First Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }} />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-[15px] leading-5 rounded-xl border focus:outline-none focus:ring-2 transition-all duration-200 backdrop-blur-sm"
                        style={{
                          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
                          color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                        }}
                        placeholder="John"
                        autoComplete="given-name"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] leading-5 font-medium mb-1.5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 text-[15px] leading-5 rounded-xl border focus:outline-none focus:ring-2 transition-all duration-200 backdrop-blur-sm"
                      style={{
                        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
                        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                      }}
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[13px] leading-5 font-medium mb-1.5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-[15px] leading-5 rounded-xl border focus:outline-none focus:ring-2 transition-all duration-200 backdrop-blur-sm"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                      borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                    placeholder="john@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] leading-5 font-medium mb-1.5" style={{ color: theme === 'dark' ? '#C1C0B6' : '#44403c' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 text-[15px] leading-5 rounded-xl border focus:outline-none focus:ring-2 transition-all duration-200 backdrop-blur-sm"
                    style={{
                      backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                      borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(231, 229, 228, 0.6)',
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                    placeholder="••••••••"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors"
                    style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-4 text-[15px] leading-5 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_2px_8px_0_rgba(0,0,0,0.1)]"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#ffffff'
                }}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {mode === 'signin' ? 'Signing In...' : 'Creating Account...'}
                  </div>
                ) : (
                  mode === 'signin' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="text-center mt-6">
              <button
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError('');
                }}
                className="text-[15px] leading-5 font-medium transition-colors"
                style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#44403c'
                }}
              >
                {mode === 'signin'
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomAuth;