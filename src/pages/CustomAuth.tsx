import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { API_URL } from '@/services/api/apiBase';
import '@/styles/presence-cosmos.css';

/**
 * /auth — the sign-in frame shared with /presence/login and /waitlist (Auth section of
 * presence-cosmos.css), in the register since 2026-09-12: a flat page, a 360px column
 * with the mark, a title, one grey line, the warm field box, one 48/12 call to action
 * and 32/4 for everything else; on wide screens the photograph is the right half.
 *
 * The logic is unchanged from the Nocturne version: signed-in redirect honoring a safe
 * ?redirect=, the landing-reveal continuity card, the private-beta invite gate with its
 * bypasses, Google OAuth, the magic-link fallback, session-expired cleanup, and the
 * terms/privacy modals.
 */

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" />
      <circle cx="14" cy="5" r="2.7" />
      <circle cx="23" cy="5" r="2.7" />
      <circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" />
      <circle cx="14" cy="23" r="2.7" />
      <circle cx="5" cy="23" r="2.7" />
      <circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

const LEGAL = {
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
For questions about these terms, contact support@twinme.me`,
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
For privacy concerns: privacy@twinme.me`,
  },
} as const;

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithOAuth, isSignedIn, isLoaded } = useAuth();
  const { trackFunnel } = useAnalytics();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Sign in · TwinMe';
    return () => { document.title = previousTitle; };
  }, []);

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
  // Signup then becomes "save what you already have", not "pay to enter".
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

  const emailHint = searchParams.get('email');

  return (
    <main className="presence-cosmos pc-app" id="main-content">
      <div className="pc-auth" style={{ ["--auth-still" as string]: "url('/images/twinme/cosmos-07-room.jpg')" } as React.CSSProperties}>
        <section className="pc-auth-left">
          <Link className="pc-auth-back" to="/"><ArrowLeft size={14} /> TwinMe</Link>

          <div className="pc-auth-card">
            <Mark />
            {/* The page is a signup for most people who reach it, so it must not
                greet them with "Sign in". Three states: arriving from the landing
                reveal, returning, or new. */}
            <h1 className="pc-apphead-title">
              {reveal ? 'Keep your reading.' : isReturning ? 'Welcome back.' : 'Create your twin.'}
            </h1>
            <p className="pc-apphead-line">
              {reveal ? 'One account, and it keeps learning.' : isReturning ? 'Sign in to your twin.' : 'Your data stays yours.'}
            </p>

            {/* Continuity row: what the landing already found about them. */}
            {reveal ? (
              <ul className="pc-list pc-auth-block">
                <li className="pc-row pc-row--plain">
                  <div className="pc-row-text">
                    <p className="pc-row-title">{reveal.name ? `Your first reading, ${reveal.name.split(' ')[0]}` : 'Your first reading'}</p>
                    {reveal.line ? <p className="pc-row-line">{reveal.line}</p> : null}
                  </div>
                  <span />
                </li>
              </ul>
            ) : null}

            {/* Beta invite gate. When inviteValid is true but a top-level error is
                also showing (e.g. /auth?error=session_expired), the granted line is
                suppressed so the page does not read "granted" and "expired" at once;
                inviteValid stays true so the code is not asked for again. */}
            {inviteValid ? (
              error ? null : (
                <p className="pc-auth-note">
                  {inviteCode ? <>Invite code <strong>{inviteCode}</strong></> : 'Access granted'}
                </p>
              )
            ) : isReturning ? null : (
              <div className="pc-field pc-auth-block">
                <label className="pc-field-label" htmlFor="pc-auth-invite">Invite code</label>
                <div className="pc-auth-row">
                  <input
                    id="pc-auth-invite"
                    className="pc-input"
                    type="text"
                    value={inviteCode}
                    autoCapitalize="characters"
                    onChange={(e) => { setInviteCode(e.target.value); setError(''); setInviteValid(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') validateCode(inviteCode); }}
                  />
                  <button
                    type="button"
                    className="pc-btn pc-btn--secondary"
                    onClick={() => validateCode(inviteCode)}
                    disabled={validating || inviteCode.trim().length < 4}
                  >
                    {validating ? <Loader2 className="pc-spin" size={16} /> : 'Verify'}
                  </button>
                </div>
                <p className="pc-field-hint">Needed if you are new. No code? <Link to="/waitlist">Join the waitlist</Link></p>
              </div>
            )}

            {emailHint ? (
              <p className="pc-auth-note">
                Signing up as <strong>{emailHint}</strong>
              </p>
            ) : null}

            <div className="pc-auth-actions">
              <button className="pc-btn pc-btn--cta pc-auth-google" onClick={handleGoogleSignIn} disabled={loading}>
                {loading ? <Loader2 className="pc-spin" size={16} /> : <span className="pc-auth-g" aria-hidden="true" />}
                {loading ? 'Connecting' : 'Continue with Google'}
              </button>
            </div>

            {error ? <p className="pc-auth-error" role="alert">{error}</p> : null}

            <div className="pc-auth-or" aria-hidden="true"><span>or</span></div>

            {magicLinkSent ? (
              <ul className="pc-list" role="status">
                <li className="pc-row pc-row--plain">
                  <div className="pc-row-text">
                    <p className="pc-row-title">Check your email</p>
                    <p className="pc-row-line">The sign-in link works once, for 15 minutes.</p>
                  </div>
                  <span />
                </li>
              </ul>
            ) : (
              <form className="pc-auth-row" onSubmit={handleMagicLinkRequest}>
                <input
                  className="pc-input"
                  type="email"
                  autoComplete="email"
                  aria-label="Email address"
                  value={email}
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button type="submit" className="pc-btn pc-btn--secondary" disabled={magicLinkLoading || !email.trim()}>
                  {magicLinkLoading ? <Loader2 className="pc-spin" size={16} /> : 'Email me a link'}
                </button>
              </form>
            )}

            <p className="pc-auth-legal">
              By continuing you accept the{' '}
              <button type="button" onClick={() => setActiveModal('terms')}>Terms</button> and{' '}
              <button type="button" onClick={() => setActiveModal('privacy')}>Privacy Policy</button>.
            </p>
          </div>
        </section>

        <aside className="pc-auth-panel" aria-hidden="true">
          <p className="pc-auth-caption">
            <strong>Tuesday nights, the music turns ambient.</strong>
            From a calendar and Spotify.
          </p>
        </aside>
      </div>

      {activeModal ? (
        <div className="pc-modal" role="dialog" aria-modal="true" aria-labelledby="pc-modal-title" onClick={() => setActiveModal(null)}>
          <div className="pc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pc-modal-head">
              <h2 id="pc-modal-title">{LEGAL[activeModal].title}</h2>
              <button type="button" className="pc-iconbtn" onClick={() => setActiveModal(null)} aria-label="Close"><X /></button>
            </div>
            <pre className="pc-modal-body">{LEGAL[activeModal].content}</pre>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default CustomAuth;
