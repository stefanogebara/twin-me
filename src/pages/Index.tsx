import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { motion } from 'framer-motion';

const FOREST_BG = 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80&auto=format';
const OCEAN_BG = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format';

// ── Inline SVG platform icons ──────────────────────────────────────────────

const SpotifyIcon = ({ className = 'w-6 h-6', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const GoogleCalendarIcon = ({ className = 'w-6 h-6', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="18" rx="2" fill="#4285F4" fillOpacity="0.15" />
    <rect x="2" y="4" width="20" height="18" rx="2" stroke="#4285F4" strokeWidth="1.5" fill="none" />
    <rect x="7" y="2" width="2" height="4" rx="1" fill="#4285F4" />
    <rect x="15" y="2" width="2" height="4" rx="1" fill="#4285F4" />
    <line x1="2" y1="10" x2="22" y2="10" stroke="#4285F4" strokeWidth="1.5" />
    <rect x="6" y="13" width="3" height="3" rx="0.5" fill="#4285F4" />
    <rect x="10.5" y="13" width="3" height="3" rx="0.5" fill="#4285F4" />
    <rect x="15" y="13" width="3" height="3" rx="0.5" fill="#4285F4" />
  </svg>
);

const WhoopIcon = ({ className = 'w-6 h-6', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 1332 999" fill="#00c9b1">
    <path d="m969.3 804.3l-129.4-426.3h-118.7l189.2 620.8h117.8l303.7-998h-118.7zm-851.3-803.5h-117.9l188.4 620.7h118.6zm488.6 0l-302.8 997.9h117.8l303.7-997.9z" />
  </svg>
);

const YouTubeIcon = ({ className = 'w-6 h-6', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const TwitchIcon = ({ className = 'w-6 h-6', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
  </svg>
);

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
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');

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
        }

        .slide-glass-card {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 1);
          border-radius: 2.5rem;
        }

        .photo-glass-card {
          background: rgba(255, 255, 255, 0.55);
          backdrop-filter: blur(50px) saturate(1.4);
          -webkit-backdrop-filter: blur(50px) saturate(1.4);
          border: 1px solid rgba(255, 255, 255, 0.7);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
          border-radius: 2rem;
        }

        /* Gradient CTA button */
        .btn-cta {
          background: linear-gradient(135deg, #7C3AED 0%, #2563EB 100%);
          color: #ffffff;
          border-radius: 9999px;
          padding: 16px 36px;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 20px rgba(124, 58, 237, 0.35);
          letter-spacing: -0.01em;
        }
        .btn-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(124, 58, 237, 0.45);
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
          backdrop-filter: blur(12px);
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
          filter: blur(80px);
          animation: aurora-drift 18s ease-in-out infinite, aurora-pulse 6s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes orb-float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-18px) scale(1.04); }
        }
        .hero-orb { animation: orb-float 7s ease-in-out infinite; }

        .platform-card {
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .platform-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.12);
        }
      `}</style>

      {/* Background base */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[#F5F5F0]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.03)_100%)]" />
      </div>

      {/* ── Simplified Nav: Logo | Sign In + Start Free ── */}
      <div className="absolute top-6 left-0 right-0 z-50 px-4 md:px-8 flex justify-center mt-2">
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="w-full max-w-[1200px] flex items-center justify-between bg-[#FCFAF8]/90 backdrop-blur-md border border-[#EBE9E0] shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-[32px] px-6 py-3"
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
        {/* Aurora blobs */}
        <div
          className="aurora-blob"
          style={{
            width: '520px', height: '520px',
            background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, rgba(37,99,235,0.12) 60%, transparent 100%)',
            top: '-80px', right: '-100px',
            animationDelay: '0s',
          }}
        />
        <div
          className="aurora-blob"
          style={{
            width: '380px', height: '380px',
            background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(37,99,235,0.08) 60%, transparent 100%)',
            bottom: '60px', left: '-80px',
            animationDelay: '-6s',
            animationDuration: '22s',
          }}
        />
        <div
          className="aurora-blob"
          style={{
            width: '260px', height: '260px',
            background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
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
              <button className="bg-[#FCFAF8]/80 text-[#1F1C18] border border-[#EBE9E0] rounded-[32px] py-4 px-6 text-[15px] font-medium transition-colors hover:bg-[#EBE9E0] flex items-center shadow-sm">
                How we work <PlayCircle className="w-5 h-5 ml-2 text-[#5C5851]" />
              </button>
            </motion.div>
          </motion.div>

          {/* Hero visual: floating glass orb with satellite platform dots */}
          <motion.div
            className="hidden lg:flex flex-1 items-center justify-center relative"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.3 }}
          >
            <div className="hero-orb relative w-[340px] h-[340px]">
              {/* Outer glow ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, rgba(124,58,237,0.3), rgba(37,99,235,0.2), rgba(16,185,129,0.25), rgba(124,58,237,0.3))',
                  filter: 'blur(2px)',
                }}
              />
              {/* Inner glass sphere */}
              <div
                className="absolute inset-6 rounded-full flex flex-col items-center justify-center"
                style={{
                  background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9) 0%, rgba(247,247,243,0.5) 50%, rgba(235,233,224,0.3) 100%)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  boxShadow: '0 20px 60px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                <div className="heading-serif text-[#1F1C18] text-[20px] mb-1 opacity-90">Soul</div>
                <div className="heading-serif-italic text-[16px] opacity-70">Signature</div>
                <div className="mt-3 flex flex-col items-center gap-1.5">
                  {[100, 70, 85, 55, 90].map((w, i) => (
                    <div
                      key={i}
                      className="h-[3px] rounded-full"
                      style={{
                        width: `${w * 0.75}px`,
                        background: `linear-gradient(90deg, rgba(124,58,237,${0.3 + i * 0.08}), rgba(37,99,235,${0.2 + i * 0.06}))`,
                        opacity: 0.7,
                      }}
                    />
                  ))}
                </div>
              </div>
              {/* Satellite platform dots */}
              {[
                { top: '6%',  left: '50%', color: '#1DB954', label: 'Spotify' },
                { top: '50%', left: '94%', color: '#4285F4', label: 'Calendar' },
                { top: '90%', left: '65%', color: '#00c9b1', label: 'Whoop' },
                { top: '76%', left: '6%',  color: '#FF0000', label: 'YouTube' },
                { top: '18%', left: '4%',  color: '#9146FF', label: 'Twitch' },
              ].map((dot, i) => (
                <div
                  key={i}
                  className="absolute w-9 h-9 rounded-full flex items-center justify-center shadow-md"
                  style={{
                    top: dot.top, left: dot.left,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: `${dot.color}22`,
                    border: `2px solid ${dot.color}55`,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dot.color }} />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Slide 2: Philosophy Quote (tighter padding) ── */}
      <section className="slide-section px-8 lg:px-[80px]">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          className="max-w-[1000px] mx-auto text-center"
        >
          <div className="slide-glass-card p-10 lg:p-16 relative overflow-hidden">
            <motion.h2 variants={fadeUp} className="text-[clamp(1.8rem,3.5vw,3rem)] mb-8 text-[#1F1C18] leading-tight">
              <span className="heading-serif-italic">"Perhaps we are searching in the branches for what we only find in the roots."</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-[16px] lg:text-[18px] leading-[1.7] text-[#5C5851] max-w-[680px] mx-auto relative z-10">
              Public information is easy to clone, but it lacks soul. We go beyond your resume and public persona to discover what makes you authentically YOU through your private choices, curiosities, and patterns.
            </motion.p>
          </div>
        </motion.div>
      </section>

      {/* ── Slide 3: Ecosystem — FOREST BACKGROUND with SVG platform icons ── */}
      <section id="platform" className="slide-section relative overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url('${FOREST_BG}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 z-[1] bg-[#F5F5F0]/30" />

        <div className="relative z-10 px-8 lg:px-[80px]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            className="max-w-[1200px] mx-auto w-full flex flex-col lg:flex-row gap-12 items-center"
          >
            <motion.div variants={fadeUp} className="lg:w-1/2">
              <h2 className="heading-serif text-[clamp(2.2rem,3.5vw,3.2rem)] mb-5 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                Connect deeply, <br />
                <span className="heading-serif-italic !text-white/80">live simply.</span>
              </h2>
              <p className="text-[17px] text-white/90 max-w-[400px] leading-relaxed mb-7 drop-shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
                Link your digital environment with effortless, secure integrations. You maintain total control over your data boundaries while Twin Me securely processes your unique signature.
              </p>
              <button className="btn-light">
                View Privacy Standards
              </button>
            </motion.div>

            {/* Platform cards with real SVG icons */}
            <motion.div variants={fadeUp} className="lg:w-1/2 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { Icon: SpotifyIcon,       iconColor: '#1DB954', iconBg: 'rgba(29,185,84,0.15)',   title: 'Spotify',          desc: 'Acoustic patterns & vibes' },
                  { Icon: GoogleCalendarIcon, iconColor: '#4285F4', iconBg: 'rgba(66,133,244,0.12)',  title: 'Google Calendar',  desc: 'Time & priority rhythms' },
                  { Icon: WhoopIcon,          iconColor: '#00c9b1', iconBg: 'rgba(0,201,177,0.12)',   title: 'Whoop',            desc: 'Energy & recovery states' },
                  { Icon: YouTubeIcon,        iconColor: '#FF0000', iconBg: 'rgba(255,0,0,0.12)',     title: 'YouTube',          desc: 'Curiosity & learning' },
                  { Icon: TwitchIcon,         iconColor: '#9146FF', iconBg: 'rgba(145,70,255,0.12)', title: 'Twitch',           desc: 'Gaming identity & streams' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="photo-glass-card platform-card p-4 flex items-center gap-3 cursor-default"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: item.iconBg, border: `1.5px solid ${item.iconColor}40` }}
                    >
                      <item.Icon className="w-5 h-5" style={{ color: item.iconColor }} />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-semibold text-[#1F1C18] mb-0.5">{item.title}</h4>
                      <p className="text-[13px] text-[#5C5851]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>

        <div className="absolute bottom-6 right-8 z-10 opacity-50">
          <img src="/icons/3d/sparkle.png" alt="" className="w-8 h-8 drop-shadow-md" />
        </div>
      </section>

      {/* ── Slide 4: Features — OCEAN BACKGROUND (tighter card padding) ── */}
      <section className="slide-section relative overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url('${OCEAN_BG}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 40%',
          }}
        />
        <div className="absolute inset-0 z-[1] bg-[#F5F5F0]/15" />

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
                  <div className="text-[13px] font-bold text-[#8A857D] mb-5 tracking-widest">{item.step}</div>
                  <h3 className="heading-serif text-[28px] mb-3 text-[#1F1C18]">{item.title}</h3>
                  <p className="text-[15px] leading-[1.6] text-[#5C5851]">{item.desc}</p>
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
      <section id="security" className="slide-section relative flex flex-col justify-between w-full overflow-hidden">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url('${OCEAN_BG}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 60%',
          }}
        />
        <div className="absolute inset-0 z-[1]" style={{
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
              <a href="#" className="hover:text-[#1F1C18] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[#1F1C18] transition-colors">Terms</a>
              <a href="#" className="hover:text-[#1F1C18] transition-colors">Contact</a>
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
