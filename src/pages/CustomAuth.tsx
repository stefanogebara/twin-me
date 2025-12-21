import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithOAuth } = useAuth();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      // Get redirect parameter from URL if present
      const redirectAfterAuth = searchParams.get('redirect');
      await signInWithOAuth('google', redirectAfterAuth || undefined);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Google sign in failed';
      setError(errorMsg);
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
        {/* Header with icon */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: theme === 'dark'
                  ? 'linear-gradient(135deg, rgba(193, 192, 182, 0.2), rgba(193, 192, 182, 0.1))'
                  : 'linear-gradient(135deg, rgba(12, 10, 9, 0.1), rgba(12, 10, 9, 0.05))',
                border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.2)' : '1px solid rgba(12, 10, 9, 0.1)'
              }}
            >
              <Sparkles className="w-8 h-8" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
            </div>
          </div>
          <h1 className="text-4xl font-normal tracking-tight font-garamond" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
            Discover Your Soul Signature
          </h1>
          <p className="mt-3 text-[15px] leading-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
            Sign in with Google to begin your journey of authentic self-discovery
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="flex items-center gap-3 p-4 rounded-xl"
            style={{
              background: theme === 'dark' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(255, 235, 235, 0.5)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
            }}
          >
            <p className="text-sm" style={{ color: theme === 'dark' ? '#fca5a5' : '#991b1b' }}>{error}</p>
          </div>
        )}

        {/* Liquid Glass Card Container */}
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
            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 text-[15px] leading-5 font-medium border rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.9)',
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

            {/* Benefits list */}
            <div className="pt-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
                What you'll get
              </p>
              <ul className="space-y-2">
                {[
                  'Personalized soul signature based on your digital footprint',
                  'Privacy controls - you decide what to reveal',
                  'Connect multiple platforms for deeper insights'
                ].map((benefit, index) => (
                  <li key={index} className="flex items-start gap-2 text-[13px] leading-5" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}>
                    <span className="text-green-500 mt-0.5">✓</span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default CustomAuth;