import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Check, ClipboardCopy } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const API_URL = import.meta.env.VITE_API_URL || '';

const PLATFORMS = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'calendar', label: 'Google Calendar' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'whoop', label: 'Whoop' },
  { id: 'discord', label: 'Discord' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'github', label: 'GitHub' },
] as const;

interface SuccessState {
  inviteCode: string;
  alreadyApplied?: boolean;
}

function CopyableInviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-lg tracking-[2px] transition-colors hover:bg-white/10"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: 'var(--foreground)',
      }}
      title="Click to copy"
    >
      {code}
      {copied ? (
        <Check className="w-4 h-4 text-green-400" />
      ) : (
        <ClipboardCopy className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      )}
    </button>
  );
}

function BetaSignupPage() {
  useDocumentTitle('Join the Beta');
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
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
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [name, email, selectedPlatforms, reason]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="w-full max-w-[480px]">
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

        {success ? (
          /* ── Success State ── */
          <div className="text-center">
            <h1
              className="mb-3"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '36px',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--foreground)',
                lineHeight: 1.2,
              }}
            >
              {success.alreadyApplied ? 'Welcome back' : "You're in"}
            </h1>
            <p
              className="text-sm mb-8"
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Geist', 'Inter', sans-serif",
                lineHeight: 1.6,
              }}
            >
              {success.alreadyApplied
                ? 'You already have a beta invite. Use the code below to sign in.'
                : 'Your beta access is ready. Copy the invite code below and use it to sign in.'}
            </p>

            <div className="mb-6">
              <p
                className="text-[11px] uppercase tracking-[0.12em] mb-3"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                Your invite code
              </p>
              <CopyableInviteCode code={success.inviteCode} />
            </div>

            <button
              onClick={() => {
                sessionStorage.setItem('beta_invite_code', success.inviteCode);
                navigate('/auth');
              }}
              className="text-[14px] font-medium px-6 py-3 rounded-[100px] cursor-pointer transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97]"
              style={{
                background: '#F5F5F4',
                color: '#110f0f',
                border: 'none',
              }}
            >
              Sign in to get started
            </button>
          </div>
        ) : (
          /* ── Application Form ── */
          <>
            <div className="text-center mb-10">
              <h1
                className="mb-3"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '36px',
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--foreground)',
                  lineHeight: 1.2,
                }}
              >
                Join the TwinMe Beta
              </h1>
              <p
                className="text-sm"
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  lineHeight: 1.6,
                }}
              >
                Your AI twin that acts for you. 50 spots available.
              </p>
            </div>

            {error && (
              <div
                className="text-sm mb-6 py-3 px-4 rounded-lg"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  color: '#fca5a5',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label
                  className="block text-[12px] mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Your name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  placeholder="First Last"
                  className="w-full h-11 px-3 rounded-[6px] text-[14px] outline-none transition-all focus:ring-1"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--foreground)',
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    '--tw-ring-color': 'rgba(255,255,255,0.25)',
                  } as React.CSSProperties}
                />
              </div>

              {/* Email */}
              <div>
                <label
                  className="block text-[12px] mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  className="w-full h-11 px-3 rounded-[6px] text-[14px] outline-none transition-all focus:ring-1"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--foreground)',
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    '--tw-ring-color': 'rgba(255,255,255,0.25)',
                  } as React.CSSProperties}
                />
              </div>

              {/* Platforms */}
              <div>
                <label
                  className="block text-[12px] mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Which platforms do you use?
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(p => {
                    const isSelected = selectedPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        className="px-3 py-2 rounded-[46px] text-[13px] font-medium transition-all duration-150 ease-out cursor-pointer"
                        style={{
                          backgroundColor: isSelected
                            ? 'rgba(255,255,255,0.12)'
                            : 'rgba(255,255,255,0.04)',
                          border: isSelected
                            ? '1px solid rgba(255,255,255,0.20)'
                            : '1px solid rgba(255,255,255,0.08)',
                          color: isSelected
                            ? 'var(--foreground)'
                            : 'var(--text-secondary)',
                          fontFamily: "'Geist', 'Inter', sans-serif",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label
                  className="block text-[12px] mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Why do you want a personal AI?
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="I want to understand my patterns, automate decisions, get personalized insights..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-[6px] text-[14px] outline-none transition-all focus:ring-1 resize-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--foreground)',
                    fontFamily: "'Geist', 'Inter', sans-serif",
                    '--tw-ring-color': 'rgba(255,255,255,0.25)',
                  } as React.CSSProperties}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-[100px] text-[14px] font-medium transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                style={{
                  background: '#F5F5F4',
                  color: '#110f0f',
                  border: 'none',
                  fontFamily: "'Geist', 'Inter', sans-serif",
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : (
                  'Apply for Beta'
                )}
              </button>
            </form>
          </>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-center gap-4 mt-10">
          <button
            onClick={() => navigate('/auth')}
            className="inline-flex items-center gap-1.5 text-[13px] transition-opacity hover:opacity-70"
            style={{
              color: 'rgba(255,255,255,0.25)',
              fontFamily: "'Geist', 'Inter', sans-serif",
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Already have a code? Sign in
          </button>
        </div>

        <div className="mt-12 text-center">
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
            &copy; 2026 TwinMe Inc.
          </span>
        </div>
      </div>
    </div>
  );
}

export default BetaSignupPage;
