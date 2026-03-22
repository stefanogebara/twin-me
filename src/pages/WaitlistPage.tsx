import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAnalytics } from '../contexts/AnalyticsContext';

const API_URL = import.meta.env.VITE_API_URL || '';

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
        trackFunnel('beta_waitlist_joined', { email: email.trim() });
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: '#13121a' }}
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
              fontFamily: "'Instrument Serif', Georgia, serif",
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
            <h1
              className="mb-4"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '32px',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--foreground)',
              }}
            >
              You're on the list
            </h1>
            <p
              className="text-sm mb-8"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}
            >
              We'll reach out when your spot opens up. In the meantime, we're building something that truly gets you.
            </p>
          </>
        ) : (
          <>
            <h1
              className="mb-3"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '32px',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--foreground)',
              }}
            >
              We're crafting something special
            </h1>
            <p
              className="text-sm mb-10"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}
            >
              TwinMe is in private beta. Join the waitlist to be among the first to meet your digital twin.
            </p>

            {error && (
              <div
                className="text-sm mb-6 py-3 px-4 rounded-lg text-left"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  color: '#fca5a5',
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
                className="flex-1 h-11 px-4 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: 'rgba(218,217,215,0.08)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--foreground)',
                  fontFamily: "'Inter', sans-serif",
                }}
              />
              <button
                type="submit"
                disabled={loading}
                className="h-11 px-6 rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  color: '#fff',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
              </button>
            </form>
          </>
        )}

        {/* Back to sign in */}
        <button
          onClick={() => navigate('/auth')}
          className="mt-8 inline-flex items-center gap-1.5 text-[13px] transition-opacity hover:opacity-70"
          style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Have an invite code? Sign in
        </button>

        <div className="mt-16">
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
            &copy; 2026 TwinMe Inc.
          </span>
        </div>
      </div>
    </div>
  );
};

export default WaitlistPage;
