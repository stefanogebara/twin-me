import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, Globe, MessageSquare, Music, Brain, Database, Bell, Shield } from 'lucide-react';
import { useAuth, SignInButton } from '../contexts/AuthContext';

import { InlineEvidence } from '../components/landing/InlineEvidence';
import { useLenis } from '../hooks/useLenis';
import {
  SpotifyLogo,
  GoogleCalendarLogo,
  YoutubeLogo,
  DiscordLogo,
  LinkedinLogo,
} from '../components/PlatformLogos';

/* ── Active platform integrations + import-based sources ── */
const BrowserExtIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <Globe className={className} style={style} />
);
const WhatsAppIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <MessageSquare className={className} style={style} />
);

const PLATFORMS = [
  { id: 'spotify',   name: 'Spotify',            Icon: SpotifyLogo,         color: '#1DB954' },
  { id: 'calendar',  name: 'Google Calendar',     Icon: GoogleCalendarLogo,  color: '#4285F4' },
  { id: 'youtube',   name: 'YouTube',             Icon: YoutubeLogo,         color: '#FF0000' },
  { id: 'discord',   name: 'Discord',             Icon: DiscordLogo,         color: '#5865F2' },
  { id: 'linkedin',  name: 'LinkedIn',            Icon: LinkedinLogo,        color: '#0A66C2' },
  { id: 'browser',   name: 'Browser Extension',   Icon: BrowserExtIcon,      color: '#8B5CF6' },
  { id: 'whatsapp',  name: 'WhatsApp',            Icon: WhatsAppIcon,        color: '#25D366' },
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
  const [activeService, setActiveService] = useState(0);
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
    <div className="w-full min-h-screen" style={{ backgroundColor: '#141414', color: '#F5F0EB', fontFamily: "'Geist', sans-serif", fontSize: '14px', fontWeight: 500 }}>
      <style>{`
        /* ── Sundust Dark Typography System ── */
        .h1 { font-size: 80px; }
        .h2 { font-size: 56px; }
        .h3 { font-size: 32px; }
        .body-text {
          font-family: 'Geist', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #A8A29E;
          line-height: 1.65;
        }
        .claura-label {
          font-family: 'Geist', sans-serif;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 400;
          color: #A8A29E;
          display: inline-block;
        }
        .btn-cta {
          font-family: 'Geist', sans-serif;
          background-color: #F5F0EB;
          color: #141414;
          border-radius: 9999px;
          padding: 14px 28px;
          font-size: 12px;
          font-weight: 400;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          letter-spacing: 0.02em;
        }
        .btn-cta:hover { opacity: 0.85; transform: translateY(-2px); }
        .btn-outline {
          font-family: 'Geist', sans-serif;
          background: transparent;
          color: #F5F0EB;
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: 9999px;
          padding: 13px 26px;
          font-size: 12px;
          font-weight: 400;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          letter-spacing: 0.02em;
        }
        .btn-outline:hover { border-color: rgba(255,255,255,0.4); transform: translateY(-1px); }

        /* Nav link style */
        .nav-link {
          font-family: 'Geist', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #A8A29E;
          transition: color 0.2s ease;
          cursor: pointer;
        }
        .nav-link:hover { color: #F5F0EB; }

        /* Sign in text button */
        .btn-signin {
          font-family: 'Geist', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #A8A29E;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.2s ease;
          padding: 8px 16px;
        }
        .btn-signin:hover { color: #F5F0EB; }

        /* Service tab highlight */
        .service-tab {
          cursor: pointer;
          padding: 20px 28px;
          border-radius: 16px;
          transition: all 0.3s ease;
        }
        .service-tab:hover { background: rgba(255,255,255,0.03); }
        .service-tab.active {
          background: rgba(255,255,255,0.05);
        }

        /* Glass stat card — standalone */
        .glass-stat-standalone {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px 28px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .glass-stat-standalone::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #E8A050, #D4644A, transparent);
          opacity: 0.6;
        }

        /* Step circle */
        .step-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 1.5px solid rgba(232,160,80,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Geist', sans-serif;
          font-size: 12px;
          font-weight: 400;
          color: #A8A29E;
          flex-shrink: 0;
        }
        .step-badge {
          font-family: 'Geist', sans-serif;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          padding: 3px 10px;
          font-size: 12px;
          font-weight: 400;
          color: #A8A29E;
        }

        /* Glass feature card */
        .glass-feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px 28px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s ease, background 0.3s ease;
        }
        .glass-feature-card:hover {
          border-color: rgba(232, 160, 80, 0.25);
          background: rgba(255,255,255,0.05);
        }
        .glass-feature-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #E8A050, #D4644A, transparent);
          opacity: 0.4;
        }

        /* Warm ambient glow */
        .warm-glow {
          position: relative;
        }
        .warm-glow {
          overflow: hidden;
        }
        .warm-glow::before {
          content: '';
          position: absolute;
          top: -100px;
          left: 50%;
          transform: translateX(-50%);
          width: min(600px, 100vw);
          height: 400px;
          background: radial-gradient(ellipse at center, rgba(232, 160, 80, 0.06) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        /* Floating pill navbar */
        .nav-dark {
          background: rgba(20, 20, 20, 0.7);
          backdrop-filter: blur(19.65px);
          -webkit-backdrop-filter: blur(19.65px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        /* Responsive heading sizes */
        @media (max-width: 768px) {
          .h1 { font-size: 48px; }
          .h2 { font-size: 36px; }
          .h3 { font-size: 24px; }
          .glass-prompt { max-width: 100%; }
          .prompt-glow-wrapper::before {
            width: 100%;
            height: 300px;
          }
        }
      `}</style>

      {/* ────────────── NAV ────────────── */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-[878px] px-4">
      <nav className="flex items-center justify-between pl-5 pr-3 py-[10px] rounded-[32px] nav-dark">
        <div className="flex items-center justify-between w-full">
          {/* Left: Logo */}
          <span
            className="text-[22px] cursor-pointer"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}
            onClick={() => navigate('/')}
          >
            Twin Me
          </span>

          {/* Center: Nav links */}
          <div className="hidden md:flex items-center gap-8">
            <a
              className="nav-link"
              onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Services
            </a>
            <a
              className="nav-link"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Features
            </a>
            <a
              className="nav-link"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              How it works
            </a>
          </div>

          {/* Right: Auth */}
          <div className="flex items-center gap-2">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta">
                Dashboard
              </button>
            ) : (
              <>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="btn-signin">
                    Sign in
                  </button>
                </SignInButton>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="btn-cta">
                    Start Free
                  </button>
                </SignInButton>
              </>
            )}
          </div>
        </div>
      </nav>
      </div>

      {/* ────────────── ACT 1: EMOTIONAL HOOK ────────────── */}
      <section className="px-6 lg:px-16 pt-24 pb-16 lg:pt-36 lg:pb-28">
        <div className="max-w-[520px] mx-auto text-center flex flex-col items-center">
          {/* Main heading — let it breathe */}
          <h1
            className="h1 mb-8"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}
          >
            What if your data could reveal your soul?
          </h1>

          {/* One paragraph — narrative voice, 60% opacity */}
          <p
            className="narrative-voice mb-10"
            style={{ fontSize: '18px', maxWidth: '460px' }}
          >
            Your music, your calendar, your conversations — they already know who you are. We just listen to what they're saying.
          </p>

          {/* Single earned CTA — not loud, not multiple */}
          <div>
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="btn-cta">
                  Discover yourself <ArrowRight className="w-4 h-4" />
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </section>

      {/* ── Act transition — subtle breathing space ── */}
      <div className="flex justify-center py-8">
        <div
          className="w-12 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(232,160,80,0.4), transparent)' }}
        />
      </div>

      {/* ────────────── ACT 2: PRODUCT DEPTH ────────────── */}

      {/* ────────────── PLATFORMS STRIP (Act 2 opens) ────────────── */}
      <section className="px-6 lg:px-16 py-12 border-t border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-[1200px] mx-auto">
          <p className="text-center mb-7" style={{ fontFamily: "'Geist', sans-serif", fontSize: '11px', fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#706B63' }}>
            Your data, your insights — powered by
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-14">
            {PLATFORMS.map(({ id, name, Icon, color }) => (
              <div key={id} className="flex items-center gap-2.5 transition-opacity duration-200" style={{ opacity: 0.5 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
              >
                <Icon className="w-5 h-5" style={{ color }} />
                <span style={{ fontFamily: "'Geist', sans-serif", fontSize: '13px', fontWeight: 500, color: '#A8A29E' }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── WHO WE ARE + STATS ────────────── */}
      <section className="px-6 lg:px-16 py-24 warm-glow">
        <div className="max-w-[1200px] mx-auto relative z-10">
          {/* Header row */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 mb-14">
            <div className="lg:w-1/2">
              <span className="claura-label mb-5 block">Who we are</span>
              <h2 className="h2" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>
                The soul signature built for <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontStyle: 'italic' }}>you.</span>
              </h2>
            </div>
            <div className="lg:w-1/2 flex items-end">
              <p className="body-text max-w-[520px]">
                We built Twin Me to go beyond your public persona. We listen to your private data patterns, discover what makes you unique, and build a digital twin that truly knows you.
              </p>
            </div>
          </div>

          {/* Stats — standalone glass cards */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-5"
          >
            {[
              { value: '5+', label: 'Platform integrations', sub: 'And growing' },
              { value: '1,536d', label: 'Vector embeddings', sub: 'Per memory' },
              { value: '< 60s', label: 'Time to first insight', sub: 'After connecting' },
            ].map((stat, i) => (
              <div key={i} className="glass-stat-standalone">
                <div
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: '52px',
                    fontWeight: 600,
                    lineHeight: 1.05,
                    color: '#F5F0EB',
                    marginBottom: '10px',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {stat.value}
                </div>
                <p className="body-text" style={{ margin: 0 }}>{stat.label}</p>
                <p style={{ fontFamily: "'Geist', sans-serif", fontSize: '11px', color: '#706B63', marginTop: '4px' }}>{stat.sub}</p>
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
            <span className="claura-label mb-5 block">Services</span>
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-16">
              <h2 className="h2 lg:max-w-[520px]" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>
                We handle everything so you don't have to.
              </h2>
              <p className="body-text max-w-[480px] lg:pt-2">
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
                  className={`service-tab flex items-baseline gap-3 ${idx === activeService ? 'active' : ''}`}
                  onClick={() => setActiveService(idx)}
                >
                  <h3 className={`h3 transition-colors duration-300 ${
                    idx === activeService ? 'text-[#F5F0EB]' : 'text-[#A8A29E] opacity-40'
                  }`} style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>
                    {svc.title}
                  </h3>
                  <span className={`body-text transition-colors duration-300 ${
                    idx === activeService ? 'text-[#A8A29E]' : 'text-[#706B63] opacity-40'
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
                    className="relative overflow-hidden w-full mb-6"
                    style={{
                      borderRadius: '28px',
                      aspectRatio: '1.4 / 1',
                    }}
                  >
                    <img
                      src={SERVICES[activeService].img}
                      alt={SERVICES[activeService].heading}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  {/* Description */}
                  <h4 className="body-text mb-2" style={{ fontWeight: 600, color: '#F5F0EB' }}>
                    {SERVICES[activeService].heading}
                  </h4>
                  <p className="body-text max-w-[480px]">
                    {SERVICES[activeService].desc}
                  </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────── FEATURES — 2x2 Grid ────────────── */}
      <section id="features" className="px-6 lg:px-16 py-24 warm-glow">
        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="mb-14">
            <span className="claura-label mb-5 block">Features</span>
            <h2 className="h2" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>
              Everything your twin needs to <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontStyle: 'italic' }}>know you.</span>
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
                  className="glass-feature-card"
                >
                  <div
                    className="mb-4 flex items-center justify-center"
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      background: 'rgba(232, 160, 80, 0.08)',
                      border: '1px solid rgba(232, 160, 80, 0.18)',
                    }}
                  >
                    <FeatureIcon className="w-5 h-5" style={{ color: '#E8A050' }} />
                  </div>
                  <h4 className="body-text mb-2" style={{ fontWeight: 600, color: '#F5F0EB', fontSize: '16px' }}>
                    {feature.title}
                  </h4>
                  <p className="body-text">{feature.desc}</p>
                  <InlineEvidence {...feature.evidence} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ────────────── HOW WE WORK — 3 Steps ────────────── */}
      <section id="how-it-works" className="px-6 lg:px-16 py-24 warm-glow">
        <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-12 lg:gap-20 relative z-10">
          {/* Left: heading + CTA */}
          <div className="lg:w-[45%]">
            <span className="claura-label mb-5 block">How we work</span>
            <h2 className="h2 mb-5" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>
              Getting you results <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontStyle: 'italic' }}>without</span> the complexity.
            </h2>
            <p className="body-text mb-8 max-w-[440px]">
              Our three-step process takes you from connecting platforms to discovering your soul signature, with clear progress and insights at every stage.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {isLoaded && isSignedIn ? (
                <button onClick={() => navigate('/dashboard')} className="btn-cta">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="btn-cta">
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
                <div className="step-circle">{step.num}</div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="body-text" style={{ fontWeight: 600, color: '#F5F0EB' }}>{step.title}</h4>
                    <span className="step-badge">{step.badge}</span>
                  </div>
                  <p className="body-text max-w-[420px]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── FINAL CTA ────────────── */}
      <section className="px-6 lg:px-16 py-24 warm-glow">
        <div className="max-w-[1072px] mx-auto text-center flex flex-col items-center gap-8">
          <h2 className="h2" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>
            Turn confusion into <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontStyle: 'italic' }}>clarity,</span> today.
          </h2>

          {/* Standalone flower image */}
          <div
            className="w-full max-w-[820px] overflow-hidden"
            style={{ borderRadius: '28px' }}
          >
            <img
              src={CARD_IMAGES.cta}
              alt=""
              className="w-full h-auto block"
            />
          </div>

          <p className="body-text max-w-[520px]">
            Start free and discover patterns about yourself you never noticed. Your soul signature is waiting.
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="btn-cta">
                  Start Free <ArrowRight className="w-4 h-4" />
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </section>

      {/* ────────────── FOOTER ────────────── */}
      <footer className="px-6 lg:px-16 pb-10 pt-12" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-[1200px] mx-auto">
          {/* Top row — 3 columns */}
          <div className="flex flex-col lg:flex-row justify-between gap-10 mb-10">
            {/* Brand */}
            <div className="lg:max-w-[220px]">
              <h3 className="text-[22px] mb-2" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}>Twin Me</h3>
              <p className="body-text">Discover what makes you authentically you.</p>
            </div>

            {/* Product links */}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-4" style={{ color: '#706B63' }}>
                Product
              </p>
              <ul className="space-y-2.5 body-text">
                <li><a href="/#features" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>Features</a></li>
                <li><a href="/#how-it-works" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>How it works</a></li>
                <li><a href="/get-started" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>Connect your data</a></li>
                <li><a href="/soul-signature" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>Soul Signature</a></li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-4" style={{ color: '#706B63' }}>
                Community
              </p>
              <ul className="space-y-2.5 body-text">
                <li><a href="https://github.com/twinme-ai" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>GitHub</a></li>
                <li><a href="https://twitter.com/twinme_ai" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>Twitter / X</a></li>
                <li><a href="mailto:hello@twinme.ai" className="hover:text-[#F5F0EB] transition-colors" style={{ color: '#A8A29E' }}>Contact us</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 body-text pt-6" style={{ fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p>&copy; 2026 Twin Me. All rights reserved.</p>
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
