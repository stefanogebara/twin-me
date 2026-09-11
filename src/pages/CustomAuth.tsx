/**
 * The front door, on the web.
 * ===========================
 * One headline, one sentence about what the product does, Google as the black pill, an email
 * field for a sign-in link, and a footer line. Nothing else on the page.
 *
 * What survives from before is the mechanics, all of it: already-signed-in people are sent on
 * (honouring a same-origin ?redirect=), a session that expired is cleared before the next
 * attempt, an invite code arriving in the URL is validated and carried through to both sign-in
 * paths, and the magic link request handles the rate limit and non-JSON errors the edge can
 * return. The private-beta gate is enforced by the server; this page never hides the door, it
 * repeats what the server says in one sentence.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { API_URL } from '@/services/api/apiBase';
import '../styles/money-v2.css';
import '../styles/auth.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only same-origin relative paths may be redirected to, so ?redirect= cannot leave the site. */
function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/today';
}

const CustomAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithOAuth, isSignedIn, isLoaded } = useAuth();
  const { trackFunnel } = useAnalytics();

  const [busy, setBusy] = useState<'google' | 'link' | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  /* Signed in already: on you go. ?view=public keeps the page visible for anyone checking it. */
  useEffect(() => {
    if (searchParams.get('view') === 'public') return;
    if (isLoaded && isSignedIn) navigate(safeRedirect(searchParams.get('redirect')), { replace: true });
  }, [isLoaded, isSignedIn, navigate, searchParams]);

  const validateInvite = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    try {
      const res = await fetch(`${API_URL}/beta/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean; error?: unknown };
      if (data.valid === true) {
        sessionStorage.setItem('beta_invite_code', trimmed);
        trackFunnel('beta_invite_validated', { code: trimmed });
      } else {
        sessionStorage.removeItem('beta_invite_code');
        if (typeof data.error === 'string') setError(data.error);
      }
    } catch {
      /* The server decides at sign-in anyway. */
    }
  }, [trackFunnel]);

  /* On arrival: the reason for coming back, if any, and an invite code from the link. */
  useEffect(() => {
    trackFunnel('auth_page_viewed', {});

    const urlError = searchParams.get('error');
    if (urlError === 'session_expired') {
      setError('Your session ended. Sign in again.');
      /* A half-set session can keep the next attempt failing: clear everything auth-adjacent,
         keeping only the two keys that are not part of the session itself. */
      ['auth_user', 'auth_provider', 'twinme_account_created', 'demo_mode',
        'twin_chat_history', 'soul-signature-onboarding', 'twinme_interview_progress',
      ].forEach((k) => localStorage.removeItem(k));
      const keep = {
        beta_invite_code: sessionStorage.getItem('beta_invite_code'),
        twinme_discovery_confirmed: sessionStorage.getItem('twinme_discovery_confirmed'),
      };
      sessionStorage.clear();
      Object.entries(keep).forEach(([k, v]) => { if (v) sessionStorage.setItem(k, v); });
    } else if (urlError === 'invalid_state') {
      setError('That sign-in did not complete. Try again.');
    }

    const urlCode = searchParams.get('invite');
    const code = urlCode || sessionStorage.getItem('beta_invite_code') || '';
    if (code) {
      setInviteCode(code);
      if (urlCode) sessionStorage.setItem('beta_invite_code', code);
      void validateInvite(code);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const google = async () => {
    if (busy) return;
    setBusy('google');
    setError('');
    trackFunnel('auth_initiated', { provider: 'google', has_invite: Boolean(inviteCode) });
    try {
      await signInWithOAuth('google', searchParams.get('redirect') || undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in did not start. Try again.');
      setBusy(null);
    }
  };

  const requestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!EMAIL.test(trimmed)) { setError('That does not look like an email address.'); return; }
    setBusy('link');
    setError('');
    trackFunnel('auth_initiated', { provider: 'magic_link', has_invite: Boolean(inviteCode) });
    try {
      const res = await fetch(`${API_URL}/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          inviteCode: inviteCode || undefined,
          redirect: searchParams.get('redirect') || undefined,
        }),
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After'));
        setError(Number.isFinite(wait) && wait > 0
          ? `Too many tries. Wait ${wait} seconds and ask again.`
          : 'Too many tries. Wait a moment and ask again.');
        return;
      }
      let data: { success?: boolean; error?: unknown } | null = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.ok && data?.success) {
        setSentTo(trimmed);
      } else {
        setError(typeof data?.error === 'string' ? data.error : 'The link could not be sent. Try again in a moment.');
      }
    } catch {
      setError('The link could not be sent. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mv au">
      <div className="au-col">
      <section className="au-room">
        <h1 className="au-enter" style={{ '--i': 0 } as React.CSSProperties}>
          Your money,<br />read to you.
        </h1>
        <p className="mv-sub au-enter" style={{ '--i': 1 } as React.CSSProperties}>
          For students in Spain. It reads your bank and says what the month is doing. It can
          never move money.
        </p>
      </section>

      <section className="au-controls" aria-label="Sign in">
        <button
          type="button"
          className="mv-pill mv-pill--lg au-enter"
          style={{ '--i': 2 } as React.CSSProperties}
          onClick={() => void google()}
          disabled={busy !== null}
        >
          {busy === 'google' ? 'Opening Google' : 'Continue with Google'}
        </button>

        {sentTo ? (
          <p className="au-note au-enter" role="status" style={{ '--i': 3 } as React.CSSProperties}>
            A sign-in link is on its way to {sentTo}. Open it on this device.
          </p>
        ) : (
          <form className="au-form au-enter" style={{ '--i': 3 } as React.CSSProperties} onSubmit={(e) => void requestLink(e)}>
            <input
              className="mv-field"
              type="email"
              name="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
              placeholder="Email address"
              aria-label="Email address"
              autoComplete="email"
              inputMode="email"
              disabled={busy !== null}
            />
            <button type="submit" className="mv-pill mv-pill--ghost" disabled={busy !== null}>
              {busy === 'link' ? 'Sending the link' : 'Email me a link'}
            </button>
          </form>
        )}

        {error ? <p className="au-note au-note--error" role="alert">{error}</p> : null}
      </section>

      <footer className="au-foot au-enter" style={{ '--i': 4 } as React.CSSProperties}>
        Private beta. No card details are ever stored.
      </footer>
      </div>
    </main>
  );
};

export default CustomAuth;
