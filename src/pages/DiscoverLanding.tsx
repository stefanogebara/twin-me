import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Zap, Shield, Puzzle,
  Check, ChevronDown,
  Menu, X, ArrowRight, Loader2,
} from 'lucide-react';
import { discoveryScan, QuickEnrichmentData } from '../services/enrichmentService';
import { useDemo } from '../contexts/DemoContext';
import SoulOrb from './onboarding/components/SoulOrb';
import DataRevealItem from './onboarding/components/DataRevealItem';

// ── Design tokens (dark-only) ──────────────────────────────────────────
const T = {
  BG:       '#110f0f',
  FG:       '#fdfcfb',
  TEXT_SEC: '#a09898',
  TEXT_PH:  '#86807b',
  CARD_BG:  'rgba(255, 255, 255, 0.02)',
  CARD_BDR: 'rgba(255, 255, 255, 0.06)',
  BENTO_BG: 'rgba(255, 255, 255, 0.02)',
  CTA_BG:   '#fdfcfb',
  CTA_FG:   '#110f0f',
  SIGN_UP_BG: '#fdfcfb',
  SIGN_UP_FG: '#222528',
  GHOST_BG: 'rgba(255, 255, 255, 0.02)',
};

// ── Hero glow: RADIAL gradient (Figma exact — two stacked 455.74px ellipses) ──
// Ellipse 3: blur(42px) soft layer | Ellipse 1: sharp grain layer
const HERO_GLOW_GRADIENT = `radial-gradient(ellipse at 50% 50%,
  rgba(193,126,44,1)     0%,
  rgba(255,132,0,0.85)   12%,
  rgba(224,129,22,0.6)   28%,
  rgba(194,85,78,0.35)   50%,
  rgba(195,45,112,0.1)   72%,
  rgba(195,45,112,0)     100%
)`;

// ── Pricing / section accent: RADIAL amber gradient (Figma pricing SVG exact) ──
const AMBER_GLOW_CSS = `radial-gradient(ellipse at 51.1% 127.3%,
  rgba(195,45,112,0)     0%,  rgba(194,85,78,0.5)    9.375%,
  rgba(193,126,44,1)     18.75%, rgba(224,129,22,0.8) 32.452%,
  rgba(255,132,0,0.6)    46.154%, rgba(218,128,26,0.525) 53.245%,
  rgba(181,124,52,0.45)  60.337%, rgba(108,117,103,0.3) 74.519%,
  rgba(108,117,103,0)    96.635%
)`;

// Footer: 3 layered gradients (from Figma footer frame exact SVG transforms)
const FOOTER_GLOW_1 = `radial-gradient(ellipse at 51.1% 127.3%,
  rgba(195,45,112,0) 0%, rgba(194,85,78,0.5) 9.375%,
  rgba(193,126,44,1) 18.75%, rgba(224,129,22,0.8) 32.452%,
  rgba(255,132,0,0.6) 46.154%, rgba(218,128,26,0.525) 53.245%,
  rgba(181,124,52,0.45) 60.337%, rgba(108,117,103,0.3) 74.519%,
  rgba(108,117,103,0) 96.635%
)`;
const FOOTER_GLOW_2 = `radial-gradient(ellipse at 56.8% 130%,
  rgba(195,45,112,0) 0%, rgba(225,88,56,0.3) 10.577%,
  rgba(240,110,28,0.45) 15.865%, rgba(255,132,0,0.6) 21.154%,
  rgba(224,129,22,0.8) 29.087%, rgba(193,126,44,1) 37.019%,
  rgba(185,101,74,0.65) 55.769%, rgba(177,76,105,0.3) 74.519%,
  rgba(73,56,57,0) 96.635%
)`;
const FOOTER_GLOW_3 = `radial-gradient(ellipse at 45.3% 148%,
  rgba(195,45,112,0) 0%, rgba(146,34,67,0.3) 10.577%,
  rgba(97,22,22,0.6) 21.154%, rgba(157,49,11,0.55) 29.087%,
  rgba(217,76,0,0.5) 37.019%, rgba(202,78,22,0.475) 41.707%,
  rgba(186,80,44,0.45) 46.394%, rgba(155,84,87,0.4) 55.769%,
  rgba(93,92,174,0.3) 74.519%, rgba(73,56,57,0) 96.635%
)`;

