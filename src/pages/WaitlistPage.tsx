import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { API_URL } from '@/services/api/apiBase';
import '@/styles/presence-cosmos.css';

/**
 * /waitlist — the same Cosmos auth frame as /auth (Auth section of presence-cosmos.css),
 * with one field and one action. The API call and the funnel event are unchanged.
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
    <main className="presence-cosmos" id="main-content">
      <div className="pc-auth">
        <section className="pc-auth-left">
          <Link className="pc-auth-back" to="/"><ArrowLeft size={15} /> TwinMe</Link>
          <Mark />

          <div className="pc-auth-card">
            {submitted ? (
              <>
                <h1>You’re on the list.</h1>
                <p className="pc-auth-sub">We’ll write when your place opens. Nothing else lands in your inbox until then.</p>
              </>
            ) : (
              <>
                <h1>Worth the wait.</h1>
                <p className="pc-auth-sub">TwinMe is in private beta. Leave your email and you’ll be among the first to meet your twin.</p>

                <form className="pc-auth-magic" onSubmit={handleSubmit}>
                  <label className="pc-ob-field">
                    <input
                      type="email"
                      autoComplete="email"
                      aria-label="Email address"
                      value={email}
                      placeholder="you@example.com"
                      disabled={loading}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    />
                  </label>
                  <button type="submit" className="pc-auth-google" disabled={loading}>
                    {loading ? <Loader2 className="pc-spin" size={18} /> : null}
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

          <div className="pc-auth-wordmark" aria-hidden="true">TWINME</div>
        </section>

        <aside className="pc-auth-panel" aria-hidden="true">
          <img src="/images/twinme/cosmos-05-meadow.jpg" alt="" style={{ top: '-4%', width: 220, height: 290, transform: 'translateX(-50%) rotate(-2deg)' }} />
          <img src="/images/twinme/cosmos-03-orbit.jpg" alt="" style={{ top: '30%', width: 360, height: 240, transform: 'translateX(-50%) rotate(1.5deg)' }} />
          <img src="/images/twinme/cosmos-01-crt.jpg" alt="" style={{ top: '64%', width: 200, height: 270, transform: 'translateX(-50%) rotate(-3deg)' }} />
          <p className="pc-auth-caption">
            <strong>Your best work happens after 22:00, and your calendar says nothing about it.</strong>
            Read from commits and a calendar. Timestamped, sourced, yours.
          </p>
        </aside>
      </div>
    </main>
  );
};

export default WaitlistPage;
