import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Loader2, X, Check, Ticket } from 'lucide-react';
import { API_URL } from '@/services/api/apiBase';
import { ClassicBackground } from '../components/ClassicBackground';

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithOAuth, isSignedIn, isLoaded } = useAuth();
  const { trackFunnel } = useAnalytics();
  const { resolvedTheme } = useTheme();

  // Redirect already-signed-in users away from auth page, unless `?view=public`
  // is set (lets marketers QA the auth UI while signed-in and supports a
  // future "sign in as different user" flow without forcing a logout).
  useEffect(() => {
    if (searchParams.get('view') === 'public') return;
    if (isLoaded && isSignedIn) {
      // audit-2026-05-09 F-M3: honor ?redirect= for already-signed-in users
      // hitting /auth (e.g. came from a deep link). Allow only same-origin
      // relative paths so this can't be turned into an open-redirect vector.
      const redirectTo = searchParams.get('redirect');
      const safeRedirect =
        redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
          ? redirectTo
          : '/today';
      navigate(safeRedirect, { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate, searchParams]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  // Continuity from the landing reveal (hero inversion, 2026-08). The hero
  // stores the enrichment reading before sending the user here; without this
  // the auth page reads as a cold wall right after the product's best moment.
  // Signup then becomes "save what you already have", not "pay to enter"
  // (the Duolingo deferred-signup framing).
  const [reveal] = useState<{ name: string | null; line: string | null } | null>(() => {
    try {
      const raw = sessionStorage.getItem('twinme_discovery_data');
      if (!raw) return null;
      const d = JSON.parse(raw) as { discovered_name?: string | null; persona_summary?: string | null };
      const summary = (d.persona_summary || '').trim();
      if (!d.discovered_name && !summary) return null;
      // First sentence only — the card is a reminder, not the reading.
      const firstSentence = summary ? (summary.match(/^[^.!?]+[.!?]/)?.[0] || summary).trim() : null;
      return { name: d.discovered_name || null, line: firstSentence };
    } catch {
      return null;
    }
  });

  // A returning user has signed in on this device before, so the private-beta
  // gate does not apply to them — the server passes any existing user through.
  const [isReturning] = useState(() => !!localStorage.getItem('auth_user'));

  // Beta invite state
  const [inviteCode, setInviteCode] = useState('');
  const [inviteValid, setInviteValid] = useState(false);
  const [validating, setValidating] = useState(false);

  // On mount: check URL param or sessionStorage for invite code
  useEffect(() => {
    trackFunnel('auth_page_viewed', {});

    // Surface session-expired message from AuthContext init redirect (2026-04-22)
    // audit-2026-05-09 F-H1: were Portuguese strings — landing page is English
    // by default, English-speaking users were seeing PT-BR copy on the auth page.
    const urlError = searchParams.get('error');
    if (urlError === 'session_expired') {
      setError('Your session expired. Please sign in again.');
      // audit-2026-05-23: auto-recover from broken auth state. Some users
      // land here with a stale localStorage user + dead refresh cookie, and
      // re-attempting OAuth in that state can keep failing because half-set
      // session keys interfere with the fresh flow. Wipe everything auth-
      // adjacent so the next click on "Continue with Google" starts clean.
      // Preserve beta_invite_code and twinme_discovery_confirmed — those
      // gate the OAuth UI itself and are not part of the broken session.
      ['auth_user', 'auth_provider', 'twinme_account_created', 'demo_mode',
       'twin_chat_history', 'soul-signature-onboarding', 'twinme_interview_progress',
      ].forEach((k) => localStorage.removeItem(k));
      const preservedSession = {
        beta_invite_code: sessionStorage.getItem('beta_invite_code'),
        twinme_discovery_confirmed: sessionStorage.getItem('twinme_discovery_confirmed'),
      };
      sessionStorage.clear();
      Object.entries(preservedSession).forEach(([k, v]) => { if (v) sessionStorage.setItem(k, v); });
    } else if (urlError === 'invalid_state') {
      setError('Something went wrong with sign-in. Please try again.');
    }

    const urlCode = searchParams.get('invite');
    const storedCode = sessionStorage.getItem('beta_invite_code');
    // URL param always wins over stale sessionStorage
    const code = urlCode || storedCode || '';

    if (code) {
      setInviteCode(code);
      // Only persist if from URL (fresh) — sessionStorage already has stale one
      if (urlCode) sessionStorage.setItem('beta_invite_code', code);
      validateCode(code);
    } else if (sessionStorage.getItem('twinme_discovery_confirmed') === 'true') {
      // Users who completed discovery flow are pre-qualified — bypass invite gate
      setInviteValid(true);
    } else if (localStorage.getItem('auth_user') || localStorage.getItem('twinme_account_created') || localStorage.getItem('auth_provider')) {
      // Returning users who previously signed in — bypass invite gate for re-authentication
      setInviteValid(true);
    } else if (searchParams.get('mode') === 'signin') {
      // Direct sign-in link bypasses invite gate
      setInviteValid(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validateCode = useCallback(async (code: string) => {
    if (!code || code.trim().length < 4) {
      setInviteValid(false);
      if (code && code.trim().length > 0) setError('Code must be at least 4 characters');
      return;
    }
    setValidating(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/beta/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      setInviteValid(data.valid === true);
      if (data.valid) {
        sessionStorage.setItem('beta_invite_code', code.trim());
        trackFunnel('beta_invite_validated', { code: code.trim() });
      } else {
        setError(typeof data.error === 'string' ? data.error : 'Invalid invite code');
        sessionStorage.removeItem('beta_invite_code');
      }
    } catch {
      setInviteValid(false);
    } finally {
      setValidating(false);
    }
  }, [trackFunnel]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    trackFunnel('auth_initiated', { provider: 'google', has_invite: inviteValid });
    try {
      const redirectAfterAuth = searchParams.get('redirect');
      await signInWithOAuth('google', redirectAfterAuth || undefined);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Google sign in failed';
      setError(errorMsg);
      setLoading(false);
    }
  };

  // audit-2026-05-09 F-M2: magic-link email signin so /auth has a working path
  // even when Google OAuth is unavailable. Beta gate is enforced server-side
  // identically to the OAuth path.
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const handleMagicLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    setMagicLinkLoading(true);
    setError('');
    trackFunnel('auth_initiated', { provider: 'magic_link', has_invite: inviteValid });
    try {
      const redirectAfterAuth = searchParams.get('redirect') || undefined;
      const res = await fetch(`${API_URL}/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          inviteCode: inviteCode || undefined,
          redirect: redirectAfterAuth,
        }),
      });
      // Rate limited: surface a wait time from Retry-After (seconds) so the user
      // isn't told a misleading "network error" (audit-2026-07-03 error-ux).
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        setError(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? `Too many requests. Please wait ${retryAfter}s and try again.`
            : 'Too many requests. Please wait a moment and try again.',
        );
        return;
      }
      // Guard res.ok before .json(): a 5xx may return a non-JSON body, which
      // would throw an opaque parse error caught as a generic "network error".
      let data: { success?: boolean; error?: string } | null = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.ok && data?.success) {
        setMagicLinkSent(true);
      } else {
        // Coerce: a proxy/edge layer (e.g. Vercel deployment protection) can
        // return { error: {...} } — rendering an object crashes React (#31).
        setError(typeof data?.error === 'string' ? data.error : 'Could not send signin link. Try again in a moment.');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setMagicLinkLoading(false);
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
For questions about these terms, contact support@twinme.me`
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
For privacy concerns: privacy@twinme.me`
    }
  };

  return (
    <div
      className="min-h-screen flex relative"
    >
      {/* Like the landing, auth always presents the brand canvas — the
          DayNight photo background is an in-app preference, and the funnel
          reads as one product only if it holds one surface throughout. */}
      <ClassicBackground />

      {/* Left panel — form (glass card on mobile, clean on desktop) */}
      <div className="relative z-[1] flex-1 flex items-center justify-center px-4 sm:px-6">
      <div className="claura-glass w-full max-w-[420px] rounded-[24px] px-6 py-8">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
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

        {/* Heading — the page is a signup for most people who reach it, so it
            must not greet them with "Sign in". Three states: arriving from the
            landing reveal, returning, or new. */}
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
          {reveal ? 'Keep your reading' : isReturning ? 'Welcome back' : 'Create your twin'}
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}
        >
          {reveal
            ? 'Your twin starts here. Create an account and it keeps learning.'
            : isReturning
              ? 'Sign in to your soul signature.'
              : 'One account. Your data stays yours, and you can delete it anytime.'}
        </p>

        {/* Continuity card — what the landing already found about them */}
        {reveal && (
          <div
            className="mb-8 px-4 py-3.5 rounded-[12px]"
            style={{
              backgroundColor: 'var(--glass-surface-bg)',
              border: '1px solid var(--glass-surface-border)',
            }}
          >
            <p
              className="text-[10px] uppercase tracking-[0.14em] mb-2"
              style={{ color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}
            >
              {reveal.name ? `Your first reading, ${reveal.name.split(' ')[0]}` : 'Your first reading'}
            </p>
            {reveal.line && (
              <p
                className="text-[14px] leading-relaxed"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  color: 'var(--text-narrative)',
                }}
              >
                {reveal.line}
              </p>
            )}
          </div>
        )}

        {/* Beta invite code section.
            When inviteValid is true but a top-level error is also showing
            (e.g. /auth?error=session_expired bounce-back), suppress the
            green "Access granted" badge entirely — otherwise the page reads
            as "✓ access granted ✗ session expired" which is contradictory
            from the user's POV. The badge returns on the next successful
            render. We still keep inviteValid=true so the user is NOT asked
            to re-enter their invite code; only the badge UI is hidden.
            Audit 2026-05-22. */}
        {inviteValid ? (
          error ? null : (
          <div
            className="flex items-center gap-2.5 mb-6 py-3 px-4 rounded-lg"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--glass-surface-border)',
            }}
          >
            <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--foreground)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>
              {inviteCode ? (
                <>Invite code: <strong style={{ color: 'var(--foreground)', letterSpacing: '1px' }}>{inviteCode}</strong></>
              ) : (
                'Access granted'
              )}
            </span>
          </div>
          )
        ) : isReturning ? null : (
          <div className="mb-6">
            {/* The gate is a fact about the product, not a bouncer. Saying so
                costs one line and stops the cold-form read. */}
            <p
              className="text-[13px] mb-2.5 leading-relaxed"
              style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}
            >
              TwinMe is in private beta — enter your invite code to claim a place.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-placeholder)' }} />
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value);
                    setError('');
                    setInviteValid(false);
                  }}
                  placeholder="Enter invite code"
                  className="w-full h-10 pl-9 pr-3 rounded-[12px] text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--input)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && validateCode(inviteCode)}
                />
              </div>
              <button
                onClick={() => validateCode(inviteCode)}
                disabled={validating || inviteCode.length < 4}
                className="h-10 px-4 rounded-[12px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{
                  background: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
              </button>
            </div>
            <p className="text-[12px] mt-2" style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>
              No code?{' '}
              <button
                onClick={() => navigate('/waitlist')}
                className="underline transition-opacity hover:opacity-70 min-h-[44px] inline-flex items-center"
                style={{ color: 'var(--text-secondary)' }}
              >
                Join the waitlist
              </button>
            </p>
          </div>
        )}

        {/* Email hint */}
        {searchParams.get('email') && (
          <div
            className="text-sm mb-6 py-3 px-4 rounded-[12px]"
            style={{
              backgroundColor: 'var(--glass-surface-bg)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-secondary)',
            }}
          >
            Signing up as <strong style={{ color: 'var(--foreground)' }}>{searchParams.get('email')}</strong>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="text-sm mb-6 py-3 px-4 rounded-[10px]"
            style={{
              backgroundColor: 'rgba(220, 38, 38, 0.10)',
              border: '1px solid rgba(220, 38, 38, 0.35)',
              color: 'var(--claura-danger-ink)',
            }}
          >
            {error}
          </div>
        )}

        {/* Google sign-in */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 h-12 rounded-[12px] text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-lg disabled:opacity-50"
          style={{
            background: 'var(--claura-bone)',
            color: 'var(--claura-bone-ink)',
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
        {!inviteValid && !isReturning && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}>
            New here? Add your invite code above first.
          </p>
        )}

        {/* audit-2026-05-09 F-M2: magic-link email signin (fallback path) */}
        <div className="mt-5 flex items-center gap-3" aria-hidden="true">
          <div className="flex-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}>or</span>
          <div className="flex-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
        </div>

        {magicLinkSent ? (
          <div
            className="mt-5 rounded-[12px] px-4 py-3.5 text-sm text-center"
            style={{
              backgroundColor: 'var(--glass-surface-bg)',
              border: '1px solid var(--glass-surface-border)',
              color: 'var(--foreground)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Check your email for a signin link.<br/>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              It works once and expires in 15 minutes.
            </span>
          </div>
        ) : (
          <form onSubmit={handleMagicLinkRequest} className="mt-5 flex flex-col gap-2.5">
            <input
              type="email"
              autoComplete="email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-12 px-4 rounded-[12px] text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--glass-surface-bg)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--foreground)',
                fontFamily: "'Inter', sans-serif",
              }}
            />
            <button
              type="submit"
              disabled={magicLinkLoading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-[12px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--glass-surface-bg)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--foreground)',
                fontFamily: "'Inter', sans-serif",
                cursor: magicLinkLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {magicLinkLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Email me a signin link</span>
              )}
            </button>
          </form>
        )}

        {/* Divider */}
        <div className="my-8" style={{ borderTop: '1px solid var(--border-glass)' }} />

        {/* Terms */}
        <p
          className="text-center text-[12px] leading-relaxed"
          style={{ color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}
        >
          By continuing, you agree to our{' '}
          <button
            onClick={() => setActiveModal('terms')}
            className="underline transition-opacity hover:opacity-70 min-h-[44px] inline-flex items-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            Terms of Service
          </button>
          {' '}and{' '}
          <button
            onClick={() => setActiveModal('privacy')}
            className="underline transition-opacity hover:opacity-70 min-h-[44px] inline-flex items-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            Privacy Policy
          </button>
        </p>

        {/* Explore link */}
        <p
          className="text-center text-[13px] mt-6"
          style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}
        >
          New here?{' '}
          <button
            onClick={() => navigate('/')}
            className="transition-opacity hover:opacity-70"
            style={{ color: 'var(--foreground)' }}
          >
            Learn more
          </button>
        </p>

        {/* Footer */}
        <div className="mt-10 text-center">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            &copy; 2026 TwinMe Inc.
          </span>
        </div>
      </div>
      </div>

      {/* Right panel — the Claura canvas, not photography. The photoreal
          cosmic-swirl / soul-waves pair was a fourth visual language between
          the landing and the app (hero inversion, 2026-08); the funnel now
          holds one system end to end: charcoal + the four ambient orbs. */}
      <div
        className="claura-glass hidden lg:flex relative z-[1] flex-1 m-4 ml-0 flex-col items-center justify-center px-12 overflow-hidden"
        style={{ borderRadius: '24px' }}
      >
        {/* A breath of amber inside the glass so the panel has its own light
            rather than repeating the canvas behind it. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: [
              'radial-gradient(ellipse 70% 55% at 22% 14%, rgba(210,145,55,0.20) 0%, transparent 68%)',
              'radial-gradient(ellipse 60% 50% at 78% 88%, rgba(160,95,55,0.16) 0%, transparent 66%)',
              'radial-gradient(ellipse 50% 45% at 82% 34%, rgba(93,92,174,0.12) 0%, transparent 62%)',
            ].join(','),
            borderRadius: '24px',
          }}
        />
        {/* No halation here: that glow existed to lift text off a busy photo.
            On the canvas it only muddies the type. */}
        <h2
          className="relative text-center mb-5"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '36px',
            fontWeight: 400,
            letterSpacing: '-0.72px',
            lineHeight: 1.15,
            color: 'var(--claura-text)',
          }}
        >
          Your soul signature
          <br />
          starts here
        </h2>

        <p
          className="relative text-center max-w-[340px] mb-9"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'var(--claura-narr)',
          }}
        >
          Connect what you actually use, and meet the twin that reads your patterns
          instead of your resume.
        </p>

        {/* The commitment moment is where uncertainty peaks — answer it with
            the three facts people actually hesitate over (Plaid trust-gap). */}
        <ul className="relative flex flex-col gap-3 w-full max-w-[300px]">
          {[
            'Read-only. It can never post or delete.',
            'Your data is never used to train models.',
            'Delete everything, anytime, in one click.',
          ].map((fact) => (
            <li key={fact} className="flex items-start gap-2.5">
              <Check
                className="w-3.5 h-3.5 mt-[3px] flex-shrink-0"
                style={{ color: 'var(--claura-narr)' }}
              />
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: 'var(--claura-narr)',
                }}
              >
                {fact}
              </span>
            </li>
          ))}
        </ul>
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
              backgroundColor: 'var(--background)',
              border: '1px solid var(--border-glass)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-glass)' }}
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
                aria-label="Close"
                className="p-1 transition-opacity hover:opacity-60"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
              <pre
                className="whitespace-pre-wrap text-[13px] leading-relaxed"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: 'var(--text-secondary)',
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