// ── Types ─────────────────────────────────────────────────────────────
type DiscoverPhase = 'idle' | 'scanning' | 'revealed';

interface DataPoint {
  icon: string;
  label: string;
  value: string;
}

const PLATFORM_LOGOS = ['Spotify', 'YouTube', 'Discord', 'LinkedIn', 'Whoop'];

const FEATURES = [
  { icon: TrendingUp, title: 'Deep Memory',        body: 'Every interaction stored with cognitive-science retrieval weighting — recency, importance, and relevance.' },
  { icon: Zap,        title: 'Real-time Insights',  body: 'Your twin notices patterns you miss. Proactive insights surface before you ask.' },
  { icon: Shield,     title: 'Privacy First',        body: 'You control exactly what your twin knows. The privacy spectrum dashboard gives you granular control.' },
  { icon: Puzzle,     title: 'Cross-platform',       body: 'Spotify, YouTube, Discord, LinkedIn, Whoop — your digital footprints paint the real picture.' },
];

const FAQ_ITEMS = [
  { q: 'What is a soul signature?' },
  { q: 'How is my data used?' },
  { q: 'What platforms can I connect?' },
  { q: 'How accurate is the twin?' },
  { q: 'Can I delete my data?' },
  { q: 'Does TwinMe train AI on my data?' },
  { q: 'How long until my twin feels like me?' },
];

const FAQ_ANSWERS: Record<string, string> = {
  'What is a soul signature?':
    'Your soul signature is a living AI portrait of your authentic self — patterns, preferences, and personality traits derived from how you actually behave across platforms.',
  'How is my data used?':
    'Your data never leaves our secure infrastructure and is never used to train AI models. You own your soul signature completely.',
  'What platforms can I connect?':
    'Spotify, Google Calendar, YouTube, Discord, LinkedIn, and Whoop are currently supported. More coming soon.',
  'How accurate is the twin?':
    'Twin accuracy improves over time as memories accumulate. Most users notice meaningful personality alignment within a few days of connecting platforms.',
  'Can I delete my data?':
    'Yes. You can delete any memory, any platform connection, or your entire soul signature at any time from Settings.',
  'Does TwinMe train AI on my data?':
    'Never. Your memories are yours alone. They are used only to power your personal twin, nothing else.',
  'How long until my twin feels like me?':
    'Connect 2–3 platforms and chat for a day — most users feel the difference immediately. The twin deepens over weeks.',
};

