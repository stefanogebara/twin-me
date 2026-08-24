import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Sparkles, Check, X } from 'lucide-react';
import { discoveryScan, type QuickEnrichmentData } from '../../services/enrichmentService';

/**
 * ClauraHero — reveal-first landing hero (2026-08 hero inversion).
 *
 * The email-enrichment reveal that used to live on /discover IS the hero:
 * one input, instant wow, no cosmic film. Sits directly on the global
 * AppBackground ambient canvas — paints no background of its own.
 */

type ScanPhase = 'idle' | 'scanning' | 'revealed' | 'confirmed';

const SCAN_STATUS_LINES = [
  'Scanning your public footprint...',
  'Reading what you build and publish...',
  'Piecing together your story...',
  'Writing your first portrait...',
];

/* Dev-only sample so the hero is designable without the API running.
 * Never shown in production builds. */
const DEV_SAMPLE: QuickEnrichmentData = {
  discovered_name: 'Stefano Gebara',
  discovered_photo: null,
  discovered_company: null,
  discovered_location: null,
  discovered_bio: null,
  discovered_github_url: 'https://github.com/stefanogebara',
  discovered_twitter_url: null,
  github_repos: null,
  github_followers: null,
  source: 'dev-sample',
  social_links: [],
  persona_summary:
    'You move through worlds with a fluid, almost chameleonic energy, your digital presence hinting at a mind that refuses to be pinned to a single domain. There is a tension here between the meticulous, logical architecture of code and systems you engage with and a deep-seated attraction to the expressive, aesthetic realms of fashion and human performance. You seem driven by a curiosity that is both technical and deeply human, navigating between building for function and capturing for form.',
  web_sources: [
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'YouTube', url: 'https://youtube.com' },
    { title: 'X', url: 'https://x.com' },
  ],
};

