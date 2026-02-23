import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Card images from Gemini ── */
const CARD_IMAGES = {
  hero: '/images/backgrounds/flower-card-1.jpg',      // Purple/orange flower on yellow
  connect: '/images/backgrounds/flower-card-2.jpg',    // Orange poppy on green bokeh
  discover: '/images/backgrounds/flower-card-3.jpg',   // Orange flower on teal underwater
  share: '/images/backgrounds/flower-card-4.jpg',      // Red/orange flower on cream
  control: '/images/backgrounds/flower-card-5.jpg',    // Pink/orange flower on purple
  stats: '/images/backgrounds/flower-card-6.jpg',      // Abstract orange/teal grainy
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
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();
  const [activeService, setActiveService] = useState(0);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/dashboard');
    }
  }, [isLoaded, isSignedIn, navigate]);

  /* Auto-cycle services every 4s */
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveService((prev) => (prev + 1) % SERVICES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full min-h-screen font-sans text-[#1F1C18]" style={{ backgroundColor: '#FCF6EF' }}>
      <style>{`
        .heading-serif {
          font-family: 'Halant', Georgia, serif;
          letter-spacing: -0.05em;
          line-height: 1.1;
        }
        .heading-serif-italic {
          font-family: 'Halant', Georgia, serif;
          font-style: italic;
          color: #8A857D;
          letter-spacing: -0.05em;
        }
        .claura-label {
          background: rgba(0,0,0,0.04);
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 8px;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #5C5851;
          display: inline-block;
        }
        .btn-cta {
          background-color: #2D2722;
          color: #F7F7F3;
          border-radius: 9999px;
          padding: 16px 32px;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          letter-spacing: -0.01em;
        }
        .btn-cta:hover { background-color: #1F1C18; transform: translateY(-2px); }
        .btn-outline {
          background: transparent;
          color: #2D2722;
          border: 1.5px solid #D5D0C8;
          border-radius: 9999px;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-outline:hover { border-color: #2D2722; transform: translateY(-1px); }

        /* Service tab highlight */
        .service-tab {
          cursor: pointer;
          padding: 20px 28px;
          border-radius: 16px;
          transition: all 0.3s ease;
        }
        .service-tab:hover { background: rgba(0,0,0,0.03); }
        .service-tab.active {
          background: rgba(0,0,0,0.04);
        }

        /* Glass stat card */
        .glass-stat {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 28px 24px;
          text-align: center;
        }

        /* Step circle */
        .step-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 1.5px solid #D5D0C8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          color: #5C5851;
          flex-shrink: 0;
        }
        .step-badge {
          background: rgba(0,0,0,0.04);
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 6px;
          padding: 3px 10px;
          font-size: 12px;
          font-weight: 500;
          color: #8A857D;
        }
      `}</style>

      {/* ────────────── NAV ────────────── */}
      <nav className="sticky top-0 z-50 w-full px-6 lg:px-16" style={{ backgroundColor: '#FCF6EF' }}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-8">
            <span
              className="heading-serif text-[22px] font-bold cursor-pointer"
              onClick={() => navigate('/')}
            >
              Twin Me
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta !py-3 !px-6 !text-[14px]">
                Dashboard
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="btn-cta !py-3 !px-6 !text-[14px]">
                  Start Free
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </nav>

      {/* ────────────── HERO ────────────── */}
      <section className="px-6 lg:px-16 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="max-w-[1072px] mx-auto text-center flex flex-col items-center gap-8">
          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex gap-0.5 text-[#C4A265]">
              {[...Array(5)].map((_, i) => (
                <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              ))}
            </div>
            <p className="text-[14px] text-[#8A857D] font-medium">Discover your authentic self</p>
          </motion.div>

          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="heading-serif text-[clamp(2.5rem,5.5vw,4.5rem)]"
          >
            From digital footprints to soul signature.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[17px] lg:text-[19px] text-[#8A857D] max-w-[620px] leading-[1.6]"
          >
            We discover what makes you authentically YOU through the private patterns across your music, wellness, and daily rhythms.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex items-center gap-4 flex-wrap justify-center"
          >
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta">
                Go to Dashboard <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="btn-cta">
                  Start Free <ArrowRight className="w-5 h-5" />
                </button>
              </SignInButton>
            )}
            <button
              className="btn-outline"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              How we work <PlayCircle className="w-5 h-5" />
            </button>
          </motion.div>

          {/* Hero image card */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="w-full mt-4 relative overflow-hidden"
            style={{ borderRadius: '28px', aspectRatio: '2.4 / 1' }}
          >
            <img
              src={CARD_IMAGES.hero}
              alt="Soul Signature"
              className="absolute inset-0 w-full h-full object-cover"
              fetchPriority="high"
            />
          </motion.div>
        </div>
      </section>

      {/* ────────────── WHO WE ARE + STATS ────────────── */}
      <section className="px-6 lg:px-16 py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto">
          {/* Header row */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 mb-12">
            <div className="lg:w-1/2">
              <span className="claura-label mb-5 block">Who we are</span>
              <h2 className="heading-serif text-[clamp(2rem,4vw,3.2rem)]">
                The soul signature built for <span className="heading-serif-italic">you.</span>
              </h2>
            </div>
            <div className="lg:w-1/2 flex items-end">
              <p className="text-[16px] lg:text-[17px] text-[#8A857D] leading-[1.65] max-w-[520px]">
                We built Twin Me to go beyond your public persona. We listen to your private data patterns, discover what makes you unique, and build a digital twin that truly knows you.
              </p>
            </div>
          </div>

          {/* Stats card with nature bg + glass stat boxes */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            viewport={{ once: true, amount: 0.3 }}
            className="relative overflow-hidden w-full"
            style={{ borderRadius: '28px', minHeight: '380px' }}
          >
            {/* Background image */}
            <img
              src={CARD_IMAGES.stats}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Dark overlay for legibility */}
            <div className="absolute inset-0" style={{ background: 'rgba(15, 60, 50, 0.65)' }} />

            {/* Glass stat boxes */}
            <div className="relative z-10 p-8 lg:p-12 grid grid-cols-1 md:grid-cols-3 gap-4 items-end h-full" style={{ minHeight: '380px' }}>
              {[
                { value: '5+', label: 'Platform integrations', sub: 'And growing' },
                { value: '1,536d', label: 'Vector embeddings', sub: 'Per memory' },
                { value: '< 60s', label: 'Time to first insight', sub: 'After connecting' },
              ].map((stat, i) => (
                <div key={i} className="glass-stat">
                  <h3 className="heading-serif text-[clamp(2rem,3vw,3rem)] text-white mb-1">{stat.value}</h3>
                  <p className="text-[14px] text-white/80 font-medium">{stat.label}</p>
                  <p className="text-[12px] text-white/60 mt-1">{stat.sub}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ────────────── SERVICES — Interactive Tab + Flower Card ────────────── */}
      <section id="services" className="px-6 lg:px-16 py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <span className="claura-label mb-5 block">Services</span>
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-16">
              <h2 className="heading-serif text-[clamp(2rem,4vw,3.2rem)] lg:max-w-[520px]">
                We handle everything so you don't have to.
              </h2>
              <p className="text-[16px] text-[#8A857D] leading-[1.65] max-w-[480px] lg:pt-2">
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
                  <h3 className={`heading-serif text-[clamp(2rem,3.5vw,3rem)] transition-colors duration-300 ${
                    idx === activeService ? 'text-[#1F1C18]' : 'text-[#D5D0C8]'
                  }`}>
                    {svc.title}
                  </h3>
                  <span className={`text-[14px] font-medium transition-colors duration-300 ${
                    idx === activeService ? 'text-[#8A857D]' : 'text-[#D5D0C8]'
                  }`}>
                    {svc.num}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: Flower card + description */}
            <div className="lg:w-[55%]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeService}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4 }}
                >
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
                  <h4 className="text-[18px] font-bold text-[#1F1C18] mb-2">
                    {SERVICES[activeService].heading}
                  </h4>
                  <p className="text-[15px] text-[#8A857D] leading-[1.6] max-w-[480px]">
                    {SERVICES[activeService].desc}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────── HOW WE WORK — 3 Steps ────────────── */}
      <section id="how-it-works" className="px-6 lg:px-16 py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-12 lg:gap-20">
          {/* Left: heading + CTA */}
          <div className="lg:w-[45%]">
            <span className="claura-label mb-5 block">How we work</span>
            <h2 className="heading-serif text-[clamp(2rem,4vw,3.2rem)] mb-5">
              Getting you results <span className="heading-serif-italic">without</span> the complexity.
            </h2>
            <p className="text-[16px] text-[#8A857D] leading-[1.65] mb-8 max-w-[440px]">
              Our three-step process takes you from connecting platforms to discovering your soul signature, with clear progress and insights at every stage.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {isLoaded && isSignedIn ? (
                <button onClick={() => navigate('/dashboard')} className="btn-cta !text-[15px]">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="btn-cta !text-[15px]">
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
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                viewport={{ once: true, amount: 0.5 }}
                className="flex gap-5"
              >
                <div className="step-circle">{step.num}</div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-[17px] font-bold text-[#1F1C18]">{step.title}</h4>
                    <span className="step-badge">{step.badge}</span>
                  </div>
                  <p className="text-[15px] text-[#8A857D] leading-[1.6] max-w-[420px]">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── FINAL CTA ────────────── */}
      <section className="px-6 lg:px-16 py-20 lg:py-28">
        <div className="max-w-[1072px] mx-auto text-center flex flex-col items-center gap-8">
          {/* Stars */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-0.5 text-[#C4A265]">
              {[...Array(5)].map((_, i) => (
                <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              ))}
            </div>
            <p className="text-[14px] text-[#8A857D] font-medium">Discover your authentic self</p>
          </div>

          <h2 className="heading-serif text-[clamp(2.2rem,5vw,4rem)]">
            Turn confusion into <span className="heading-serif-italic">clarity,</span> today.
          </h2>

          <p className="text-[17px] text-[#8A857D] max-w-[520px] leading-[1.6]">
            Start free and discover patterns about yourself you never noticed. Your soul signature is waiting.
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta">
                Go to Dashboard <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="btn-cta">
                  Start Free <ArrowRight className="w-5 h-5" />
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </section>

      {/* ────────────── FOOTER ────────────── */}
      <footer className="px-6 lg:px-16 pb-10 pt-12 border-t border-[#E8E3DC]">
        <div className="max-w-[1200px] mx-auto">
          {/* Top row — 3 columns */}
          <div className="flex flex-col lg:flex-row justify-between gap-10 mb-10">
            {/* Brand */}
            <div className="lg:max-w-[220px]">
              <h3 className="heading-serif text-[22px] font-bold mb-2">Twin Me</h3>
              <p className="text-[14px] text-[#8A857D] leading-relaxed">
                Discover what makes you authentically you.
              </p>
            </div>

            {/* Product links */}
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#8A857D] font-semibold mb-4">
                Product
              </p>
              <ul className="space-y-2.5 text-[14px]">
                <li>
                  <a href="/#features" className="text-[#57534E] hover:text-[#1F1C18] transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="/#how-it-works"
                    className="text-[#57534E] hover:text-[#1F1C18] transition-colors"
                  >
                    How it works
                  </a>
                </li>
                <li>
                  <a href="/get-started" className="text-[#57534E] hover:text-[#1F1C18] transition-colors">
                    Connect your data
                  </a>
                </li>
                <li>
                  <a
                    href="/soul-signature"
                    className="text-[#57534E] hover:text-[#1F1C18] transition-colors"
                  >
                    Soul Signature
                  </a>
                </li>
              </ul>
            </div>

            {/* Community */}
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#8A857D] font-semibold mb-4">
                Community
              </p>
              <ul className="space-y-2.5 text-[14px]">
                <li>
                  <a
                    href="https://github.com/twinme-ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#57534E] hover:text-[#1F1C18] transition-colors"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://twitter.com/twinme_ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#57534E] hover:text-[#1F1C18] transition-colors"
                  >
                    Twitter / X
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:hello@twinme.ai"
                    className="text-[#57534E] hover:text-[#1F1C18] transition-colors"
                  >
                    Contact us
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 text-[13px] text-[#8A857D] border-t border-[#E8E3DC] pt-6">
            <p>&copy; 2026 Twin Me. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="/privacy-policy" className="hover:text-[#1F1C18] transition-colors">
                Privacy Policy
              </a>
              <a href="/terms" className="hover:text-[#1F1C18] transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
