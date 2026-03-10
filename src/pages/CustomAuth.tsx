import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { Loader2, X } from 'lucide-react';

// Figma Sundust tokens — dark mode
const BG = '#1b1818';
const FG = '#fdfcfb';
const TEXT_SEC = '#d9d1cb';
const TEXT_MUTED = '#86807b';
const TEXT_SUBTLE = '#4a4242';
const BUTTON_PRIMARY_BG = '#fdfcfb';
const BUTTON_PRIMARY_FG = '#1b1818';

// Hero glow — Figma radial gradient (amber orb, matches landing page)
const HERO_GLOW = `radial-gradient(ellipse at 50% 50%,
  rgba(193,126,44,1)     0%,
  rgba(255,132,0,0.85)   12%,
  rgba(224,129,22,0.6)   28%,
  rgba(194,85,78,0.35)   50%,
  rgba(195,45,112,0.1)   72%,
  rgba(195,45,112,0)     100%
)`;

// Right panel base gradient — purple/cosmic backdrop
const PANEL_BG = 'linear-gradient(160deg, #1c1630 0%, #3a1f5e 35%, #5a1e3e 65%, #1a0e1a 100%)';

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
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', overflow: 'hidden' }}>

      {/* ── Left panel: form ─────────────────────────────── */}
      <div style={{
        width: '50%',
        minWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 80px',
        position: 'relative',
      }}>

        {/* Logo */}
        <div style={{ position: 'absolute', top: '40px', left: '48px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
          }}>
            <img src="/images/backgrounds/flower.png" alt="TwinMe" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
          </div>
          <span style={{
            fontFamily: "'Halant', 'Instrument Serif', Georgia, serif",
            fontSize: '25px',
            letterSpacing: '-0.5px',
            color: FG,
            lineHeight: 1,
          }}>TwinMe</span>
        </div>

        {/* Form container */}
        <div style={{ width: '100%', maxWidth: '390px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Email hint banner */}
          {searchParams.get('email') && (
            <div style={{
              background: 'rgba(72, 65, 65, 0.6)',
              border: '1px solid rgba(94, 86, 86, 0.6)',
              borderRadius: '10px',
              padding: '12px 16px',
              textAlign: 'center',
              fontSize: '13px',
              color: '#f97316',
            }}>
              Signing up as <strong>{searchParams.get('email')}</strong>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '13px',
              color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          {/* Heading */}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontFamily: "'Halant', 'Instrument Serif', Georgia, serif",
              fontSize: '36px',
              fontWeight: 400,
              letterSpacing: '-0.72px',
              lineHeight: 1.5,
              color: FG,
              margin: 0,
            }}>
              Welcome back
            </h1>
            <p style={{ marginTop: '8px', fontSize: '14px', color: TEXT_MUTED, lineHeight: 1.5 }}>
              Sign in to discover your soul signature
            </p>
          </div>

          {/* Google sign-in button — primary white */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              height: '44px',
              borderRadius: '8px',
              backgroundColor: BUTTON_PRIMARY_BG,
              color: BUTTON_PRIMARY_FG,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontSize: '14px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              letterSpacing: '-0.14px',
              transition: 'opacity 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
            onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            {loading ? (
              <>
                <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                <span>Connecting…</span>
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

          {/* Terms */}
          <p style={{ textAlign: 'center', fontSize: '12px', color: TEXT_SUBTLE, lineHeight: 1.6, margin: 0 }}>
            By continuing, you agree to our{' '}
            <button
              onClick={() => setActiveModal('terms')}
              style={{ background: 'none', border: 'none', color: FG, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}
            >
              Terms of Service
            </button>
            {' '}and{' '}
            <button
              onClick={() => setActiveModal('privacy')}
              style={{ background: 'none', border: 'none', color: FG, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}
            >
              Privacy Policy
            </button>
          </p>

          {/* Back link */}
          <p style={{ textAlign: 'center', fontSize: '13px', color: TEXT_SUBTLE, margin: 0 }}>
            New here?{' '}
            <button
              onClick={() => navigate('/discover')}
              style={{ background: 'none', border: 'none', color: FG, fontWeight: 500, cursor: 'pointer', fontSize: '13px', fontFamily: "'Inter', sans-serif" }}
            >
              Learn more
            </button>
          </p>
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: '24px', left: 0, right: 0, textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: TEXT_MUTED }}>© 2026 TwinMe Inc.</span>
        </div>
      </div>

      {/* ── Right panel: flower visual (Figma layout) ────── */}
      <div style={{
        flex: 1,
        margin: '16px 16px 16px 0',
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden',
        background: '#0e0c0c',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '48px',
        minWidth: 0,
      }}>

        {/* Amber glow overlay (Figma hero glow — blurred) */}
        <div style={{
          position: 'absolute',
          left: 'calc(50% - 260px)',
          top: '-60px',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: HERO_GLOW,
          opacity: 0.5,
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }} />

        {/* Bottom gradient fade for text legibility */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '55%',
          background: 'linear-gradient(to top, rgba(14,12,12,1) 40%, rgba(14,12,12,0.7) 70%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Small chatbox UI element — Figma center piece */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '320px',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          background: 'rgba(72, 65, 65, 0.55)',
          border: '1px solid rgba(94, 86, 86, 0.5)',
          borderRadius: '20px',
          padding: '16px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          <p style={{ fontSize: '14px', color: TEXT_MUTED, fontFamily: "'Inter', sans-serif", margin: 0, lineHeight: 1.4 }}>
            What makes you authentically you?
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: TEXT_SUBTLE, fontFamily: "'Inter', sans-serif", background: 'rgba(94,86,86,0.4)', padding: '2px 10px', borderRadius: '100px' }}>Explore</span>
              <span style={{ fontSize: '12px', color: TEXT_SUBTLE, fontFamily: "'Inter', sans-serif", background: 'rgba(94,86,86,0.4)', padding: '2px 10px', borderRadius: '6px' }}>Platforms</span>
            </div>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: BUTTON_PRIMARY_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 10V2M2 6L6 2L10 6" stroke={BUTTON_PRIMARY_FG} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Bottom text content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{
            fontSize: '11px',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: 'rgba(253, 252, 251, 0.4)',
            marginBottom: '12px',
          }}>
            Soul Signature Platform
          </p>
          <h2 style={{
            fontFamily: "'Halant', 'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(28px, 3.2vw, 42px)',
            fontWeight: 400,
            letterSpacing: '-0.5px',
            lineHeight: 1.2,
            color: FG,
            margin: 0,
            maxWidth: '400px',
          }}>
            Your twin is waiting
          </h2>
          <p style={{
            marginTop: '14px',
            fontSize: '14px',
            color: 'rgba(253, 252, 251, 0.55)',
            lineHeight: 1.6,
            maxWidth: '320px',
            fontFamily: "'Inter', sans-serif",
          }}>
            Connect your platforms. Discover patterns you've never noticed. Meet the most accurate version of you.
          </p>
        </div>
      </div>

      {/* ── Modal ─────────────────────────────────────────── */}
      {activeModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setActiveModal(null)}
        >
          <div style={{
            position: 'absolute', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
          }} />
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '80vh',
              overflow: 'hidden',
              borderRadius: '20px',
              background: 'rgba(37, 34, 34, 0.95)',
              border: '1px solid rgba(94, 86, 86, 0.5)',
              backdropFilter: 'blur(42px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '1px solid rgba(94, 86, 86, 0.4)',
            }}>
              <h2 style={{
                fontFamily: "'Halant', Georgia, serif",
                fontSize: '20px', fontWeight: 400,
                letterSpacing: '-0.3px', color: FG, margin: 0,
              }}>
                {modalContent[activeModal].title}
              </h2>
              <button
                onClick={() => setActiveModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SEC, padding: '4px' }}
              >
                <X style={{ width: '20px', height: '20px' }} />
              </button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(80vh - 64px)' }}>
              <pre style={{
                whiteSpace: 'pre-wrap', fontFamily: "'Inter', sans-serif",
                fontSize: '13px', lineHeight: 1.7, color: TEXT_SEC, margin: 0,
              }}>
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