/** Split a narrative into at most two paragraphs at a sentence boundary. */
function splitNarrative(text: string): string[] {
  const clean = text.trim();
  if (clean.length < 260) return [clean];
  const mid = Math.floor(clean.length / 2);
  const cut = clean.indexOf('. ', mid);
  if (cut === -1 || cut > clean.length - 80) return [clean];
  return [clean.slice(0, cut + 1), clean.slice(cut + 2)];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface ClauraHeroProps {
  onCreateTwin: () => void;
  trackFunnel?: (event: string, props?: Record<string, unknown>) => void;
}

const ClauraHero = ({ onCreateTwin, trackFunnel }: ClauraHeroProps) => {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [statusIdx, setStatusIdx] = useState(0);
  const [data, setData] = useState<QuickEnrichmentData | null>(null);
  const [error, setError] = useState('');
  const revealRef = useRef<HTMLDivElement | null>(null);

  /* Rotate status lines while scanning */
  useEffect(() => {
    if (phase !== 'scanning') return;
    setStatusIdx(0);
    const t = setInterval(() => {
      setStatusIdx((i) => Math.min(i + 1, SCAN_STATUS_LINES.length - 1));
    }, 2600);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'revealed') {
      revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [phase]);

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setPhase('scanning');
    trackFunnel?.('landing_scan_started');

    const result = await discoveryScan(trimmed);

    if (result.success && result.discovered?.persona_summary) {
      setData(result.discovered);
      sessionStorage.setItem('twinme_discovery_data', JSON.stringify(result.discovered));
      sessionStorage.setItem('twinme_discovery_email', trimmed);
      setPhase('revealed');
      trackFunnel?.('landing_scan_revealed');
      return;
    }

    if (import.meta.env.DEV) {
      // Local design fallback — API not running. Clearly dev-only.
      setData(DEV_SAMPLE);
      setPhase('revealed');
      return;
    }

    setError(
      result.error ||
        "We couldn't read enough from that email. Try another, or create your twin directly.",
    );
    setPhase('idle');
    trackFunnel?.('landing_scan_empty');
  };

  const handleConfirm = (isMe: boolean) => {
    trackFunnel?.(isMe ? 'landing_identity_confirmed' : 'landing_identity_rejected');
    if (isMe) {
      setPhase('confirmed');
    } else {
      sessionStorage.removeItem('twinme_discovery_data');
      setData(null);
      setPhase('idle');
      setError('');
    }
  };

  const paragraphs = data?.persona_summary ? splitNarrative(data.persona_summary) : [];
  const sources = (data?.web_sources ?? []).slice(0, 6);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-28 pb-16">
      <div className="w-full max-w-[680px] flex flex-col items-center text-center">
        {/* Kicker */}
        <p className="font-sans text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--text-muted)] mb-5">
          Your Soul Signature
        </p>

        {/* Headline */}
        <h1 className="font-heading font-normal text-[44px] md:text-[60px] leading-[1.06] tracking-[-0.03em] text-[var(--text-primary)] mb-5">
          Discover who you
          <br />
          <em className="italic">really</em> are.
        </h1>

        <p className="font-sans text-[15px] font-medium text-[var(--text-secondary)] leading-[1.65] max-w-[520px] mb-9">
          Enter your email and watch. TwinMe reads your public footprint in seconds — then goes
          deeper with your Spotify, YouTube, Calendar, and GitHub to build a personality portrait
          from what you actually do, not what you say about yourself.
        </p>

        {/* ── Scan card ── */}
        {(phase === 'idle' || phase === 'scanning') && (
          <div className="w-full max-w-[520px]">
            <form
              onSubmit={handleScan}
              className="claura-glass flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:pl-4"
              style={{ borderRadius: 16 }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={phase === 'scanning'}
                aria-label="Email address"
                className="flex-1 bg-transparent font-sans text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none min-w-0 px-2 py-2 sm:p-0"
              />
              <button
                type="submit"
                disabled={phase === 'scanning'}
                className="claura-btn-primary shrink-0 disabled:opacity-60 justify-center"
                style={{ padding: '11px 18px' }}
              >
                {phase === 'scanning' ? 'Reading...' : 'Read my footprint'}
                {phase !== 'scanning' && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            {/* Scanning status */}
            {phase === 'scanning' && (
              <p
                aria-live="polite"
                className="font-sans text-[13px] font-medium text-[var(--text-muted)] mt-4 animate-pulse"
              >
                {SCAN_STATUS_LINES[statusIdx]}
              </p>
            )}

            {error && (
              <p className="font-sans text-[13px] font-medium text-[#e0836c] mt-4">{error}</p>
            )}

            {/* Precision + trust lines */}
            {phase === 'idle' && (
              <div className="mt-7 space-y-2">
                <p className="font-sans text-[13px] font-medium text-[var(--text-secondary)]">
                  Personality tests ask 60 questions. TwinMe reads your last 60,000 data points.
                </p>
                <p className="font-sans text-[12px] font-normal text-[var(--text-muted)]">
                  Read-only access. No passwords stored. Delete everything anytime.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Reveal ── */}
        {(phase === 'revealed' || phase === 'confirmed') && data && (
          <div ref={revealRef} className="w-full max-w-[600px] text-left">
            <div className="claura-glass claura-glass--refract px-7 py-7 md:px-9 md:py-8">
              <p className="font-sans text-[11px] font-medium tracking-[0.15em] uppercase text-[var(--text-muted)] mb-4 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                {data.discovered_name
                  ? `What the internet says about ${data.discovered_name.split(' ')[0]}`
                  : 'What your footprint reveals'}
              </p>

              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="font-heading text-[19px] md:text-[21px] leading-[1.5] tracking-[-0.01em] mb-4 last:mb-0"
                  style={{ color: 'var(--text-narrative)' }}
                >
                  {p}
                </p>
              ))}

              {sources.length > 0 && (
                <div className="mt-6 pt-5 border-t border-[var(--border-glass)]">
                  <p className="font-sans text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--text-muted)] mb-3">
                    Read from
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((s, i) => (
                      <span
                        key={i}
                        className="font-sans text-[12px] font-medium text-[var(--text-secondary)] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.10)] rounded-[46px] px-3 py-1.5"
                      >
                        {hostnameOf(s.url)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Identity gate → CTA */}
            {phase === 'revealed' ? (
              <div className="flex items-center justify-center gap-3 mt-6">
                <p className="font-sans text-sm font-medium text-[var(--text-secondary)] mr-1">
                  Is this you?
                </p>
                <button onClick={() => handleConfirm(true)} className="claura-btn-primary" style={{ padding: '10px 18px' }}>
                  <Check className="w-4 h-4" /> Yes, that's me
                </button>
                <button onClick={() => handleConfirm(false)} className="claura-btn-glass" style={{ padding: '10px 18px' }}>
                  <X className="w-4 h-4" /> Not me
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center mt-7 gap-3">
                <p className="font-sans text-sm font-medium text-[var(--text-secondary)] max-w-[420px] text-center">
                  This is only your public surface. Connect what you actually use — Spotify,
                  YouTube, Calendar — and meet the twin that knows the rest.
                </p>
                <button onClick={onCreateTwin} className="claura-btn-primary" style={{ padding: '13px 24px' }}>
                  Create your twin <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default ClauraHero;
