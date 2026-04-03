import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, Music, Brain, Database, Bell, Shield, Menu, X } from 'lucide-react';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { useDemo } from '../contexts/DemoContext';

import { InlineEvidence } from '../components/landing/InlineEvidence';
import { useLenis } from '../hooks/useLenis';
import {
  SpotifyLogo,
  GoogleCalendarLogo,
  YoutubeLogo,
  DiscordLogo,
  LinkedinLogo,
} from '../components/PlatformLogos';
import '../styles/landing.css';

/* ── Active platform integrations ── */
const PLATFORMS = [
  { id: 'spotify',   name: 'Spotify',            Icon: SpotifyLogo,         color: '#1DB954' },
  { id: 'calendar',  name: 'Google Calendar',     Icon: GoogleCalendarLogo,  color: '#4285F4' },
  { id: 'youtube',   name: 'YouTube',             Icon: YoutubeLogo,         color: '#FF0000' },
  { id: 'discord',   name: 'Discord',             Icon: DiscordLogo,         color: '#5865F2' },
  { id: 'linkedin',  name: 'LinkedIn',            Icon: LinkedinLogo,        color: '#0A66C2' },
];

/* ── Card images from Gemini ── */
const CARD_IMAGES = {
  connect: '/images/backgrounds/flower-card-2.jpg',
  discover: '/images/backgrounds/flower-card-7.jpg',
  share: '/images/backgrounds/flower-card-6.jpg',
  control: '/images/backgrounds/flower-card-5.jpg',
  cta: '/images/backgrounds/flower-card-4.jpg',
};

/* ── Service tab data ── */
const SERVICES = [
  {
    id: 'connect',
    title: 'Connect',
    num: '01',
    heading: 'Connect',
    desc: 'Securely link Spotify, Google Calendar, YouTube, and more. Your digital footprint becomes the raw material of your soul signature.',
    img: CARD_IMAGES.connect,
  },
  {
    id: 'discover',
    title: 'Discover',
    num: '02',
    heading: 'Discover',
    desc: 'AI unearths invisible patterns across your data -- personality traits, rhythms, and curiosities you never noticed about yourself.',
    img: CARD_IMAGES.discover,
  },
  {
    id: 'share',
    title: 'Share',
    num: '03',
    heading: 'Share',
    desc: 'Share your authentic soul signature with the world. Let others see the real you -- not your resume, but your personality.',
    img: CARD_IMAGES.share,
  },
  {
    id: 'control',
    title: 'Control',
    num: '04',
    heading: 'Control',
    desc: 'Choose what to reveal and what to keep private. Your privacy spectrum dashboard puts you in total control of your data.',
    img: CARD_IMAGES.control,
  },
];

