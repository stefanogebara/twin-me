import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import {
  SpotifyLogo,
  GoogleCalendarLogo,
  WhoopLogo,
  YoutubeLogo,
  TwitchLogo,
} from '../components/PlatformLogos';

const FOREST_BG = '/images/backgrounds/rainforest.jpg';
const OCEAN_BG = '/images/backgrounds/ocean.jpg';
const DESERT_BG = '/images/backgrounds/desert.jpg';
const MOUNTAIN_BG = '/images/backgrounds/mountain.jpg';

const Index = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/dashboard');
    }
  }, [isLoaded, isSignedIn, navigate]);

  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
  };

  return (
    <div className="h-screen w-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory relative landing-root font-sans bg-[#F7F7F3] text-[#1F1C18]">
      <style>{`
        .landing-root::-webkit-scrollbar { display: none; }
        .landing-root {
          -ms-overflow-style: none;
          scrollbar-width: none;
          scroll-behavior: smooth;
        }

        .heading-serif {
          font-family: 'Playfair Display', serif;
          letter-spacing: -0.03em;
          line-height: 1.05;
        }
        .heading-serif-italic {
          font-family: 'Playfair Display', serif;
          font-style: italic;
          color: #8A857D;
          letter-spacing: -0.04em;
        }

        .slide-section {
          height: 100vh;
          width: 100%;
          flex-shrink: 0;
          scroll-snap-align: start;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
          z-index: 10;
          contain: layout style paint;
          will-change: transform;
        }

        .slide-glass-card {
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.45);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6);
          border-radius: 2.5rem;
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
        }

        .photo-glass-card {
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.45);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.5);
          border-radius: 2rem;
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
        }

        /* CTA button — warm dark, matches palette */
        .btn-cta {
          background-color: #2D2722;
          color: #F7F7F3;
          border-radius: 9999px;
          padding: 16px 36px;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 20px rgba(45, 39, 34, 0.25);
          letter-spacing: -0.01em;
        }
        .btn-cta:hover {
          background-color: #1F1C18;
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(45, 39, 34, 0.35);
        }
        .btn-cta:active { transform: translateY(0); }

        .btn-solid {
          background-color: #2D2722;
          color: #F7F7F3;
          border-radius: 9999px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-solid:hover { background-color: #1F1C18; transform: translateY(-1px); }

        .btn-light {
          background-color: rgba(255, 255, 255, 0.6);
          color: #2D2722;
          border-radius: 9999px;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
        }
        .btn-light:hover { background-color: rgba(255, 255, 255, 0.8); transform: translateY(-1px); }

        /* Aurora gradient animation */
        @keyframes aurora-drift {
          0%   { transform: translate(0%, 0%) rotate(0deg) scale(1); }
          33%  { transform: translate(3%, -4%) rotate(60deg) scale(1.05); }
          66%  { transform: translate(-3%, 2%) rotate(120deg) scale(0.97); }
          100% { transform: translate(0%, 0%) rotate(180deg) scale(1); }
        }
        @keyframes aurora-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.75; }
        }
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          animation: aurora-drift 18s ease-in-out infinite, aurora-pulse 6s ease-in-out infinite;
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-blob { animation: none; }
        }

        .platform-card {
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .platform-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.12);
        }
      `}</style>

      {/* ── Simplified Nav: Logo | Sign In + Start Free ── */}
      <div className="absolute top-6 left-0 right-0 z-50 px-4 md:px-8 flex justify-center mt-2">
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="w-full max-w-[1200px] flex items-center justify-between bg-[#FCFAF8] border border-[#EBE9E0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-[32px] px-6 py-3"
        >
          <div
            className="heading-serif text-[26px] cursor-pointer font-medium text-[#1F1C18]"
            onClick={() => navigate('/')}
          >
            Twin Me
          </div>

          <div className="flex items-center gap-3">
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta !py-3 !px-7 !text-[14px] !rounded-[24px]">
                Dashboard
              </button>
            ) : (
              <>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="btn-solid !py-3 !px-6 !text-[14px] !rounded-[24px]">
                    Sign In
                  </button>
                </SignInButton>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button className="btn-cta !py-3 !px-7 !text-[14px] !rounded-[24px]">
                    Start Free <ArrowRight className="w-4 h-4" />
                  </button>
                </SignInButton>
              </>
            )}
          </div>
        </motion.nav>
      </div>

      {/* ── Slide 1: Hero with Aurora Background ── */}
      <section id="about" className="slide-section px-8 lg:px-[120px] relative overflow-hidden">
        {/* Warm ambient blobs */}
        <div
          className="aurora-blob"
          style={{
            width: '520px', height: '520px',
            background: 'radial-gradient(circle, rgba(200,180,150,0.15) 0%, rgba(180,160,130,0.08) 60%, transparent 100%)',
            top: '-80px', right: '-100px',
            animationDelay: '0s',
          }}
        />
        <div
          className="aurora-blob"
          style={{
            width: '380px', height: '380px',
            background: 'radial-gradient(circle, rgba(160,140,120,0.12) 0%, rgba(140,130,110,0.06) 60%, transparent 100%)',
            bottom: '60px', left: '-80px',
            animationDelay: '-6s',
            animationDuration: '22s',
          }}
        />
        <div
          className="aurora-blob"
          style={{
            width: '260px', height: '260px',
            background: 'radial-gradient(circle, rgba(210,190,160,0.10) 0%, transparent 70%)',
            top: '30%', right: '30%',
            animationDelay: '-12s',
            animationDuration: '28s',
          }}
        />

        <div className="max-w-[1200px] mx-auto w-full flex flex-col lg:flex-row items-center gap-12 relative z-10 pt-20">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            className="max-w-[600px]"
          >
            <motion.div variants={fadeUp} className="mb-6">
              <span className="bg-[#EBE9E0]/80 text-[#5C5851] rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium tracking-wide">
                AI-powered Discovery
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-[clamp(3.5rem,6.5vw,7rem)] mb-6 leading-[0.95] text-[#918F85]"
            >
              <div className="heading-serif">Authentic</div>
              <div className="heading-serif">
                identity, <span className="heading-serif-italic">real</span>
              </div>
              <div className="heading-serif text-[#1F1C18]">discovery.</div>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-[17px] lg:text-[19px] leading-[1.5] text-[#1F1C18] max-w-[420px] mb-10 font-medium"
            >
              See how discovering your private patterns across music, wellness, and schedule reveals your true digital soul signature.
            </motion.p>

            <motion.div variants={fadeUp} className="flex items-center gap-4 flex-wrap">
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
                className="bg-[#FCFAF8]/80 text-[#1F1C18] border border-[#EBE9E0] rounded-[32px] py-4 px-6 text-[15px] font-medium transition-colors hover:bg-[#EBE9E0] flex items-center shadow-sm"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                How we work <PlayCircle className="w-5 h-5 ml-2 text-[#5C5851]" />
              </button>
            </motion.div>
          </motion.div>

          {/* Hero visual: flower image */}
          <motion.div
            className="hidden lg:flex flex-1 items-center justify-center relative"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            <img
              src="/images/backgrounds/flower-hero.png"
              alt="Soul Signature"
              className="w-[480px] h-auto object-contain"
            />
          </motion.div>
        </div>
      </section>

      {/* ── Slide 2: Philosophy Quote — MOUNTAIN BACKGROUND ── */}
      <section className="slide-section relative px-8 lg:px-[80px]">
        <img
          src={MOUNTAIN_BG}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0, objectPosition: 'center 30%' }}
        />
        <div className="absolute inset-0 bg-black/40" style={{ zIndex: 1 }} />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          className="max-w-[1000px] mx-auto text-center relative z-10"
        >
          <div className="slide-glass-card p-10 lg:p-16">
            <motion.h2 variants={fadeUp} className="text-[clamp(1.8rem,3.5vw,3rem)] mb-8 text-white leading-tight">
              <span className="heading-serif-italic">"Perhaps we are searching in the branches for what we only find in the roots."</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[16px] lg:text-[18px] leading-[1.7] text-white/80 max-w-[680px] mx-auto">
              Public information is easy to clone, but it lacks soul. We go beyond your resume and public persona to discover what makes you authentically YOU through your private choices, curiosities, and patterns.
            </motion.p>
          </div>
        </motion.div>
      </section>

      {/* ── Slide 3: Ecosystem — OCEAN BACKGROUND with SVG platform icons ── */}
      <section id="platform" className="slide-section relative">
        <img
          src={OCEAN_BG}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0 }}
        />
        <div className="absolute inset-0 bg-black/25" style={{ zIndex: 1 }} />

        <div className="relative z-10 px-8 lg:px-[80px]">
          <div className="max-w-[1200px] mx-auto w-full flex flex-col lg:flex-row gap-12 items-center">
            <div className="lg:w-1/2">
              <h2 className="heading-serif text-[clamp(2.2rem,3.5vw,3.2rem)] mb-5 text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                Connect deeply, <br />
                <span className="heading-serif-italic !text-white/80">live simply.</span>
              </h2>
              <p className="text-[17px] text-white/90 max-w-[400px] leading-relaxed mb-7" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                Link your digital environment with effortless, secure integrations. You maintain total control over your data boundaries while Twin Me securely processes your unique signature.
              </p>
              <button className="btn-light">
                View Privacy Standards
              </button>
            </div>

            {/* Platform cards with real SVG icons */}
            <div className="lg:w-1/2 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { Icon: SpotifyLogo,          iconColor: '#1DB954', iconBg: 'rgba(29,185,84,0.15)',   title: 'Spotify',          desc: 'Acoustic patterns & vibes' },
                  { Icon: GoogleCalendarLogo,    iconColor: '#4285F4', iconBg: 'rgba(66,133,244,0.12)',  title: 'Google Calendar',  desc: 'Time & priority rhythms' },
                  { Icon: WhoopLogo,             iconColor: '#00c9b1', iconBg: 'rgba(0,201,177,0.12)',   title: 'Whoop',            desc: 'Energy & recovery states' },
                  { Icon: YoutubeLogo,           iconColor: '#FF0000', iconBg: 'rgba(255,0,0,0.12)',     title: 'YouTube',          desc: 'Curiosity & learning' },
                  { Icon: TwitchLogo,            iconColor: '#9146FF', iconBg: 'rgba(145,70,255,0.12)', title: 'Twitch',           desc: 'Gaming identity & streams' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="photo-glass-card platform-card p-4 flex items-center gap-3 cursor-default"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: item.iconBg, border: `1.5px solid ${item.iconColor}40`, color: item.iconColor }}
                      aria-hidden="true"
                    >
                      <item.Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-semibold text-white mb-0.5">{item.title}</h4>
                      <p className="text-[13px] text-white/70">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 right-8 z-10 opacity-50">
          <img src="/icons/3d/sparkle.png" alt="" className="w-8 h-8 drop-shadow-md" />
        </div>
      </section>

      {/* ── Slide 4: Features — RAINFOREST BACKGROUND ── */}
      <section id="features" className="slide-section relative">
        <img
          src={FOREST_BG}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0 }}
        />
        <div className="absolute inset-0 bg-black/20" style={{ zIndex: 1 }} />

        <div className="relative z-10 px-8 lg:px-[80px]">
          <div className="max-w-[1200px] mx-auto w-full">
            <div className="grid md:grid-cols-3 gap-6 items-start">
              {[
                { step: '01', title: 'Connect', desc: 'Securely link your core platforms and data sources effortlessly.' },
                { step: '02', title: 'Discover', desc: 'Unearth beautiful insights and invisible patterns in your daily life.' },
                { step: '03', title: 'Control',  desc: 'Selectively share and protect your digital essence with ease.' },
              ].map((item, idx) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: idx * 0.15 }}
                  viewport={{ once: true, amount: 0.5 }}
                  className="photo-glass-card p-8 lg:p-10 transition-transform duration-500 hover:-translate-y-2"
                  style={{ marginTop: idx === 1 ? '32px' : idx === 2 ? '64px' : '0' }}
                >
                  <div className="text-[13px] font-bold text-white/50 mb-5 tracking-widest">{item.step}</div>
                  <h3 className="heading-serif text-[28px] mb-3 text-white">{item.title}</h3>
                  <p className="text-[15px] leading-[1.6] text-white/75">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 right-8 z-10 opacity-50">
          <img src="/icons/3d/sparkle.png" alt="" className="w-8 h-8 drop-shadow-md" />
        </div>
      </section>

      {/* ── Slide 5: Final CTA ── */}
      <section id="security" className="slide-section relative flex flex-col justify-between w-full">
        <img
          src={DESERT_BG}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0, objectPosition: 'center 60%' }}
        />
        <div className="absolute inset-0" style={{
          zIndex: 1,
          background: 'linear-gradient(180deg, rgba(245,245,240,0.1) 0%, rgba(245,245,240,0.5) 60%, rgba(245,245,240,0.85) 100%)',
        }} />

        <div className="relative z-10 flex-grow flex flex-col items-center justify-center gap-8 pt-20">
          <motion.h2
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-[clamp(2.5rem,5vw,5rem)] text-center leading-[1.05] max-w-[900px] px-8 text-[#1F1C18]"
          >
            <div className="heading-serif">Ready to discover your</div>
            <div className="heading-serif-italic">soul signature?</div>
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            viewport={{ once: true }}
          >
            {isLoaded && isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="btn-cta">
                Go to Dashboard <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                <button className="btn-cta">
                  Start Free — It's Free <ArrowRight className="w-5 h-5" />
                </button>
              </SignInButton>
            )}
          </motion.div>
        </div>

        <footer className="relative z-10 w-full px-8 lg:px-[120px] pb-8 pt-4">
          <div className="w-full h-[1px] bg-black/10 mb-5" />
          <div className="flex items-center justify-between text-[#8A857D] text-[13px] font-medium tracking-wide">
            <div className="heading-serif text-[18px] text-[#1F1C18]">Twin Me</div>
            <div className="flex items-center gap-8">
              <a href="/privacy-policy" className="hover:text-[#1F1C18] transition-colors">Privacy</a>
              <a href="https://github.com/twinme-ai" target="_blank" rel="noopener noreferrer" className="hover:text-[#1F1C18] transition-colors">GitHub</a>
              <a href="mailto:hello@twinme.ai" className="hover:text-[#1F1C18] transition-colors">Contact</a>
            </div>
          </div>
        </footer>

        <div className="absolute bottom-8 right-8 z-10 opacity-40">
          <img src="/icons/3d/sparkle.png" alt="" className="w-8 h-8 drop-shadow-md" />
        </div>
      </section>
    </div>
  );
};

export default Index;
