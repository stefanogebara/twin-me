import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { API_URL } from '@/services/api/apiBase';

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
    <div
      className="min-h-screen flex items-center justify-center px-6"
    >
      <div className="w-full max-w-[420px] text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
            <img
              src="/images/backgrounds/flower.png"
              alt="TwinMe"
              className="w-full h-full object-cover"
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: '22px',
              letterSpacing: '-0.5px',
              color: 'var(--foreground)',
            }}
          >
            TwinMe
          </span>
        </div>

        {submitted ? (
          <>
            <h1 className="n-heading mb-4" style={{ fontSize: '32px' }}>
              <em>You're</em> on the list
            </h1>
            <p
              className="text-sm mb-8"
              style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}
            >
              We'll reach out when your spot opens up. In the meantime, we're building something that truly gets you.
            </p>
          </>
        ) : (
          <>
            <h1 className="n-heading mb-3" style={{ fontSize: '32px' }}>
              We're <em>building</em> something worth the wait
            </h1>
            <p
              className="text-sm mb-10"
              style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}
            >
              TwinMe is in private beta. Join the waitlist to be among the first to meet your twin.
            </p>

            {error && (
              <div
                className="text-sm mb-6 py-3 px-4 rounded-[10px] text-left"
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.10)',
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  color: 'var(--claura-danger-ink)',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="your@email.com"
                aria-label="Email address"
                disabled={loading}
                className="flex-1 h-11 px-4 rounded-[12px] text-sm outline-none disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--input)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: "'Inter', sans-serif",
                }}
              />
              <button
                type="submit"
                disabled={loading}
                className="n-btn n-btn--primary h-11"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
              </button>
            </form>
          </>
        )}

        {/* Back to sign in */}
        <button
          onClick={() => navigate('/auth')}
          className="n-label mt-8 inline-flex items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--n-ash)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Have an invite code? Sign in
        </button>

        <div className="mt-16">
          <span className="n-micro" style={{ color: 'var(--n-fog)' }}>
            &copy; 2026 TwinMe Inc.
          </span>
        </div>
      </div>
    </div>
  );
};

export default WaitlistPage;