// ── Main component ─────────────────────────────────────────────────────
export default function DiscoverLanding() {
  const navigate  = useNavigate();
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [openFaq, setOpenFaq]         = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { enterDemoMode } = useDemo();

  // Discovery scan state
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<DiscoverPhase>('idle');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [personaSummary, setPersonaSummary] = useState<string | null>(null);
  const [webSources, setWebSources] = useState<Array<{ title: string; url: string }>>([]);
  const [error, setError] = useState('');

  // Redirect if already signed in
  useEffect(() => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (token) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleDiscover = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setPhase('scanning');
    setDataPoints([]);
    setPersonaSummary(null);
    setWebSources([]);

    const result = await discoveryScan(trimmed);

    if (!result.success && result.error) {
      setError(result.error);
      setPhase('idle');
      return;
    }

    const d = result.discovered;
    if (d) {
      const points: DataPoint[] = [];
      if (d.discovered_name) points.push({ icon: 'name', label: 'Name', value: d.discovered_name });
      if (d.discovered_company) points.push({ icon: 'company', label: 'Company', value: d.discovered_company });
      if (d.discovered_location) points.push({ icon: 'location', label: 'Location', value: d.discovered_location });
      if (d.discovered_bio) points.push({ icon: 'bio', label: 'Bio', value: d.discovered_bio });
      if (d.discovered_github_url) points.push({ icon: 'github', label: 'GitHub', value: 'Profile found' });
      if (d.discovered_twitter_url) points.push({ icon: 'twitter', label: 'Twitter', value: 'Profile found' });
      if (d.social_links?.length) {
        for (const link of d.social_links) {
          if (!points.some(p => p.label === link.platform)) {
            points.push({ icon: 'social', label: link.platform, value: 'Profile found' });
          }
        }
      }
      setDataPoints(points);
      if (d.persona_summary) setPersonaSummary(d.persona_summary);
      if (d.web_sources?.length) setWebSources(d.web_sources);

      // Cache for post-auth pickup
      sessionStorage.setItem('twinme_discovery_data', JSON.stringify(d));
      sessionStorage.setItem('twinme_discovery_email', trimmed);
    }

    setPhase('revealed');
  };

  const glassStyle = {
    background: T.CARD_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };
  const chatboxStyle = {
    background: T.CARD_BG,
    border: `1px solid ${T.CARD_BDR}`,
    boxShadow: '0 4px 4px rgba(0,0,0,0.12)',
  };
  const bentoStyle = {
    background: T.BENTO_BG,
    border: `1px solid ${T.CARD_BDR}`,
  };

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: T.BG, color: T.FG, fontFamily: "'Inter', sans-serif" }}
    >

      {/* ══ NAV ══════════════════════════════════════════════════════════ */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-[878px] px-4">
        <nav
          className="flex items-center pl-5 pr-3 py-[10px] rounded-[32px] gap-9"
          style={glassStyle}
        >
          {/* Logo — flower circle overlaps wordmark by 21px (Figma exact) */}
          <div className="flex items-center shrink-0" style={{ width: '108px', paddingRight: '21px' }}>
            <div
              className="flex items-center justify-center shrink-0 rounded-full overflow-hidden"
              style={{
                width: '32px', height: '32px',
                marginRight: '-21px',
                zIndex: 1,
                flexShrink: 0,
              }}
            >
              <img
                src="/images/backgrounds/flower.png"
                alt="TwinMe"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
            <span style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '25.36px',
              letterSpacing: '-0.507px',
              color: T.FG,
              marginRight: '-21px',
              whiteSpace: 'nowrap',
              position: 'relative',
              zIndex: 2,
            }}>
              TwinMe
            </span>
          </div>

          {/* Nav links — hidden on mobile */}
          <div
            className="hidden md:flex items-center px-5 gap-14 flex-1"
            style={{ fontFamily: "'Poppins', sans-serif", fontSize: '14px', color: T.FG }}
          >
            <a href="#how-it-works" className="hover:opacity-60 transition-opacity whitespace-nowrap">How it works</a>
            <a href="#features"     className="hover:opacity-60 transition-opacity whitespace-nowrap">Features</a>
            <a href="#pricing"      className="hover:opacity-60 transition-opacity whitespace-nowrap">Pricing</a>
            <a href="#faq"          className="hover:opacity-60 transition-opacity whitespace-nowrap">FAQ</a>
          </div>

          {/* Divider — hidden on mobile */}
          <div className="hidden md:block w-px self-stretch" style={{ background: T.CARD_BDR }} />

          {/* Desktop actions — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {/* Sign in — Figma: ghost, 12px, min-w-[64px], px-2 py-0.5 */}
            <button
              onClick={() => navigate('/auth')}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: '24px',
                color: T.FG,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                minWidth: '64px',
                padding: '2px 8px',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Sign in
            </button>
            {/* Sign up — Figma: dark pill, 36px h, rounded-[100px], 14px */}
            <button
              onClick={() => navigate('/auth')}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                lineHeight: '24px',
                color: T.SIGN_UP_FG,
                background: T.SIGN_UP_BG,
                border: 'none',
                cursor: 'pointer',
                height: '36px',
                minWidth: '80px',
                padding: '6px 12px',
                borderRadius: '100px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Sign up
            </button>
          </div>

          {/* Mobile: hamburger — visible only on mobile */}
          <div className="flex md:hidden items-center gap-1 ml-auto shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-opacity hover:opacity-70"
              style={{ color: T.FG }}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </nav>
      </div>

      {/* ══ MOBILE MENU OVERLAY ════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Slide-down panel */}
          <div
            className="absolute top-0 left-0 right-0 rounded-b-[20px] px-6 pt-5 pb-8"
            style={{
              background: 'rgba(27, 24, 24, 0.95)',
              borderBottom: `1px solid ${T.CARD_BDR}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            }}
          >
            {/* Header row: logo + close */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center" style={{ width: '108px', paddingRight: '21px' }}>
                <div
                  className="flex items-center justify-center shrink-0 rounded-full overflow-hidden"
                  style={{ width: '32px', height: '32px', marginRight: '-21px', zIndex: 1, flexShrink: 0 }}
                >
                  <img
                    src="/images/backgrounds/flower.png"
                    alt="TwinMe"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                  />
                </div>
                <span style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '25.36px',
                  letterSpacing: '-0.507px',
                  color: T.FG,
                  marginRight: '-21px',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  zIndex: 2,
                }}>
                  TwinMe
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-opacity hover:opacity-70"
                style={{ color: T.FG }}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav links */}
            <div className="flex flex-col gap-1 mb-6">
              {[
                { label: 'How it works', href: '#how-it-works' },
                { label: 'Features',     href: '#features' },
                { label: 'Pricing',      href: '#pricing' },
                { label: 'FAQ',          href: '#faq' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-3 px-3 rounded-[12px] transition-colors duration-150 ease-out"
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '16px',
                    color: T.FG,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px mb-6" style={{ background: T.CARD_BDR }} />

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setMobileMenuOpen(false); navigate('/auth'); }}
                className="flex items-center justify-center h-11 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: T.SIGN_UP_BG,
                  color: T.SIGN_UP_FG,
                }}
              >
                Get Started
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); navigate('/auth'); }}
                className="flex items-center justify-center h-11 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  background: 'transparent',
                  color: T.FG,
                  border: `1px solid ${T.CARD_BDR}`,
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SVG grain filter (Sundust signature texture) */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <filter id="sundust-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend"/>
            <feComposite in="blend" in2="SourceGraphic" operator="in"/>
          </filter>
        </defs>
      </svg>

      {/* ══ HERO ═════════════════════════════════════════════════════════ */}
      <section className="relative flex flex-col items-center pt-48 pb-36 px-6" style={{ overflowX: 'clip' }}>

        {/* Hero glow removed — was overlapping SoulOrb */}

        {/* H1 */}
        <h1
          className="relative text-center mb-3 max-w-[608px] text-[32px] md:text-[48px]"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            lineHeight: 1,
            letterSpacing: '-0.96px',
            color: T.FG,
          }}
        >
          Discover who you really are
        </h1>

        {/* Subtitle */}
        <p
          className="relative text-center mb-14 max-w-[608px]"
          style={{ color: T.TEXT_SEC, fontSize: '16px', lineHeight: 1.25 }}
        >
          {phase === 'revealed' && dataPoints.length > 0
            ? 'Here\'s what your digital footprint reveals about you.'
            : 'TwinMe builds a living portrait of your authentic self from the platforms you actually use — not just what you say about yourself.'}
        </p>

        {/* ── PHASE: IDLE — Email input ── */}
        {phase === 'idle' && (
          <div className="relative w-full max-w-[608px]">
            <div
              className="rounded-[20px] px-5 py-4"
              style={chatboxStyle}
            >
              <form
                onSubmit={(e) => { e.preventDefault(); handleDiscover(); }}
                className="flex items-center gap-3"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="Enter your email to discover yourself"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{
                    color: T.FG,
                    fontFamily: "'Inter', sans-serif",
                    caretColor: T.FG,
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity"
                  style={{ background: T.CTA_BG, opacity: email.trim() ? 1 : 0.4 }}
                  aria-label="Discover"
                >
                  <ArrowRight className="w-4 h-4" style={{ color: T.CTA_FG }} />
                </button>
              </form>
            </div>
            {error && (
              <p className="text-xs mt-2 text-center" style={{ color: '#ef4444' }}>{error}</p>
            )}
            <button
              onClick={() => { enterDemoMode(); navigate('/dashboard'); }}
              className="mt-4 text-xs transition-opacity hover:opacity-70"
              style={{ color: T.TEXT_SEC, fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer' }}
            >
              or try the demo
            </button>
          </div>
        )}

        {/* ── PHASE: SCANNING — SoulOrb awakening ── */}
        {phase === 'scanning' && (
          <div className="relative flex flex-col items-center">
            <SoulOrb phase="awakening" dataPointCount={0} />
            <div className="flex items-center gap-2 mt-6">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: T.TEXT_SEC }} />
              <p className="text-sm" style={{ color: T.TEXT_SEC, fontFamily: "'Inter', sans-serif" }}>
                Discovering you...
              </p>
            </div>
          </div>
        )}

        {/* ── PHASE: REVEALED — SoulOrb alive + data points ── */}
        {phase === 'revealed' && (
          <div className="relative flex flex-col items-center w-full max-w-[480px]">
            <SoulOrb phase="alive" dataPointCount={dataPoints.length} />

            {personaSummary ? (
              <div className="w-full max-w-md mt-6">
                <div className="px-5 py-4 rounded-[20px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Inter', sans-serif" }}>
                    {personaSummary}
                  </p>
                </div>
                {webSources.length > 0 && (
                  <div className="mt-3 px-1">
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {webSources.map((src, i) => {
                        const domain = new URL(src.url).hostname.replace('www.', '');
                        return (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] hover:underline truncate max-w-[200px]"
                            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
                            title={src.title}
                          >
                            {domain}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : dataPoints.length > 0 ? (
              <div className="w-full max-w-sm mt-6">
                {dataPoints.map((dp) => (
                  <DataRevealItem key={dp.label} icon={dp.icon} label={dp.label} value={dp.value} />
                ))}
              </div>
            ) : (
              <p className="text-sm mt-6 text-center" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>
                We couldn't find public info for that email yet — but your twin is ready to learn from you directly.
              </p>
            )}

            {/* CTA: Create your twin */}
            <button
              onClick={() => navigate(`/auth?email=${encodeURIComponent(email.trim())}`)}
              className="mt-8 flex items-center gap-2 px-8 py-3 rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                background: T.CTA_BG,
                color: T.CTA_FG,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Create your twin
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Try different email */}
            <button
              onClick={() => { setPhase('idle'); setDataPoints([]); setPersonaSummary(null); setWebSources([]); setEmail(''); }}
              className="mt-3 text-sm transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Try a different email
            </button>
          </div>
        )}
      </section>

      {/* ══ TRUST LOGOS ══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Edge fades */}
        <div className="absolute left-0 top-0 bottom-0 w-32 pointer-events-none z-10"
          style={{ background: `linear-gradient(to right, ${T.BG}, transparent)` }} />
        <div className="absolute right-0 top-0 bottom-0 w-32 pointer-events-none z-10"
          style={{ background: `linear-gradient(to left, ${T.BG}, transparent)` }} />

        <div className="flex flex-col items-center gap-12 w-full px-6 md:px-[100px]">
          {/* Section label */}
          <div
            className="inline-flex items-center justify-center px-9 py-5 rounded-[32px] text-sm"
            style={{ ...glassStyle, color: T.FG, fontFamily: "'Inter', sans-serif" }}
          >
            Trusted by your favourite platforms
          </div>

          {/* Logo row */}
          <div className="flex items-center justify-center gap-16 flex-wrap pb-4">
            {PLATFORM_LOGOS.map(name => (
              <span
                key={name}
                className="text-sm font-semibold tracking-wide opacity-50"
                style={{ color: T.FG }}
              >
                {name}
              </span>
            ))}
          </div>

          <div className="w-full h-px" style={{ background: T.CARD_BDR }} />
        </div>
      </section>

      {/* ══ FEATURES ═════════════════════════════════════════════════════ */}
      <section id="features" className="px-6 md:px-[100px] mt-[80px]">
        <div className="max-w-[1312px] mx-auto flex flex-col items-center gap-[42px]">

          {/* Section label */}
          <div
            className="inline-flex items-center justify-center px-9 py-5 rounded-[32px] text-sm"
            style={{ ...glassStyle, color: T.FG, fontFamily: "'Inter', sans-serif" }}
          >
            Product overview
          </div>

          {/* Heading with amber glow behind */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute pointer-events-none"
              style={{
                width: '513px', height: '97px',
                top: '9px', left: '50%',
                transform: 'translateX(-50%)',
                background: 'radial-gradient(ellipse at 50% 50%, rgba(255,132,0,0.45) 0%, rgba(224,129,22,0.3) 40%, transparent 75%)',
                filter: 'blur(24px)',
                opacity: 1,
              }}
            />
            <h2
              className="relative text-center max-w-[641px]"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '48px', lineHeight: 1.1,
                letterSpacing: '-0.96px', color: T.FG,
              }}
            >
              Your soul, mapped from real data
            </h2>
          </div>

          {/* Bento grid — sharp edges, merged borders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full">
            {FEATURES.map(({ icon: Icon, title, body }, i) => (
              <div
                key={title}
                className="flex flex-col gap-6 p-6 md:p-10"
                style={{
                  ...bentoStyle,
                  borderRadius: 0,
                }}
              >
                <div
                  className="flex items-center justify-center p-2 rounded-full w-fit"
                  style={{ border: `1px solid ${T.CARD_BDR}` }}
                >
                  <Icon className="w-6 h-6" style={{ color: T.TEXT_SEC }} />
                </div>
                <div className="flex flex-col gap-2">
                  <p style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '24px', lineHeight: 1, color: T.FG,
                  }}>
                    {title}
                  </p>
                  <p style={{ color: T.TEXT_SEC, fontSize: '14px', lineHeight: 1.25 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ══════════════════════════════════════════════════════ */}
      <section id="pricing" className="relative px-6 md:px-[100px] py-[37px] mt-[120px] overflow-hidden">

        {/* Amber glow from Figma pricing SVG — rising from bottom center */}
        <div
          className="absolute pointer-events-none overflow-hidden"
          style={{ inset: 0 }}
        >
          <div style={{
            position: 'absolute',
            bottom: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: '1512px', height: '764px',
            opacity: 0.5,
            background: AMBER_GLOW_CSS,
          }} />
        </div>

        {/* Bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: T.CARD_BDR }} />

        <div className="max-w-[1312px] mx-auto flex flex-col items-center gap-7 relative">

          <h2
            className="text-center whitespace-nowrap"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '48px', lineHeight: 1.1,
              letterSpacing: '-0.96px', color: T.FG,
            }}
          >
            Get started today
          </h2>

          {/* Toggle */}
          <div
            className="flex items-center gap-3 h-12 px-[5px] py-1 rounded-[32px]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${T.CARD_BDR}`,
            }}
          >
            {['Monthly', 'Annually'].map(label => {
              const active = label === 'Monthly' ? !billingAnnual : billingAnnual;
              return (
                <button
                  key={label}
                  onClick={() => setBillingAnnual(label === 'Annually')}
                  className="flex items-center justify-center w-[120px] h-full rounded-[32px] text-sm transition-all duration-200 ease-out active:scale-[0.97]"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    background: active ? T.FG : 'transparent',
                    color:      active ? T.BG  : T.FG,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Cards */}
          <div className="flex flex-col md:flex-row w-full">

            {/* Free */}
            <div className="flex flex-col flex-1" style={{ marginRight: '-1px' }}>
              <div className="px-10 py-[23px]" style={{ ...bentoStyle, marginBottom: '-1px' }}>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: '20px', lineHeight: 1, color: T.FG }}>Free</p>
                <p className="mt-1 text-xs" style={{ color: T.TEXT_SEC }}>Get started discovering yourself</p>
              </div>
              <div className="flex flex-col gap-6 p-10 flex-1" style={bentoStyle}>
                <div className="flex flex-col gap-2 flex-1">
                  <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: '24px', lineHeight: 1, color: T.FG }}>$0</p>
                  <p className="text-xs" style={{ color: T.TEXT_SEC }}>Free forever, no credit card needed</p>
                  <div className="flex flex-col gap-px mt-5">
                    {['Up to 3 platform connections', '1,000 monthly memories', 'Basic twin chat'].map(f => (
                      <div key={f} className="flex items-center gap-2 h-6">
                        <Check className="w-6 h-6 shrink-0" style={{ color: T.TEXT_SEC }} />
                        <span className="text-xs" style={{ color: T.TEXT_SEC }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Ghost button */}
                <button
                  onClick={() => navigate('/auth')}
                  className="flex items-center justify-center h-10 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: T.GHOST_BG,
                    border: `1px solid ${T.CARD_BDR}`,
                    color: T.FG,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Get started
                </button>
              </div>
            </div>

            {/* Plus — elevated */}
            <div className="flex flex-col shrink-0 w-full md:w-[438px] md:-my-[26px]" style={{ marginRight: '-1px' }}>
              <div className="px-10 py-[23px]" style={{ ...bentoStyle, marginBottom: '-1px' }}>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: '20px', lineHeight: 1, color: T.FG }}>Plus</p>
                <p className="mt-1 text-xs" style={{ color: T.TEXT_SEC }}>For those who want depth</p>
              </div>
              <div className="flex flex-col gap-6 p-10 flex-1" style={bentoStyle}>
                <div className="flex flex-col gap-2 flex-1">
                  <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: '24px', lineHeight: 1, color: T.FG }}>
                    {billingAnnual ? '$15/mo' : '$20/mo'}
                  </p>
                  <p className="text-xs" style={{ color: T.TEXT_SEC }}>
                    {billingAnnual ? 'Billed annually ($180/yr)' : 'Billed monthly'}
                  </p>
                  <div className="flex flex-col gap-px mt-5">
                    {['All platforms connected', 'Unlimited memories', 'Expert reflection engine', 'Soul signature portrait', 'Goal tracking & nudges'].map(f => (
                      <div key={f} className="flex items-center gap-2 h-6">
                        <Check className="w-6 h-6 shrink-0" style={{ color: T.TEXT_SEC }} />
                        <span className="text-xs" style={{ color: T.TEXT_SEC }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Primary CTA */}
                <button
                  onClick={() => navigate('/auth')}
                  className="flex items-center justify-center h-10 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: T.CTA_BG, color: T.CTA_FG, fontFamily: "'Inter', sans-serif" }}
                >
                  Start with Plus
                </button>
              </div>
            </div>

            {/* Pro */}
            <div className="flex flex-col flex-1">
              <div className="px-10 py-[23px]" style={{ ...bentoStyle, marginBottom: '-1px' }}>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: '20px', lineHeight: 1, color: T.FG }}>Pro</p>
                <p className="mt-1 text-xs" style={{ color: T.TEXT_SEC }}>For power users who want it all</p>
              </div>
              <div className="flex flex-col gap-6 p-10 flex-1" style={bentoStyle}>
                <div className="flex flex-col gap-2 flex-1">
                  <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: '24px', lineHeight: 1, color: T.FG }}>
                    {billingAnnual ? '$75/mo' : '$100/mo'}
                  </p>
                  <p className="text-xs" style={{ color: T.TEXT_SEC }}>
                    {billingAnnual ? 'Billed annually ($900/yr)' : 'Billed monthly'}
                  </p>
                  <div className="flex flex-col gap-px mt-5">
                    {['Everything in Plus', 'Unlimited reflections & insights', 'Personality oracle fine-tuning', 'Priority support', 'Early access to new features'].map(f => (
                      <div key={f} className="flex items-center gap-2 h-6">
                        <Check className="w-6 h-6 shrink-0" style={{ color: T.TEXT_SEC }} />
                        <span className="text-xs" style={{ color: T.TEXT_SEC }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => navigate('/auth')}
                  className="flex items-center justify-center h-10 w-full rounded-[100px] text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: T.GHOST_BG,
                    border: `1px solid ${T.CARD_BDR}`,
                    color: T.FG,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Start with Pro
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══ FAQ ══════════════════════════════════════════════════════════ */}
      <section id="faq" className="px-6 md:px-[100px] mt-[120px] mb-[120px]">
        <div className="max-w-[1312px] mx-auto flex flex-col items-center gap-14">

          <div
            className="inline-flex items-center justify-center px-9 py-5 rounded-[32px] text-sm"
            style={{ ...glassStyle, color: T.FG, fontFamily: "'Inter', sans-serif" }}
          >
            FAQ
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start w-full">

            {/* Left — CTA */}
            <div className="flex-1 flex flex-col gap-4 px-4 md:px-[60px] py-[10px] relative">
              <div
                className="absolute pointer-events-none"
                style={{
                  width: '280px', height: '48px',
                  top: '16px', left: '60px',
                  background: 'radial-gradient(ellipse at 40% 50%, rgba(255,132,0,0.35) 0%, transparent 70%)',
                  filter: 'blur(20px)',
                  opacity: 1,
                }}
              />
              <h2
                className="relative"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '48px', lineHeight: 1.1,
                  letterSpacing: '-0.96px', color: T.FG,
                }}
              >
                Ready to get started?
              </h2>
              <p className="text-sm" style={{ color: T.TEXT_SEC, lineHeight: 1.25 }}>
                We'll be here once you're ready
              </p>
              <button
                onClick={() => navigate('/auth')}
                className="flex items-center justify-center h-10 px-4 rounded-[100px] text-sm font-medium w-fit transition-opacity hover:opacity-90"
                style={{ background: T.CTA_BG, color: T.CTA_FG, fontFamily: "'Inter', sans-serif" }}
              >
                Start creating
              </button>
            </div>

            {/* Right — FAQ accordion */}
            <div className="flex-1 flex flex-col" style={{ marginBottom: '-1px' }}>
              {FAQ_ITEMS.map(({ q }, i) => (
                <div
                  key={q}
                  className="cursor-pointer"
                  style={{ ...bentoStyle, marginBottom: '-1px', borderRadius: 0 }}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <div className="flex items-center justify-between p-6 gap-4">
                    <p style={{
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: '16px', lineHeight: 1, color: T.FG,
                    }}>
                      {q}
                    </p>
                    <ChevronDown
                      className="w-4 h-4 shrink-0 transition-transform"
                      style={{
                        color: T.TEXT_PH,
                        transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </div>
                  {openFaq === i && FAQ_ANSWERS[q] && (
                    <p className="px-6 pb-6 text-sm" style={{ color: T.TEXT_SEC, lineHeight: 1.5 }}>
                      {FAQ_ANSWERS[q]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
      <footer
        className="relative overflow-hidden"
        style={{ borderTop: `1px solid ${T.CARD_BDR}` }}
      >
        {/* Three layered sunset gradients (exact from Figma footer frame SVG) */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{ position: 'absolute', inset: 0, background: FOOTER_GLOW_1, opacity: 0.5 }} />
          <div style={{ position: 'absolute', inset: 0, background: FOOTER_GLOW_2, opacity: 0.5 }} />
          <div style={{ position: 'absolute', inset: 0, background: FOOTER_GLOW_3, opacity: 0.5 }} />
        </div>

        <div className="relative max-w-[1512px] mx-auto px-6 md:px-[100px] pt-12 pb-8">
          {/* Top — 2 column links */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-8 sm:gap-[200px] mb-16 md:mb-[200px]">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium" style={{ color: T.FG }}>Resources</p>
              {[
                { label: 'Documentation', href: '/docs' },
                { label: 'Blog', href: '/blog' },
                { label: 'Community', href: '/community' },
              ].map(l => (
                <span key={l.label} className="text-sm cursor-default" style={{ color: T.TEXT_SEC, opacity: 0.5 }}>{l.label}</span>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium" style={{ color: T.FG }}>Social</p>
              {[
                { label: 'X', href: 'https://x.com' },
                { label: 'Instagram', href: 'https://instagram.com' },
                { label: 'LinkedIn', href: 'https://linkedin.com' },
              ].map(l => (
                <span key={l.label} className="text-sm cursor-default" style={{ color: T.TEXT_SEC, opacity: 0.5 }}>{l.label}</span>
              ))}
            </div>
          </div>

          {/* Center — wordmark */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center gap-1">
              <div
                className="w-8 h-8 rounded-full opacity-80"
                style={{ background: 'radial-gradient(circle at 35% 35%, #f97316, #7c2d12)' }}
              />
              <span style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '36px',
                letterSpacing: '-0.7px',
                color: T.FG,
              }}>
                TwinMe
              </span>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4"
            style={{ borderTop: `1px solid ${T.CARD_BDR}` }}
          >
            <p className="text-sm" style={{ color: T.TEXT_SEC }}>©2026 TwinMe Inc.</p>
            <div className="flex items-center gap-8">
              <a href="/terms" className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.TEXT_SEC }}>Terms of service</a>
              <a href="/privacy-policy" className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.TEXT_SEC }}>Privacy notice</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
