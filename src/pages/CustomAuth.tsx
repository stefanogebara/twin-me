import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { ChevronLeft, Loader2, X } from 'lucide-react';

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithOAuth } = useAuth();
  const { trackFunnel } = useAnalytics();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    trackFunnel('auth_initiated', { provider: 'google' });
    try {
      const redirectAfterAuth = searchParams.get('redirect');
      await signInWithOAuth('google', redirectAfterAuth || undefined);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Google sign in failed';
      setError(errorMsg);
      setLoading(false);
    }
  };

  const modalContent = {
    terms: {
      title: 'Terms of Service',
      content: `Last updated: January 2025

1. Acceptance of Terms
By accessing and using Twin Me, you agree to be bound by these Terms of Service. If you do not agree, please do not use our service.

2. Description of Service
Twin Me provides a digital twin platform that analyzes your connected platform data to generate personalized insights and recommendations.

3. User Data & Privacy
- You retain ownership of all data you provide
- We process data only to provide our services
- You can delete your data at any time
- See our Privacy Policy for details

4. User Responsibilities
- Provide accurate information
- Maintain the security of your account
- Use the service in compliance with applicable laws
- Do not attempt to reverse engineer the service

5. Intellectual Property
All platform content, design, and technology remain our property. Your generated insights and soul signature are yours.

6. Limitation of Liability
The service is provided "as is" without warranties. We are not liable for indirect, incidental, or consequential damages.

7. Changes to Terms
We may update these terms. Continued use constitutes acceptance of changes.

8. Contact
For questions about these terms, contact support@twinme.ai`
    },
    privacy: {
      title: 'Privacy Policy',
      content: `Last updated: January 2025

1. Information We Collect
- Account information (email, name from Google OAuth)
- Connected platform data (Spotify, Calendar, YouTube, etc.)
- Usage analytics and preferences

2. How We Use Your Information
- Generate your personalized Soul Signature
- Provide music and wellness recommendations
- Improve our AI algorithms
- Send relevant notifications (with your consent)

3. Data Storage & Security
- Data is encrypted in transit and at rest
- We use Supabase (PostgreSQL) for secure storage
- Access is limited to authorized personnel only

4. Your Privacy Controls
- Choose what data to share via Privacy Spectrum
- Disconnect platforms at any time
- Export or delete your data on request
- Control notification preferences

5. Third-Party Services
- We use Google OAuth for authentication
- Connected platforms have their own privacy policies
- We do not sell your data to third parties

6. Data Retention
- Active accounts: data retained while account exists
- Deleted accounts: data removed within 30 days
- Anonymous analytics may be retained indefinitely

7. Children's Privacy
Our service is not intended for users under 13.

8. International Users
Data may be processed in the United States.

9. Updates to This Policy
We'll notify you of significant changes via email.

10. Contact Us
For privacy concerns: privacy@twinme.ai`
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar: logo left, back to home right */}
      <div className="w-full flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/images/backgrounds/flower-hero.png"
            alt="Twin Me"
            className="w-8 h-8 object-contain drop-shadow-md"
          />
          <span className="heading-serif text-lg" style={{ color: 'var(--foreground)' }}>
            Twin Me
          </span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          Back to home
        </button>
      </div>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md space-y-8">
          {/* Email hint banner */}
          {searchParams.get('email') && (
            <div
              className="rounded-xl p-4 text-center text-sm"
              style={{
                background: 'var(--glass-surface-bg)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--accent-vibrant)',
              }}
            >
              Signing up as <strong>{searchParams.get('email')}</strong> — continue with Google
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="alert-error">
              <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
            </div>
          )}

          {/* Glass Card Container */}
          <div
            className="glass-card overflow-hidden"
          >
            <div className="p-8 space-y-6">
              {/* Flower icon */}
              <div className="flex justify-center">
                <img
                  src="/images/backgrounds/flower-hero.png"
                  alt=""
                  className="w-12 h-12 object-contain drop-shadow-md"
                />
              </div>

              {/* Heading + Subtitle */}
              <div className="text-center">
                <h1 className="heading-serif text-3xl md:text-4xl font-normal tracking-tight">
                  Twin Me
                </h1>
                <p className="mt-3 text-[15px] leading-6" style={{ color: 'var(--text-secondary)' }}>
                  Sign in to discover your soul signature
                </p>
              </div>

              {/* Google Sign In Button — white filled */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 text-[15px] leading-5 font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  backgroundColor: '#faf9f6',
                  color: '#1a1a17',
                  border: '1px solid var(--glass-surface-border)',
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

              {/* Divider */}
              <div className="divider">
                <span className="divider-text uppercase" style={{ background: 'transparent' }}>or</span>
              </div>

              {/* Terms text */}
              <p className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                By continuing, you agree to our{' '}
                <button
                  onClick={() => setActiveModal('terms')}
                  className="underline font-semibold hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--foreground)' }}
                >
                  Terms of Service
                </button>
                {' '}and{' '}
                <button
                  onClick={() => setActiveModal('privacy')}
                  className="underline font-semibold hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--foreground)' }}
                >
                  Privacy Policy
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full py-6 text-center">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          &copy; 2026 Twin Me. All rights reserved.
        </p>
      </div>

      {/* Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setActiveModal(null)}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)'
            }}
          />
          {/* Modal content */}
          <div
            className="glass-card relative w-full max-w-2xl max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--glass-surface-border)' }}
            >
              <h2 className="heading-serif text-xl">
                {modalContent[activeModal].title}
              </h2>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                style={{ color: 'var(--foreground)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <pre
                className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {modalContent[activeModal].content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomAuth;
