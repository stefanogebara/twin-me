import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { API_URL } from '@/services/api/apiBase';
import '@/styles/presence-cosmos.css';

/**
 * /waitlist — the same sign-in frame as /auth (Auth section of presence-cosmos.css):
 * a flat page, one field in the warm box and one 48/12 call to action, the
 * photograph as the right half on wide screens. The API call and the funnel event
 * are unchanged.
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

const WaitlistPage = () => {
  const [searchParams] = useSearchParams();
  const { trackFunnel } = useAnalytics();

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get('error') || '');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Waitlist · TwinMe';
    return () => { document.title = previousTitle; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/beta/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        // audit-2026-06-10: do not send raw email as a PostHog event property
        // on a pre-signup public funnel. has_email keeps the conversion signal
        // without leaking PII.
        trackFunnel('beta_waitlist_joined', { has_email: true });
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      // Keep the raw error in the console for debugging (audit-2026-07-03)
      console.error('Waitlist submit failed:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="presence-cosmos pc-app" id="main-content">
      <div className="pc-auth" style={{ ["--auth-still" as string]: "url('/images/twinme/cosmos-08-window.jpg')" } as React.CSSProperties}>
        <section className="pc-auth-left">
          <Link className="pc-auth-back" to="/"><ArrowLeft size={14} /> TwinMe</Link>

          <div className="pc-auth-card">
            <Mark />
            {submitted ? (
              <>
                <h1 className="pc-apphead-title">You’re on the list.</h1>
                <p className="pc-apphead-line">We’ll write when your place opens.</p>
              </>
            ) : (
              <>
                <h1 className="pc-apphead-title">Worth the wait.</h1>
                <p className="pc-apphead-line">TwinMe is in private beta. Leave your email.</p>

                <form className="pc-auth-magic" onSubmit={handleSubmit}>
                  <input
                    className="pc-input"
                    type="email"
                    autoComplete="email"
                    aria-label="Email address"
                    value={email}
                    placeholder="you@example.com"
                    disabled={loading}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  />
                  <button type="submit" className="pc-btn pc-btn--cta pc-auth-google" disabled={loading}>
                    {loading ? <Loader2 className="pc-spin" size={16} /> : null}
                    {loading ? 'Joining' : 'Join the waitlist'}
                  </button>
                </form>

                {error ? <p className="pc-auth-error" role="alert">{error}</p> : null}
              </>
            )}

            <p className="pc-auth-legal">
              Have an invite code? <Link to="/auth">Sign in</Link>
            </p>
          </div>
        </section>

        <aside className="pc-auth-panel" aria-hidden="true">
          <p className="pc-auth-caption">
            <strong>Your best work happens late, and your calendar never shows it.</strong>
            From GitHub and a calendar.
          </p>
        </aside>
      </div>
    </main>
  );
};

export default WaitlistPage;