const Index = () => {
  useLenis();
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();
  const { enterDemoMode } = useDemo();
  const [activeService, setActiveService] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /* Auto-cycle services every 4s */
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveService((prev) => (prev + 1) % SERVICES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Redirect authenticated users immediately
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="w-full min-h-screen bg-[var(--background)] text-[#F5F0EB] font-sans text-sm font-medium">

      {/* ────────────── NAV ────────────── */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-[878px] px-4">
      <nav
        className="flex items-center justify-between pl-5 pr-3 py-[10px] rounded-[32px] border border-white/[0.08]"
        style={{
          backgroundColor: 'rgba(20,20,20,0.7)',
          backdropFilter: 'blur(19.65px)',
          WebkitBackdropFilter: 'blur(19.65px)',
        }}
      >
        <div className="flex items-center justify-between w-full">
          {/* Left: Logo — flower + TwinMe (matches auth & discover) */}
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <img
              src="/images/backgrounds/flower.png"
              alt=""
              className="w-7 h-7 rounded-full object-cover"
            />
            <span className="text-[22px] font-heading font-normal">TwinMe</span>
          </div>

          {/* Center: Nav links (desktop) */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#services"
              className="font-sans text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 cursor-pointer hover:text-[#F5F0EB]"
              onClick={(e) => { e.preventDefault(); document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }); }}
            >
              Services
            </a>
            <a
              href="#features"
              className="font-sans text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 cursor-pointer hover:text-[#F5F0EB]"
              onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="font-sans text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 cursor-pointer hover:text-[#F5F0EB]"
              onClick={(e) => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }}
            >
              How it works
            </a>
          </div>

          {/* Right: Auth (desktop) + hamburger (mobile) */}
          <div className="flex items-center gap-2">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                Dashboard
              </button>
            ) : (
              <>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="hidden md:inline-flex font-sans text-[13px] font-medium text-[var(--text-secondary)] bg-none border-none cursor-pointer transition-colors duration-150 py-2 px-4 hover:text-[#F5F0EB]">
                    Sign in
                  </button>
                </SignInButton>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                    Start Free
                  </button>
                </SignInButton>
              </>
            )}
            {/* Hamburger menu (mobile only) */}
            <button
              className="md:hidden p-2 text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>
      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 rounded-2xl bg-[rgba(20,20,20,0.95)] backdrop-blur-[19.65px] border border-white/[0.08] py-3 px-5 flex flex-col gap-3">
          {['services', 'features', 'how-it-works'].map((section) => (
            <a
              key={section}
              href={`#${section}`}
              className="font-sans text-[14px] font-medium text-[var(--text-secondary)] py-2 transition-colors hover:text-[#F5F0EB]"
              onClick={(e) => {
                e.preventDefault();
                setMobileMenuOpen(false);
                document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {section === 'how-it-works' ? 'How it works' : section.charAt(0).toUpperCase() + section.slice(1)}
            </a>
          ))}
        </div>
      )}
      </div>

      {/* ────────────── ACT 1: EMOTIONAL HOOK ────────────── */}
      <section className="px-6 lg:px-16 pt-24 pb-16 lg:pt-36 lg:pb-28">
        <div className="max-w-[520px] mx-auto text-center flex flex-col items-center">
          {/* Main heading — let it breathe */}
          <h1
            className="text-[48px] md:text-[80px] font-heading font-normal mb-8"
          >
            What if your data could reveal your soul?
          </h1>

          {/* One paragraph — narrative voice, 60% opacity */}
          <p
            className="narrative-voice mb-10 text-lg max-w-[460px]"
          >
            Your music, your calendar, your conversations — they already know who you are. We just listen to what they're saying.
          </p>

          {/* Single earned CTA — not loud, not multiple */}
          <div className="flex flex-col items-center gap-3">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button onClick={() => navigate('/discover')} className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                  Discover yourself <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { enterDemoMode(); navigate('/dashboard'); }}
                  className="text-xs bg-none border-none cursor-pointer text-[#9A9590] transition-colors hover:text-[var(--text-secondary)]"
                >
                  or try the demo
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Act transition — subtle breathing space ── */}
      <div className="flex justify-center py-8">
        <div className="w-12 h-px landing-divider-gradient" />
      </div>

      {/* ────────────── ACT 2: PRODUCT DEPTH ────────────── */}

      {/* ────────────── PLATFORMS STRIP (Act 2 opens) ────────────── */}
      <section className="px-6 lg:px-16 py-12 border-t border-b border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-center mb-7 font-sans text-[11px] font-normal tracking-[0.12em] uppercase text-[#9A9590]">
            Your data, your insights — powered by
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-14">
            {PLATFORMS.map(({ id, name, Icon, color }) => (
              <div key={id} className="flex items-center gap-2.5 transition-opacity duration-150 opacity-50 hover:opacity-90">
                <Icon className="w-5 h-5" style={{ color }} />
                <span className="font-sans text-[13px] font-medium text-[var(--text-secondary)]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── WHO WE ARE + STATS ────────────── */}
      <section className="px-6 lg:px-16 py-24 warm-glow relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto relative z-10">
          {/* Header row */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 mb-14">
            <div className="lg:w-1/2">
              <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-lg py-1.5 px-3.5 text-xs font-normal text-[var(--text-secondary)] inline-block mb-5">Who we are</span>
              <h2 className="text-[36px] md:text-[56px] font-heading font-normal">
                The soul signature built for <span className="font-heading font-normal italic">you.</span>
              </h2>
            </div>
            <div className="lg:w-1/2 flex items-end">
              <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] max-w-[520px]">
                We built TwinMe to go beyond your public persona. We listen to your private data patterns, discover what makes you unique, and build a digital twin that truly knows you.
              </p>
            </div>
          </div>

          {/* Stats — standalone glass cards */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-5"
          >
            {[
              { value: '5+', label: 'Platform integrations', sub: 'And growing' },
              { value: '5', label: 'Expert reflections', sub: 'Unique perspectives' },
              { value: '< 60s', label: 'Time to first insight', sub: 'After connecting' },
            ].map((stat, i) => (
              <div key={i} className="glass-stat-standalone bg-white/[0.03] border border-white/[0.08] rounded-[20px] py-8 px-7 text-center relative overflow-hidden">
                <div
                  className="font-heading text-[52px] font-semibold leading-[1.05] text-[#F5F0EB] mb-2.5 tracking-[-0.03em]"
                >
                  {stat.value}
                </div>
                <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] m-0">{stat.label}</p>
                <p className="font-sans text-[11px] text-[#9A9590] mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── SERVICES — Interactive Tab + Flower Card ────────────── */}
      <section id="services" className="px-6 lg:px-16 py-24">
        <div className="max-w-[1200px] mx-auto">
          {/* Header */}
          <div className="mb-14">
            <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-lg py-1.5 px-3.5 text-xs font-normal text-[var(--text-secondary)] inline-block mb-5">Services</span>
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-16">
              <h2 className="text-[36px] md:text-[56px] font-heading font-normal lg:max-w-[520px]">
                We handle everything so you don't have to.
              </h2>
              <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] max-w-[480px] lg:pt-2">
                From connecting your platforms to generating insights and building your AI twin -- we manage the entire process while you discover yourself.
              </p>
            </div>
          </div>

          {/* Tabs + Card */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Left: Tab labels */}
            <div className="lg:w-[45%] flex flex-col">
              {SERVICES.map((svc, idx) => (
                <div
                  key={svc.id}
                  className={`cursor-pointer py-5 px-7 rounded-2xl transition-all duration-150 hover:bg-white/[0.03] flex items-baseline gap-3 ${idx === activeService ? 'bg-white/[0.05]' : ''}`}
                  onClick={() => setActiveService(idx)}
                >
                  <h3 className={`text-[24px] md:text-[32px] font-heading font-normal transition-colors duration-200 ${
                    idx === activeService ? 'text-[#F5F0EB]' : 'text-[var(--text-secondary)] opacity-40'
                  }`}>
                    {svc.title}
                  </h3>
                  <span className={`font-sans text-sm font-medium leading-[1.65] transition-colors duration-200 ${
                    idx === activeService ? 'text-[var(--text-secondary)]' : 'text-[#9A9590] opacity-40'
                  }`}>
                    {svc.num}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: Flower card + description */}
            <div className="lg:w-[55%]">
              <div key={activeService}>
                  {/* Flower image card */}
                  <div
                    className="relative overflow-hidden w-full mb-6 rounded-[28px] aspect-[1.4/1]"
                  >
                    <img
                      src={SERVICES[activeService].img}
                      alt={SERVICES[activeService].heading}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  {/* Description */}
                  <h4 className="font-sans text-sm font-semibold text-[#F5F0EB] leading-[1.65] mb-2">
                    {SERVICES[activeService].heading}
                  </h4>
                  <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] max-w-[480px]">
                    {SERVICES[activeService].desc}
                  </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────── FEATURES — 2x2 Grid ────────────── */}
      <section id="features" className="px-6 lg:px-16 py-24 warm-glow relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="mb-14">
            <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-lg py-1.5 px-3.5 text-xs font-normal text-[var(--text-secondary)] inline-block mb-5">Features</span>
            <h2 className="text-[36px] md:text-[56px] font-heading font-normal">
              Everything your twin needs to <span className="font-heading font-normal italic">know you.</span>
            </h2>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {([
              {
                icon: Database,
                title: 'Memory Stream',
                desc: 'Your complete digital footprint, unified and searchable',
                evidence: {
                  variant: 'memory' as const,
                  type: 'Observation',
                  text: 'Listened to "Clair de Lune" on repeat during a 3-hour deep work block — matches Thursday focus pattern.',
                  source: 'Spotify · 2h ago',
                },
              },
              {
                icon: Brain,
                title: 'Expert Reflections',
                desc: 'AI-powered insights from multiple analytical perspectives',
                evidence: {
                  variant: 'conversation' as const,
                  lines: [
                    { role: 'user' as const, text: 'Why do I always feel drained on Tuesdays?' },
                    { role: 'twin' as const, text: 'Your calendar shows back-to-back meetings every Tuesday afternoon. Your Spotify shifts to ambient music right after — a recovery pattern.' },
                  ],
                },
              },
              {
                icon: Bell,
                title: 'Proactive Insights',
                desc: 'Personalized recommendations delivered at the right moment',
                evidence: {
                  variant: 'insight' as const,
                  category: 'Energy Pattern',
                  text: 'Your deep work output peaks between 9-11am, but you have meetings scheduled then on 3 of 5 weekdays.',
                },
              },
              {
                icon: Shield,
                title: 'Privacy Spectrum',
                desc: 'Full control over what your twin knows and shares',
                evidence: {
                  variant: 'conversation' as const,
                  lines: [
                    { role: 'user' as const, text: 'What do you know about my health data?' },
                    { role: 'twin' as const, text: "Only what you've shared: sleep patterns from Whoop. Your medical records are not connected and I can't access them." },
                  ],
                },
              },
            ] as const).map((feature, idx) => {
              const FeatureIcon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="glass-feature-card bg-white/[0.06] backdrop-blur-[42px] border border-white/[0.10] rounded-[20px] py-8 px-7 relative overflow-hidden transition-all duration-150 hover:border-[rgba(232,160,80,0.25)] hover:bg-white/[0.08]"
                >
                  <div
                    className="mb-4 flex items-center justify-center w-12 h-12 rounded-[14px] bg-[rgba(232,160,80,0.08)] border border-[rgba(232,160,80,0.18)]"
                  >
                    <FeatureIcon className="w-5 h-5 text-[#E8A050]" />
                  </div>
                  <h4 className="font-sans text-base font-semibold text-[#F5F0EB] leading-[1.65] mb-2">
                    {feature.title}
                  </h4>
                  <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65]">{feature.desc}</p>
                  <InlineEvidence {...feature.evidence} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ────────────── HOW WE WORK — 3 Steps ────────────── */}
      <section id="how-it-works" className="px-6 lg:px-16 py-24 warm-glow relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-12 lg:gap-20 relative z-10">
          {/* Left: heading + CTA */}
          <div className="lg:w-[45%]">
            <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-lg py-1.5 px-3.5 text-xs font-normal text-[var(--text-secondary)] inline-block mb-5">How we work</span>
            <h2 className="text-[36px] md:text-[56px] font-heading font-normal mb-5">
              Getting you results <span className="font-heading font-normal italic">without</span> the complexity.
            </h2>
            <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] mb-8 max-w-[440px]">
              Our three-step process takes you from connecting platforms to discovering your soul signature, with clear progress and insights at every stage.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {isLoaded && isSignedIn ? (
                <button onClick={() => navigate('/dashboard')} className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                    Start Free <ArrowRight className="w-4 h-4" />
                  </button>
                </SignInButton>
              )}
            </div>
          </div>

          {/* Right: 3 steps */}
          <div className="lg:w-[55%] flex flex-col gap-10">
            {[
              { num: '01', title: 'Connect Your Platforms', badge: 'Step 1', desc: 'Link your Spotify, Google Calendar, YouTube and more. We securely pull your data without storing passwords.' },
              { num: '02', title: 'Discover Your Patterns', badge: 'Step 2', desc: 'Our AI analyzes your cross-platform data, identifying personality traits, daily rhythms, and hidden curiosities.' },
              { num: '03', title: 'Meet Your Twin', badge: 'Ongoing', desc: 'Your AI twin embodies your personality. Chat with it, share it, and watch it evolve as you add more data.' },
            ].map((step, idx) => (
              <div
                key={step.num}
                className="flex gap-5"
              >
                <div className="w-12 h-12 rounded-full border-[1.5px] border-[rgba(232,160,80,0.25)] flex items-center justify-center font-sans text-xs font-normal text-[var(--text-secondary)] shrink-0">{step.num}</div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-sans text-sm font-semibold text-[#F5F0EB] leading-[1.65]">{step.title}</h4>
                    <span className="font-sans bg-white/[0.04] border border-white/[0.08] rounded-md py-[3px] px-2.5 text-xs font-normal text-[var(--text-secondary)]">{step.badge}</span>
                  </div>
                  <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] max-w-[420px]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── FINAL CTA ────────────── */}
      <section className="px-6 lg:px-16 py-24 warm-glow relative overflow-hidden">
        <div className="max-w-[1072px] mx-auto text-center flex flex-col items-center gap-8">
          <h2 className="text-[36px] md:text-[56px] font-heading font-normal">
            Turn confusion into <span className="font-heading font-normal italic">clarity,</span> today.
          </h2>

          {/* Standalone flower image */}
          <div
            className="w-full max-w-[820px] overflow-hidden rounded-[28px]"
          >
            <img
              src={CARD_IMAGES.cta}
              alt=""
              className="w-full h-auto block"
            />
          </div>

          <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65] max-w-[520px]">
            Start free and discover patterns about yourself you never noticed. Your soul signature is waiting.
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="font-sans bg-[#F5F0EB] text-[var(--primary-foreground)] rounded-full py-[14px] px-7 text-xs font-normal transition-all duration-150 inline-flex items-center gap-2 tracking-[0.02em] hover:opacity-85 hover:-translate-y-0.5">
                  Start Free <ArrowRight className="w-4 h-4" />
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </section>

      {/* ────────────── FOOTER ────────────── */}
      <footer className="px-6 lg:px-16 pb-10 pt-12 border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto">
          {/* Top row — 3 columns */}
          <div className="flex flex-col lg:flex-row justify-between gap-10 mb-10">
            {/* Brand */}
            <div className="lg:max-w-[220px]">
              <h3 className="text-[22px] font-heading font-normal mb-2">TwinMe</h3>
              <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65]">Discover what makes you authentically you.</p>
            </div>

            {/* Product links */}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-4 text-[#9A9590]">
                Product
              </p>
              <ul className="space-y-2.5 font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65]">
                <li><a href="/#features" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">Features</a></li>
                <li><a href="/#how-it-works" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">How it works</a></li>
                <li><a href="/get-started" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">Connect your data</a></li>
                <li><a href="/soul-signature" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">Soul Signature</a></li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-4 text-[#9A9590]">
                Community
              </p>
              <ul className="space-y-2.5 font-sans text-sm font-medium text-[var(--text-secondary)] leading-[1.65]">
                <li><a href="https://github.com/stefanogebara" target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">GitHub</a></li>
                <li><a href="https://x.com/twinme_ai" target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">X</a></li>
                <li><a href="mailto:hello@twinme.me" className="text-[var(--text-secondary)] hover:text-[#F5F0EB] transition-colors">Contact us</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 font-sans text-xs font-medium text-[var(--text-secondary)] leading-[1.65] pt-6 border-t border-white/[0.06]">
            <p>&copy; 2026 TwinMe. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="/privacy-policy" className="hover:text-[#F5F0EB] transition-colors">Privacy Policy</a>
              <a href="/terms" className="hover:text-[#F5F0EB] transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
