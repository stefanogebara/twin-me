import { useState } from 'react';
import { ArrowUpRight, Plus, Minus, Play } from 'lucide-react';
import { SignInButton } from '../contexts/AuthContext';
import StardustHero from '../components/landing/StardustHero';

/**
 * StardustLanding — full translation of the Figma "v1" landing
 * (file OAxqcmeKa91mDQvRq6SXru, frame 3094:207).
 *
 * Section order mirrors the Figma: hero → "your dream" → "designed to
 * live your life" (3 cards) → stats → image band → Features/Coming spine
 * → About → FAQ → closing CTA. Figma copy was lorem/placeholder, so real
 * copy is adapted from the production landing; images use existing cosmic
 * assets. Marketing surface: dark-cosmic, light text, does not theme-flip.
 */

const SERIF = "'Instrument Serif', Georgia, serif";
const SANS = "'Geist', 'Inter', system-ui, sans-serif";

/* ── shared bits ── */
function BoneButton({ children }: { children: React.ReactNode }) {
  return (
    <SignInButton mode="modal" fallbackRedirectUrl="/today" forceRedirectUrl="/today">
      <button
        type="button"
        className="px-6 py-3 rounded-[100px] text-[14px] font-medium transition-transform duration-150 hover:-translate-y-0.5"
        style={{ background: 'var(--claura-bone)', color: 'var(--claura-bone-ink)', fontFamily: SANS }}
      >
        {children}
      </button>
    </SignInButton>
  );
}
function GlassButton({ children }: { children: React.ReactNode }) {
  return (
    <SignInButton mode="modal" fallbackRedirectUrl="/today" forceRedirectUrl="/today">
      <button
        type="button"
        className="px-6 py-3 rounded-[100px] text-[14px] font-medium text-[#F5F5F4] transition-colors duration-150"
        style={{ backgroundColor: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)', fontFamily: SANS }}
      >
        {children}
      </button>
    </SignInButton>
  );
}
function CtaPair() {
  return (
    <div className="flex items-center justify-center gap-3">
      <BoneButton>Start for free</BoneButton>
      <GlassButton>Sign in</GlassButton>
    </div>
  );
}
const Serif = ({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <h2 className={className} style={{ fontFamily: SERIF, color: '#F5F5F4', letterSpacing: '-0.02em', ...style }}>{children}</h2>
);
const Body = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={className} style={{ fontFamily: SANS, color: 'rgba(245,245,244,0.62)', lineHeight: 1.7 }}>{children}</p>
);

const SECTION = 'w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10';

/* ── section 2: your dream / who we are ── */
function DreamSection() {
  return (
    <section className={`${SECTION} py-20 sm:py-28`}>
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-20">
        <Serif className="lg:w-1/2" style={{ fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1.05 }}>
          A personal AI built from <span style={{ fontStyle: 'italic' }}>your</span> soul.
        </Serif>
        <div className="lg:w-1/2 flex items-end">
          <Body className="max-w-[520px] text-[15px]">
            TwinMe goes beyond your public persona. It reads your Spotify, GitHub, Calendar
            and health data to build a Soul Signature — a deep personality portrait that
            powers an AI twin that genuinely knows you.
          </Body>
        </div>
      </div>
    </section>
  );
}

/* ── section 3: designed to live your life — 3 cards ── */
const CARDS = [
  { img: '/images/backgrounds/flower-card-1.jpg', title: 'Connect', desc: 'Link Spotify, Calendar, Whoop, YouTube and more. Your data becomes your twin’s memory.' },
  { img: '/images/backgrounds/flower-card-2.jpg', title: 'Understand', desc: 'AI maps your personality, habits and patterns across every platform — patterns you never noticed.' },
  { img: '/images/backgrounds/flower-card-3.jpg', title: 'Twin Chat', desc: 'Talk to a twin that actually knows you — grounded in your real memory, patterns and voice.' },
];
function DesignedSection() {
  return (
    <section className={`${SECTION} py-20 sm:py-28`}>
      <Serif className="mb-12 sm:mb-16" style={{ fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1.05 }}>
        Designed to help you <span style={{ fontStyle: 'italic' }}>live your life.</span>
      </Serif>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {CARDS.map((c) => (
          <div key={c.title} className="rounded-[24px] overflow-hidden" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--glass-surface-border)' }}>
            <div className="relative aspect-[1/1] overflow-hidden">
              <img src={c.img} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
              <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(12,11,16,0.55) 100%)' }} />
              <h3 className="absolute bottom-4 left-5 text-[22px]" style={{ fontFamily: SERIF, color: '#F5F5F4' }}>{c.title}</h3>
            </div>
            <p className="px-5 py-5 text-[14px]" style={{ fontFamily: SANS, color: 'rgba(245,245,244,0.6)', lineHeight: 1.65 }}>{c.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 flex justify-center"><CtaPair /></div>
    </section>
  );
}

/* ── section 4: stats ── */
const STATS = [
  { v: '7', l: 'Deep integrations', s: 'Spotify, YouTube, Gmail, Calendar, GitHub, Whoop & your browser.' },
  { v: '5-layer', l: 'Personality portrait', s: 'Built continuously from your real data.' },
  { v: '<60s', l: 'Time to first insight', s: 'From connecting to knowing.' },
];
function StatsSection() {
  return (
    <section className={`${SECTION} py-16 sm:py-24`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8 text-center sm:text-left">
        {STATS.map((s) => (
          <div key={s.v}>
            <div style={{ fontFamily: SERIF, color: '#F5F5F4', fontSize: 'clamp(56px, 7vw, 92px)', lineHeight: 1, letterSpacing: '-0.03em' }}>{s.v}</div>
            <p className="mt-3 text-[14px] font-medium" style={{ fontFamily: SANS, color: 'rgba(245,245,244,0.82)' }}>{s.l}</p>
            <p className="mt-1 text-[13px]" style={{ fontFamily: SANS, color: 'rgba(245,245,244,0.5)' }}>{s.s}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── section 5: full-width image band ── */
function ImageBand() {
  return (
    <section className={`${SECTION} py-8 sm:py-12`}>
      <div className="relative w-full overflow-hidden rounded-[24px] sm:rounded-[32px] aspect-[2.6/1]">
        <img src="/images/cosmic-v2/section8-meadow.webp" srcSet="/images/cosmic-v2/section8-meadow.webp 1x, /images/cosmic-v2/section8-meadow@2x.webp 2x" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 50%' }} />
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(80% 80% at 50% 60%, rgba(12,11,16,0.35) 0%, transparent 60%)' }} />
      </div>
      <div className="mt-12 flex justify-center"><CtaPair /></div>
    </section>
  );
}

/* ── section 6: Features — AI Chat spine — Coming ── */
const SPINE = ['Browser', 'Connecting', 'AI Chat', 'MCPs', 'Control'];
function FeaturesSpine() {
  return (
    <section className={`${SECTION} py-20 sm:py-28`}>
      <div className="flex items-center justify-between gap-6">
        <Serif style={{ fontSize: 'clamp(24px, 3vw, 40px)' }}>Features</Serif>
        <div className="hidden sm:block flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(245,245,244,0.18), transparent)' }} />
        <Serif style={{ fontSize: 'clamp(24px, 3vw, 40px)', color: 'rgba(245,245,244,0.5)' }}>Coming</Serif>
      </div>

      {/* central glowing node */}
      <div className="relative mt-10 flex justify-center">
        <div
          className="relative rounded-[28px] px-8 py-8 sm:px-12 sm:py-10 text-center overflow-hidden"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--glass-surface-border)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            boxShadow: '0 0 80px rgba(232,224,212,0.10), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 60% at 50% 40%, rgba(232,224,212,0.10) 0%, transparent 70%)' }} />
          <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {SPINE.map((s, i) => (
              <span key={s} className="flex items-center gap-4">
                <span
                  className="whitespace-nowrap"
                  style={{
                    fontFamily: SERIF,
                    fontSize: s === 'AI Chat' ? 'clamp(28px, 4vw, 44px)' : 'clamp(15px, 1.6vw, 20px)',
                    color: s === 'AI Chat' ? '#F5F5F4' : 'rgba(245,245,244,0.55)',
                    textShadow: s === 'AI Chat' ? '0 0 24px rgba(245,245,244,0.35)' : 'none',
                  }}
                >
                  {s}
                </span>
                {i < SPINE.length - 1 && <span aria-hidden className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(245,245,244,0.3)' }} />}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── section 7: About Us + media ── */
function AboutSection() {
  return (
    <section className={`${SECTION} py-20 sm:py-28`}>
      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">
        <div className="lg:w-[42%]">
          <Serif style={{ fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1.05 }}>
            About <span style={{ fontStyle: 'italic' }}>us</span>
          </Serif>
          <Body className="mt-6 max-w-[440px] text-[15px]">
            We believe the truest picture of a person lives in the roots, not the branches —
            in the quiet patterns of what you listen to, when you move, how you spend your
            attention. TwinMe turns those signals into a twin that reflects the real you.
          </Body>
        </div>
        <div className="lg:w-[58%] w-full">
          <div className="relative w-full overflow-hidden rounded-[24px] aspect-[16/10] group cursor-pointer">
            <img src="/images/cosmic-v2/section11-twin-meeting.webp" srcSet="/images/cosmic-v2/section11-twin-meeting.webp 1x, /images/cosmic-v2/section11-twin-meeting@2x.webp 2x" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 40%' }} />
            <div aria-hidden className="absolute inset-0" style={{ background: 'rgba(12,11,16,0.25)' }} />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid place-items-center w-16 h-16 rounded-full transition-transform duration-200 group-hover:scale-110" style={{ backgroundColor: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(20px)' }}>
                <Play className="w-6 h-6 text-[#F5F5F4] ml-0.5" fill="currentColor" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── section 8: FAQ ── */
const FAQ = [
  { q: 'What is a Soul Signature?', a: 'A living AI portrait of your authentic self — patterns, preferences and personality traits derived from how you actually behave across platforms.' },
  { q: 'How is my data used?', a: 'Your data stays in our secure infrastructure and is never used to train AI models. You own your Soul Signature completely.' },
  { q: 'What platforms can I connect?', a: 'Spotify, Google Calendar, YouTube, Gmail, GitHub and Whoop — plus a browser extension and desktop app that capture your real activity as it happens.' },
  { q: 'How accurate is the twin?', a: 'Accuracy compounds over time as memories accumulate. Most people notice meaningful personality alignment within a few days of connecting platforms.' },
  { q: 'Can I delete my data?', a: 'Yes. Delete any memory, any platform connection, or your entire Soul Signature at any time from Settings.' },
];
function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className={`${SECTION} py-20 sm:py-28`}>
      <Serif className="text-center mb-12" style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}>FAQ</Serif>
      <div className="max-w-[820px] mx-auto flex flex-col gap-3">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="rounded-[16px] overflow-hidden" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-glass)' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
              >
                <span className="text-[16px] font-medium" style={{ fontFamily: SANS, color: '#F5F5F4' }}>{item.q}</span>
                <span className="flex-shrink-0 grid place-items-center w-7 h-7 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(245,245,244,0.7)' }}>
                  {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </span>
              </button>
              {isOpen && (
                <p className="px-6 pb-5 text-[14px]" style={{ fontFamily: SANS, color: 'rgba(245,245,244,0.6)', lineHeight: 1.7 }}>{item.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── section 9: closing CTA ── */
function ClosingCta() {
  return (
    <section className="relative w-full px-3 sm:px-5 pt-8 pb-4">
      <div className="relative w-full max-w-[1720px] mx-auto overflow-hidden rounded-[24px] sm:rounded-[32px] aspect-[16/9] sm:aspect-[2.2/1]">
        <img src="/images/cosmic-v2/stage5-horizon.webp" srcSet="/images/cosmic-v2/stage5-horizon.webp 1x, /images/cosmic-v2/stage5-horizon@2x.webp 2x" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 45%' }} />
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(90% 90% at 50% 60%, rgba(12,11,16,0.55) 0%, rgba(12,11,16,0.2) 55%, transparent 80%)' }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <Serif style={{ fontSize: 'clamp(32px, 5vw, 68px)', lineHeight: 1.05, maxWidth: '16ch' }}>
            Meet the twin that finally knows <span style={{ fontStyle: 'italic' }}>you.</span>
          </Serif>
          <p className="mt-4 text-[14px] max-w-[440px]" style={{ fontFamily: SANS, color: 'rgba(245,245,244,0.72)', lineHeight: 1.6 }}>
            Start free. Connect your platforms. Your Soul Signature builds itself — your twin
            starts knowing you within 60 seconds.
          </p>
          <div className="mt-8"><CtaPair /></div>
        </div>
      </div>

      {/* wordmark sign-off */}
      <div className="flex justify-center pt-16 pb-10">
        <h2
          aria-label="Twin.me"
          className="font-normal leading-none text-[#F5F5F4] select-none"
          style={{ fontFamily: SERIF, fontSize: 'clamp(56px, 10vw, 140px)', textShadow: '0 0 24px rgba(245,245,244,0.3), 0 0 80px rgba(232,224,212,0.14)' }}
        >
          Twin<span className="italic">.me</span>
        </h2>
      </div>
    </section>
  );
}

export default function StardustLanding() {
  return (
    <div className="w-full min-h-screen" style={{ background: 'var(--background)' }}>
      <StardustHero />
      <DreamSection />
      <DesignedSection />
      <StatsSection />
      <ImageBand />
      <FeaturesSpine />
      <AboutSection />
      <FaqSection />
      <ClosingCta />
    </div>
  );
}
