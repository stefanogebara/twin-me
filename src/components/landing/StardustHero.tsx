import { useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SignInButton } from '../../contexts/AuthContext';

/**
 * StardustHero — faithful translation of the Figma "v1" landing hero
 * (file OAxqcmeKa91mDQvRq6SXru, node 3094:2).
 *
 * Two stacked pieces, matching the design:
 *  1. A full-bleed cosmic photo card with a floating glass nav, the serif
 *     "Let your soul breath" headline, and an email-capture pill.
 *  2. Below it on the dark canvas: the glowing "Twin.me" wordmark, the
 *     "we are made of stardust" serif line, and the Start / Sign-in CTAs.
 *
 * Marketing hero over dark imagery: text stays light in both appearances
 * (the sanctioned over-media exception), so this deliberately does not
 * theme-flip. Uses Claura foundations (Instrument Serif, warm glass).
 */

const NAV_LINKS = [
  { label: 'Services', id: 'services' },
  { label: 'Features', id: 'features' },
  { label: 'How it works', id: 'how-it-works' },
];

export default function StardustHero() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Carry the typed email into the sign-up flow.
    const q = email.trim() ? `?email=${encodeURIComponent(email.trim())}` : '';
    navigate(`/auth${q}`);
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section className="relative w-full px-3 sm:px-5 pt-4 pb-16 sm:pb-24">
      {/* ── Photo hero card ── */}
      <div className="relative w-full max-w-[1720px] mx-auto overflow-hidden rounded-[24px] sm:rounded-[32px]">
        {/* Cosmic photo */}
        <img
          src="/images/cosmic-v2/stage3-arrival.webp"
          srcSet="/images/cosmic-v2/stage3-arrival.webp 1x, /images/cosmic-v2/stage3-arrival@2x.webp 2x"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 45%' }}
        />
        {/* Legibility veil — darker toward the center where the copy sits */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 90% at 45% 55%, rgba(12,11,16,0.55) 0%, rgba(12,11,16,0.28) 40%, rgba(12,11,16,0.12) 70%),' +
              'linear-gradient(180deg, rgba(12,11,16,0.35) 0%, transparent 22%, transparent 70%, rgba(12,11,16,0.45) 100%)',
          }}
        />

        {/* Floating glass nav */}
        <nav className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-24px)] max-w-[930px]">
          <div
            className="flex items-center justify-between gap-2 pl-2 pr-2 py-2 rounded-[100px] border"
            style={{
              backgroundColor: 'rgba(20,19,26,0.55)',
              borderColor: 'rgba(255,255,255,0.10)',
              backdropFilter: 'blur(19.65px)',
              WebkitBackdropFilter: 'blur(19.65px)',
            }}
          >
            {/* Left: section links */}
            <div className="hidden sm:flex items-center">
              {NAV_LINKS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => scrollTo(l.id)}
                  className="px-6 py-2.5 text-[14px] font-medium text-[rgba(245,245,244,0.82)] hover:text-[#F5F5F4] transition-colors duration-150"
                  style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Right: auth CTAs */}
            <div className="flex items-center gap-2 ml-auto">
              <SignInButton mode="modal" fallbackRedirectUrl="/today" forceRedirectUrl="/today">
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-[100px] text-[14px] font-medium transition-transform duration-150 hover:-translate-y-0.5"
                  style={{
                    background: 'var(--claura-bone)',
                    color: 'var(--claura-bone-ink)',
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                  }}
                >
                  Start now
                </button>
              </SignInButton>
              <SignInButton mode="modal" fallbackRedirectUrl="/today" forceRedirectUrl="/today">
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-[100px] text-[14px] font-medium text-[#F5F5F4] transition-colors duration-150"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                  }}
                >
                  Sign in
                </button>
              </SignInButton>
            </div>
          </div>
        </nav>

        {/* Hero copy over the photo */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 pt-[128px] sm:pt-[180px] pb-[72px] sm:pb-[120px] min-h-[70vh] sm:min-h-[78vh] justify-center">
          <h1
            className="text-[#F5F5F4] font-normal leading-[1.02] tracking-[-0.02em]"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(44px, 7vw, 88px)',
              textShadow: '0 2px 40px rgba(0,0,0,0.35)',
              maxWidth: '12ch',
            }}
          >
            Let your soul breath
          </h1>

          {/* Email capture */}
          <form onSubmit={handleEmailSubmit} className="mt-8 sm:mt-10 flex items-center gap-2 w-full max-w-[560px]">
            <label htmlFor="stardust-email" className="sr-only">Your email</label>
            <input
              id="stardust-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="flex-1 h-[60px] px-6 rounded-[100px] text-[15px] text-[#F5F5F4] placeholder:text-[rgba(245,245,244,0.55)] focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.25)]"
              style={{
                backgroundColor: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.14)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            />
            <button
              type="submit"
              aria-label="Get started"
              className="grid place-items-center h-[60px] w-[60px] rounded-full flex-shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
              style={{ background: 'var(--claura-bone)', color: 'var(--claura-bone-ink)' }}
            >
              <ArrowUpRight className="w-5 h-5" aria-hidden />
            </button>
          </form>

          <p
            className="mt-4 text-[13px] leading-relaxed max-w-[440px] text-[rgba(245,245,244,0.62)]"
            style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Build a digital twin from your real footprint — your Soul Signature,
            captured in the patterns only you leave behind.
          </p>
        </div>
      </div>

      {/* ── Wordmark block on the dark canvas ── */}
      <div className="relative flex flex-col items-center text-center mt-14 sm:mt-24">
        <h2
          aria-label="Twin.me"
          className="font-normal leading-none text-[#F5F5F4] select-none"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(72px, 12vw, 168px)',
            textShadow:
              '0 0 24px rgba(245,245,244,0.35), 0 0 64px rgba(245,245,244,0.18), 0 0 120px rgba(232,224,212,0.12)',
          }}
        >
          Twin<span className="italic">.me</span>
        </h2>

        <p
          className="mt-4 sm:mt-6 font-normal leading-[1.05] tracking-[-0.01em]"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(40px, 6.5vw, 84px)',
            color: 'rgba(245,245,244,0.82)',
            maxWidth: '14ch',
          }}
        >
          we are made of stardust
        </p>

        <div className="mt-8 sm:mt-10 flex items-center gap-3">
          <SignInButton mode="modal" fallbackRedirectUrl="/today" forceRedirectUrl="/today">
            <button
              type="button"
              className="px-6 py-3 rounded-[100px] text-[14px] font-medium transition-transform duration-150 hover:-translate-y-0.5"
              style={{
                background: 'var(--claura-bone)',
                color: 'var(--claura-bone-ink)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              Start for free
            </button>
          </SignInButton>
          <SignInButton mode="modal" fallbackRedirectUrl="/today" forceRedirectUrl="/today">
            <button
              type="button"
              className="px-6 py-3 rounded-[100px] text-[14px] font-medium text-[#F5F5F4] transition-colors duration-150"
              style={{
                backgroundColor: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.12)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    </section>
  );
}
