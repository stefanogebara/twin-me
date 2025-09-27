import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Brain, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from 'lucide-react';

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, signInWithOAuth } = useAuth();

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
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google') => {
    try {
      await signInWithOAuth(provider);
    } catch (err: any) {
      setError(err.message || `${provider} sign in failed`);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-sm border-b" style={{ backgroundColor: 'var(--_color-theme---background)/90', borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm hover:opacity-70 transition-all hover:scale-105 px-3 py-2 rounded-lg"
              style={{ color: 'var(--_color-theme---text)', backgroundColor: 'var(--_color-theme---surface)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>

            <div className="flex items-center gap-2">
              <Brain className="w-6 h-6" style={{ color: 'var(--_color-theme---accent)' }} />
              <span className="text-xl font-bold" style={{ color: 'var(--_color-theme---text)', fontFamily: 'var(--_typography---font--styrene-a)' }}>
                Twin AI Learn
              </span>
            </div>

            <div className="w-20"></div> {/* Spacer for center alignment */}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-6 py-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div
            className="rounded-2xl p-8 border shadow-lg"
            style={{
              backgroundColor: 'var(--_color-theme---surface)',
              borderColor: 'var(--_color-theme---border)'
            }}
          >
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h1
                className="text-2xl font-bold mb-2"
                style={{ color: 'var(--_color-theme---text)', fontFamily: 'var(--_typography---font--styrene-a)' }}
              >
                {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p style={{ color: 'var(--_color-theme---text-secondary)' }}>
                {mode === 'signin'
                  ? 'Sign in to continue to your AI twins'
                  : 'Join thousands creating AI twins'
                }
              </p>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleOAuthSignIn('google')}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border transition-all hover:shadow-md"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--_color-theme---border)' }}></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span
                  className="px-2"
                  style={{
                    backgroundColor: 'var(--_color-theme---surface)',
                    color: 'var(--_color-theme---text-secondary)'
                  }}
                >
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--_color-theme---text)' }}>
                      First Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--_color-theme---text-secondary)' }} />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'var(--_color-theme---surface)',
                          borderColor: 'var(--_color-theme---border)',
                          color: 'var(--_color-theme---text)',
                          '--focus-ring-color': 'var(--_color-theme---accent)'
                        } as any}
                        placeholder="John"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--_color-theme---text)' }}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: 'var(--_color-theme---surface)',
                        borderColor: 'var(--_color-theme---border)',
                        color: 'var(--_color-theme---text)',
                        '--focus-ring-color': 'var(--_color-theme---accent)'
                      } as any}
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--_color-theme---text)' }}>
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--_color-theme---text-secondary)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--_color-theme---surface)',
                      borderColor: 'var(--_color-theme---border)',
                      color: 'var(--_color-theme---text)',
                      '--focus-ring-color': 'var(--_color-theme---accent)'
                    } as any}
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--_color-theme---text)' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--_color-theme---text-secondary)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 rounded-xl border focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--_color-theme---surface)',
                      borderColor: 'var(--_color-theme---border)',
                      color: 'var(--_color-theme---text)',
                      '--focus-ring-color': 'var(--_color-theme---accent)'
                    } as any}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" style={{ color: 'var(--_color-theme---text-secondary)' }} />
                    ) : (
                      <Eye className="w-4 h-4" style={{ color: 'var(--_color-theme---text-secondary)' }} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--_color-theme---accent)', color: 'white' }}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-sm hover:underline"
                style={{ color: 'var(--_color-theme---accent)' }}
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