import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, ClipboardCopy } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { API_URL } from '@/services/api/apiBase';
import '../styles/money-v2.css';
import '../styles/auth.css';

/**
 * /beta, in the sign-in frame of /auth (auth.css inside money-v2's .mv): the
 * title and one grey line, a label over each field, the sources as 32/4
 * choices (white with a hairline; pressed is the field with an ink line), and
 * Apply as the one 48/12 call to action.
 *
 * Until 2026-09-25 it asked which OAuth platforms a person used -- Spotify,
 * Google Calendar, YouTube, Whoop, Discord, Gmail, GitHub -- under a line
 * promising an AI twin that acts for you. All seven have answered 410 since the
 * twin was parked and were deleted with it, so the first thing a person invited
 * to the money pilot met was a form collecting interest in things nobody could
 * connect. It asks what the ledger can actually read, and which phone, because
 * that decides how a payment reaches it at all.
 */

const SOURCES = [
  { id: 'bank', label: 'Your bank' },
  { id: 'phone_alerts', label: 'Payment alerts on your phone' },
  { id: 'receipts', label: 'Receipts by email' },
  { id: 'statements', label: 'Bank statements' },
  { id: 'calendar', label: 'Your class calendar' },
  { id: 'whatsapp', label: 'WhatsApp' },
] as const;

const PHONES = [
  { id: 'ios', label: 'iPhone' },
  { id: 'android', label: 'Android' },
] as const;

interface SuccessState {
  // Absent on the pending-review path (application accepted, no code minted yet).
  inviteCode?: string;
  alreadyApplied?: boolean;
  pendingReview?: boolean;
  message?: string;
}

function CopyableInviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable (non-secure context): fall back to a manual prompt
      // so the user can still grab the code instead of a silent no-op.
      window.prompt('Copy your invite code', code);
    }
  }, [code]);

  return (
    <button type="button" onClick={handleCopy} className="mv-pill mv-pill--ghost au-code" title="Click to copy">
      {code}
      {copied ? <Check className="w-4 h-4" aria-label="Copied" /> : <ClipboardCopy className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
}

function BetaSignupPage() {
  useDocumentTitle('Join the Beta');
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [phone, setPhone] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const togglePlatform = useCallback((id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required'); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/beta/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          platforms: selectedPlatforms,
          phone: phone || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong');
        return;
      }
      setSuccess({
        inviteCode: data.inviteCode,
        alreadyApplied: data.alreadyApplied,
        // No code minted means the application is queued for review, not approved.
        pendingReview: !data.inviteCode,
        message: data.message,
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [name, email, selectedPlatforms, phone, reason]);

  return (
    <main className="mv au" id="main-content">
      <div className="au-col">
        {success ? (
          /* ── Success State ── */
          <>
            <section className="au-room" role="status">
              <h1>
                {success.pendingReview ? 'Application received.' : success.alreadyApplied ? 'Welcome back.' : "You're in."}
              </h1>
              <p className="mv-sub">
                {success.pendingReview
                  ? (success.message || "Your application is being reviewed. We'll be in touch soon.")
                  : success.alreadyApplied
                    ? 'You already have a beta invite. Use the code below to sign in.'
                    : 'Your beta access is ready. Copy the invite code below and use it to sign in.'}
              </p>
            </section>

            {!success.pendingReview && success.inviteCode && (
              <section className="au-controls" aria-label="Your invite code">
                <p className="mv-label">Your invite code</p>
                <CopyableInviteCode code={success.inviteCode} />
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('beta_invite_code', success.inviteCode!);
                    navigate('/auth');
                  }}
                  className="mv-pill mv-pill--lg"
                >
                  Sign in to get started
                </button>
              </section>
            )}
          </>
        ) : (
          /* ── Application Form ── */
          <>
            <section className="au-room">
              <h1 className="au-enter" style={{ '--i': 0 } as React.CSSProperties}>Join the beta.</h1>
              <p className="mv-sub au-enter" style={{ '--i': 1 } as React.CSSProperties}>Your money, read to you. For students in Spain.</p>
            </section>

            <form onSubmit={handleSubmit} className="au-form au-form--long au-enter" style={{ '--i': 2 } as React.CSSProperties}>
              <label className="au-field">
                <span className="mv-label">Your name</span>
                <input
                  className="mv-field"
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  placeholder="First Last"
                  autoComplete="name"
                />
              </label>

              <label className="au-field">
                <span className="mv-label">Email</span>
                <input
                  className="mv-field"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </label>

              <fieldset className="au-field">
                <legend className="mv-label">What could you connect?</legend>
                <div className="au-choices">
                  {SOURCES.map(p => {
                    const isSelected = selectedPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        aria-pressed={isSelected}
                        className="mv-pill mv-pill--ghost"
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="au-field">
                <legend className="mv-label">Which phone?</legend>
                <div className="au-choices">
                  {PHONES.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhone(phone === p.id ? '' : p.id)}
                      aria-pressed={phone === p.id}
                      className="mv-pill mv-pill--ghost"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="au-field">
                <span className="mv-label">Anything else?</span>
                <textarea
                  className="mv-field mv-field--area"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Which bank, what you are studying, anything that helps."
                  rows={3}
                />
              </label>

              {error ? <p className="au-note au-note--error" role="alert">{error}</p> : null}

              <button type="submit" disabled={loading} className="mv-pill mv-pill--lg">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                {loading ? 'Sending your application' : 'Apply for the beta'}
              </button>
            </form>
          </>
        )}

        <div className="au-controls">
          <button type="button" onClick={() => navigate('/auth')} className="mv-pill mv-pill--ghost">
            Already have a code? Sign in
          </button>
        </div>

        <footer className="au-foot">&copy; 2026 TwinMe Inc.</footer>
      </div>
    </main>
  );
}

export default BetaSignupPage;
