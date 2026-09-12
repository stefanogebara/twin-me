import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { API_URL } from '@/services/api/apiBase';
import '../styles/money-v2.css';
import '../styles/auth.css';

/**
 * /waitlist, in the sign-in frame of /auth (auth.css inside money-v2's .mv): a
 * narrow column on the page, the title and one grey line, the field, and Join
 * as the one 48/12 call to action. The request itself is unchanged.
 */
const WaitlistPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { trackFunnel } = useAnalytics();

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get('error') || '');

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
    <main className="mv au" id="main-content">
      <div className="au-col">
        {submitted ? (
          <section className="au-room" role="status">
            <h1 className="au-enter" style={{ '--i': 0 } as React.CSSProperties}>You're on the list.</h1>
            <p className="mv-sub au-enter" style={{ '--i': 1 } as React.CSSProperties}>
              We'll write when your spot opens.
            </p>
          </section>
        ) : (
          <>
            <section className="au-room">
              <h1 className="au-enter" style={{ '--i': 0 } as React.CSSProperties}>Join the waitlist.</h1>
              <p className="mv-sub au-enter" style={{ '--i': 1 } as React.CSSProperties}>
                TwinMe is in private beta. We'll write when your spot opens.
              </p>
            </section>

            <form className="au-controls au-enter" style={{ '--i': 2 } as React.CSSProperties} onSubmit={handleSubmit} aria-label="Join the waitlist">
              <input
                className="mv-field"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="Email address"
                aria-label="Email address"
                autoComplete="email"
                inputMode="email"
                disabled={loading}
              />
              <button type="submit" className="mv-pill mv-pill--lg" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                {loading ? 'Joining' : 'Join the waitlist'}
              </button>
              {error ? <p className="au-note au-note--error" role="alert">{error}</p> : null}
            </form>
          </>
        )}

        <div className="au-controls au-enter" style={{ '--i': 3 } as React.CSSProperties}>
          <button type="button" className="mv-pill mv-pill--ghost" onClick={() => navigate('/auth')}>
            Have an invite code? Sign in
          </button>
        </div>

        <footer className="au-foot au-enter" style={{ '--i': 4 } as React.CSSProperties}>
          &copy; 2026 TwinMe Inc.
        </footer>
      </div>
    </main>
  );
};

export default WaitlistPage;
