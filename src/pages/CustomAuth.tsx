import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { Loader2, X } from 'lucide-react';

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
      content: `Last updated: March 2026

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
      content: `Last updated: March 2026

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
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: '#0a0f0a' }}
    >
      {/* Left panel — form (glass surface per Design Rule #1) */}
      <div className="flex-1 flex items-center justify-center px-6">
      <div
        className="w-full max-w-[420px]"
        style={{
          background: 'var(--glass-surface-bg, rgba(72,65,65,0.6))',
          backdropFilter: 'blur(51px)',
          WebkitBackdropFilter: 'blur(51px)',
          border: '1px solid var(--glass-surface-border, rgba(94,86,86,0.6))',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >

        {/* Logo */}
        <div className="flex items-center gap-2 mb-16">
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
            <img
              src="/images/backgrounds/flower.png"
              alt="TwinMe"
              className="w-full h-full object-cover"
            />
          </div>
          <span
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '22px',
              letterSpacing: '-0.5px',
              color: 'var(--foreground)',
            }}
          >
            TwinMe
          </span>
        </div>

        {/* Heading */}
        <h1
          className="mb-2"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '32px',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--foreground)',
          }}
        >
          Welcome back
        </h1>
        <p
          className="text-sm mb-10"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          Sign in to discover your soul signature
        </p>

        {/* Email hint */}
        {searchParams.get('email') && (
          <div
            className="text-sm mb-6 py-3 px-4 rounded-lg"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Signing up as <strong style={{ color: 'var(--foreground)' }}>{searchParams.get('email')}</strong>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="text-sm mb-6 py-3 px-4 rounded-lg"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
            }}
          >
            {error}
          </div>
        )}

        {/* Google sign-in */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 h-11 rounded-[6px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--foreground)',
            color: '#0a0f0a',
            fontFamily: "'Inter', sans-serif",
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
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
        <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* Terms */}
        <p
          className="text-center text-[12px] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
        >
          By continuing, you agree to our{' '}
          <button
            onClick={() => setActiveModal('terms')}
            className="underline transition-opacity hover:opacity-70"
            style={{ color: 'rgba(255,255,255,0.65)' }}
          >
            Terms of Service
          </button>
          {' '}and{' '}
          <button
            onClick={() => setActiveModal('privacy')}
            className="underline transition-opacity hover:opacity-70"
            style={{ color: 'rgba(255,255,255,0.65)' }}
          >
            Privacy Policy
          </button>
        </p>

        {/* Explore link */}
        <p
          className="text-center text-[13px] mt-6"
          style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}
        >
          New here?{' '}
          <button
            onClick={() => navigate('/discover')}
            className="transition-opacity hover:opacity-70"
            style={{ color: '#ff8400' }}
          >
            Learn more
          </button>
        </p>

        {/* Footer */}
        <div className="mt-20 text-center">
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
            &copy; 2026 TwinMe Inc.
          </span>
        </div>
      </div>
      </div>

      {/* Right panel — Figma Sundust gradient */}
      <div
        className="hidden lg:flex flex-1 m-4 ml-0 flex-col items-center justify-center px-12"
        style={{
          background: `linear-gradient(90deg, rgba(236,13,13,0.2) 0%, rgba(236,13,13,0.2) 100%),
            linear-gradient(180deg, rgb(51,52,160) 0%, rgb(131,156,174) 30.3%, rgb(114,149,179) 38.9%,
              rgb(90,90,107) 65.4%, rgb(97,74,74) 86.5%, rgb(95,76,139) 100%)`,
          borderRadius: '24px',
        }}
      >
        {/* Decorative ring */}
        <div
          className="w-20 h-20 rounded-full mb-10 flex-shrink-0"
          style={{
            border: '1.5px solid rgba(255,255,255,0.15)',
            background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
          }}
        />

        <h2
          className="text-center mb-4"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '36px',
            fontWeight: 400,
            letterSpacing: '-0.72px',
            lineHeight: 1.15,
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          Your soul signature
          <br />
          awaits
        </h2>

        <p
          className="text-center max-w-[320px]"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          Connect your platforms, discover your patterns, meet your digital twin.
        </p>
      </div>

      {/* Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setActiveModal(null)}
        >
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} />
          <div
            className="relative w-full max-w-[600px] max-h-[80vh] overflow-hidden rounded-xl"
            style={{
              backgroundColor: '#111511',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <h2
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '20px',
                  fontWeight: 400,
                  color: 'var(--foreground)',
                }}
              >
                {modalContent[activeModal].title}
              </h2>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 transition-opacity hover:opacity-60"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
              <pre
                className="whitespace-pre-wrap text-[13px] leading-relaxed"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: 'rgba(255,255,255,0.5)',
                  margin: 0,
                }}
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
