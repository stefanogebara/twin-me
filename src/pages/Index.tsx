import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDemo } from '../contexts/DemoContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { X } from 'lucide-react';
import { SpotifyLogo, GoogleCalendarLogo, WhoopLogo, YoutubeLogo, TwitchLogo, LinkedinLogo } from '@/components/PlatformLogos';

const Index = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();
  const { theme } = useTheme();
  const { enterDemoMode } = useDemo();
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Refs for scroll sections
  const featuresRef = useRef<HTMLElement>(null);
  const howItWorksRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);

  const handleTryDemo = () => {
    enterDemoMode();
    navigate('/dashboard');
  };

  // Navigation scroll handlers
  const handleNavClick = (item: string) => {
    switch (item) {
      case 'Product':
        featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'Solutions':
        howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'Company':
      case 'FAQ':
        setActiveModal(item);
        break;
    }
  };

  // Footer link handlers
  const handleFooterClick = (link: string) => {
    setActiveModal(link);
  };

  // Redirect logged-in users to dashboard
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/dashboard');
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA',
        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
      }}
    >
      {/* Aurora animation keyframes */}
      <style>{`
        @keyframes aurora {
          0% { background-position: 0% 50%, 50% 50%; }
          25% { background-position: 100% 50%, 0% 50%; }
          50% { background-position: 50% 100%, 100% 0%; }
          75% { background-position: 0% 0%, 50% 100%; }
          100% { background-position: 0% 50%, 50% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
        .aurora-bg {
          background:
            radial-gradient(ellipse 80% 60% at 30% 40%, rgba(16, 185, 129, 0.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 70% 60%, rgba(139, 92, 246, 0.12) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 50% 30%, rgba(20, 184, 166, 0.1) 0%, transparent 50%);
          background-size: 200% 200%, 200% 200%;
          animation: aurora 12s ease-in-out infinite;
        }
        .aurora-bg-light {
          background:
            radial-gradient(ellipse 80% 60% at 30% 40%, rgba(16, 185, 129, 0.1) 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 70% 60%, rgba(139, 92, 246, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 50% 30%, rgba(20, 184, 166, 0.06) 0%, transparent 50%);
          background-size: 200% 200%, 200% 200%;
          animation: aurora 12s ease-in-out infinite;
        }
        .cta-gradient {
          background: linear-gradient(135deg, #10b981, #14b8a6, #0d9488);
          background-size: 200% 200%;
          transition: all 0.3s ease;
        }
        .cta-gradient:hover {
          transform: scale(1.05);
          box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
          background-position: 100% 100%;
        }
      `}</style>
      {/* Navigation */}
      <nav
        className="fixed top-0 w-full z-50 px-6 lg:px-[60px] py-4"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(35, 35, 32, 0.8)' : 'rgba(250, 250, 250, 0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
        }}
      >
        <div className="max-w-[1200px] mx-auto flex justify-between items-center">
          <div
            className="flex items-center gap-2.5"
          >
            <img src="/icons/3d/diamond.png" alt="Twin Me" className="w-8 h-8 object-contain drop-shadow-sm" />
            <span
              className="text-[24px]"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}
            >
              Twin Me
            </span>
          </div>

          {/* Nav Links - Smooth scroll anchors */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { label: 'Platforms', href: '#platforms' },
              { label: 'How It Works', href: '#how-it-works' },
              { label: 'Company', action: 'Company' },
              { label: 'FAQ', action: 'FAQ' }
            ].map((item) => (
              item.href ? (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    document.querySelector(item.href!)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded-full text-[14px] font-medium transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)',
                    textDecoration: 'none'
                  }}
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  onClick={() => setActiveModal(item.action!)}
                  className="px-4 py-2 rounded-full text-[14px] font-medium transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  {item.label}
                </button>
              )
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isLoaded && isSignedIn ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#ffffff'
                }}
              >
                Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={handleTryDemo}
                  className="px-5 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                  style={{
                    backgroundColor: 'transparent',
                    color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                    border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`
                  }}
                >
                  Try Demo
                </button>
                <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                  <button
                    className="px-5 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                    style={{
                      backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                      color: theme === 'dark' ? '#232320' : '#ffffff'
                    }}
                  >
                    Sign In
                  </button>
                </SignInButton>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center relative pt-[100px] pb-12 px-6 lg:px-[60px]">
        {/* Animated Aurora Background */}
        <div
          className={`absolute inset-0 pointer-events-none ${theme === 'dark' ? 'aurora-bg' : 'aurora-bg-light'}`}
        />

        <div className="max-w-[1200px] mx-auto w-full">
          <div className="max-w-[600px] mx-auto">
            {/* Hero Content - Centered */}
            <div className="text-center">
              {/* Badge Pill */}
              <div className="inline-flex mb-8">
                <span
                  className="px-4 py-2 rounded-full text-[13px] font-medium"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.04)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  Twin Me for you
                </span>
              </div>

              {/* Headline */}
              <h1
                className="text-[clamp(2.5rem,5vw,4rem)] leading-[1.1] mb-6"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  letterSpacing: '-0.02em',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                Discover your<br />
                soul signature
              </h1>

              {/* Subtext */}
              <p
                className="text-[16px] lg:text-[17px] max-w-[500px] mx-auto mb-10 leading-[1.7]"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
                }}
              >
                AI-powered discovery reveals your authentic digital identity through your curiosities, passions, and unique patterns.
              </p>

              {/* CTA Button - Gradient */}
              <div className="flex justify-center">
                {isLoaded && isSignedIn ? (
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="cta-gradient px-8 py-4 rounded-full text-lg font-semibold text-white shadow-lg"
                  >
                    Start Free
                  </button>
                ) : (
                  <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
                    <button
                      className="cta-gradient px-8 py-4 rounded-full text-lg font-semibold text-white shadow-lg"
                    >
                      Start Free
                    </button>
                  </SignInButton>
                )}
              </div>
            </div>
          </div>

          {/* Feature Tagline */}
          <div className="mt-14 lg:mt-20">
            <h2
              className="text-[clamp(1.5rem,3vw,2rem)] mb-4"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}
            >
              The AI architecture for<br />
              authentic identity
            </h2>
            <p
              className="text-[15px] max-w-[400px]"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
              }}
            >
              Twin Me discovers, personalizes, and protects your digital soul signature.
            </p>
          </div>
        </div>
      </section>

      {/* Trusted Platforms Section */}
      <section ref={featuresRef} id="platforms" className="py-10 px-6 lg:px-[60px]">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col items-center">
            <span
              className="px-4 py-2 rounded-full text-[12px] font-medium mb-8"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
                fontFamily: 'var(--font-body)'
              }}
            >
              Our Trusted Platforms
            </span>

            <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-14">
              {[
                { name: 'Spotify', color: '#1DB954', Logo: SpotifyLogo },
                { name: 'Google Calendar', color: '#4285F4', Logo: GoogleCalendarLogo },
                { name: 'Whoop', color: '#06B6D4', Logo: WhoopLogo },
                { name: 'YouTube', color: '#FF0000', Logo: YoutubeLogo },
                { name: 'Twitch', color: '#9146FF', Logo: TwitchLogo },
                { name: 'LinkedIn', color: '#0A66C2', Logo: LinkedinLogo }
              ].map((platform) => (
                  <div
                    key={platform.name}
                    className="flex items-center gap-3 group"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{
                        backgroundColor: `${platform.color}18`,
                      }}
                    >
                      <platform.Logo
                        className="w-[18px] h-[18px]"
                      />
                    </div>
                    <span
                      className="text-[14px] font-medium"
                      style={{
                        fontFamily: 'var(--font-body)',
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c'
                      }}
                    >
                      {platform.name}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="py-14 px-6 lg:px-[60px]">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col items-center mb-10">
            <span
              className="px-4 py-2 rounded-full text-[12px] font-medium"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
                fontFamily: 'var(--font-body)'
              }}
            >
              The Problem
            </span>
          </div>

          <div className="text-center max-w-[700px] mx-auto">
            <h2
              className="text-[clamp(1.75rem,4vw,2.5rem)] mb-6"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                fontStyle: 'italic',
                letterSpacing: '-0.02em',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}
            >
              "Perhaps we are searching in the branches for what we only find in the roots."
            </h2>
            <p
              className="text-[16px] leading-[1.7] mb-8"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
              }}
            >
              Public information is easy to clone, but it lacks soul. We go beyond your resume and public persona to discover what makes you authentically YOU through your private choices, curiosities, and patterns.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} id="how-it-works" className="py-14 px-6 lg:px-[60px]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                step: '01',
                title: 'Connect',
                desc: 'Link your platforms - Spotify, Calendar, Whoop, YouTube, and more',
                clay3d: 'globe',
                iconColor: '#10b981'
              },
              {
                step: '02',
                title: 'Discover',
                desc: 'AI reveals patterns and insights you didn\'t know about yourself',
                clay3d: 'sparkle',
                iconColor: '#8b5cf6'
              },
              {
                step: '03',
                title: 'Control',
                desc: 'Set privacy levels for each life cluster - share what you want',
                clay3d: 'shield',
                iconColor: '#14b8a6'
              }
            ].map((item) => {
              return (
                <div
                  key={item.step}
                  className="text-center md:text-left rounded-2xl p-6 transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`
                  }}
                >
                  <div className="flex items-center gap-3 mb-4 justify-center md:justify-start">
                    <img
                      src={`/icons/3d/${item.clay3d}.png`}
                      alt={item.title}
                      className="w-12 h-12 object-contain drop-shadow-md"
                    />
                    <span
                      className="text-[36px] lg:text-[48px] font-light"
                      style={{
                        fontFamily: 'var(--font-heading)',
                        color: theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.06)'
                      }}
                    >
                      {item.step}
                    </span>
                  </div>
                  <h3
                    className="text-[20px] mb-3"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 400,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6]"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="cta" className="py-16 px-6 lg:px-[60px]">
        <div className="max-w-[600px] mx-auto text-center">
          <img src="/icons/3d/rocket.png" alt="" className="w-16 h-16 mx-auto mb-6 drop-shadow-lg" />
          <h2
            className="text-[clamp(1.75rem,4vw,2.5rem)] mb-5"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
          >
            Ready to discover your soul signature?
          </h2>
          <p
            className="text-[16px] mb-8"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
            }}
          >
            Start creating an authentic digital twin that captures your true originality
          </p>
          {isSignedIn ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="cta-gradient px-8 py-4 rounded-full text-lg font-semibold text-white shadow-lg"
            >
              Get Started Today
            </button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/discover" forceRedirectUrl="/discover">
              <button
                className="cta-gradient px-8 py-4 rounded-full text-lg font-semibold text-white shadow-lg"
              >
                Get Started Today
              </button>
            </SignInButton>
          )}
        </div>
      </section>

      {/* Info Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setActiveModal(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl p-8"
            style={{
              backgroundColor: theme === 'dark' ? '#2d2d29' : '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 rounded-full transition-colors hover:opacity-70"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
              }}
            >
              <X className="w-4 h-4" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
            </button>

            <h3
              className="text-2xl mb-4"
              style={{
                fontFamily: 'var(--font-heading)',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}
            >
              {activeModal}
            </h3>

            <div
              className="text-[15px] leading-[1.7]"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
              }}
            >
              {activeModal === 'Company' && (
                <div className="space-y-4">
                  <p>Twin Me is building the future of authentic digital identity. While public information is easy to clone and lacks soul, we go deeper—discovering what makes you authentically YOU through your digital footprints.</p>
                  <p><strong style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>Our Mission:</strong> Help people discover, understand, and share their authentic selves through AI-powered pattern recognition across their digital lives.</p>
                  <p><strong style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>What We Believe:</strong> Your curiosities, passions, and daily choices reveal more about who you are than any resume or social profile ever could.</p>
                  <p><strong style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>Privacy First:</strong> You decide what to reveal and what to keep private. Your soul signature is yours to control.</p>
                </div>
              )}
              {activeModal === 'FAQ' && (
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>How does Twin Me work?</p>
                    <p>We connect to platforms you use daily—Spotify, Google Calendar, Whoop, and more—to discover patterns in your music taste, schedule, and wellness. Our AI then reveals insights about your authentic personality.</p>
                  </div>
                  <div>
                    <p className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>Is my data secure?</p>
                    <p>Absolutely. All data is encrypted in transit and at rest. We use OAuth for secure connections and never store your platform passwords. You can disconnect any platform instantly.</p>
                  </div>
                  <div>
                    <p className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>What platforms can I connect?</p>
                    <p>Currently we support Spotify for music insights, Google Calendar for schedule patterns, and Whoop for wellness data. More platforms coming soon!</p>
                  </div>
                  <div>
                    <p className="font-medium mb-1" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>Can I try before connecting accounts?</p>
                    <p>Yes! We offer a demo mode so you can explore the full experience with sample data before connecting your own accounts.</p>
                  </div>
                </div>
              )}
              {activeModal === 'Privacy' && (
                <p>Your privacy is our priority. We never sell your data and you maintain full control over what information you share. All connections are encrypted and you can disconnect any platform at any time.</p>
              )}
              {activeModal === 'Terms' && (
                <p>By using Twin Me, you agree to our terms of service. We provide our service as-is and are committed to protecting your data while helping you discover your authentic digital identity.</p>
              )}
              {activeModal === 'Contact' && (
                <div>
                  <p className="mb-4">Have questions? We'd love to hear from you.</p>
                  <p className="font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>Email: hello@twinme.ai</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="mt-6 w-full py-3 rounded-xl text-[14px] font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                color: theme === 'dark' ? '#232320' : '#ffffff',
                fontFamily: 'var(--font-ui)'
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 lg:px-[60px] border-t" style={{
        borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
      }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/icons/3d/diamond.png" alt="" className="w-5 h-5 object-contain opacity-60" />
              <span
                className="text-[14px]"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                }}
              >
                &copy; {new Date().getFullYear()} Twin Me. All rights reserved.
              </span>
            </div>

            <div className="flex items-center gap-6">
              {/* Legal links */}
              {[
                { label: 'Privacy', action: 'Privacy' },
                { label: 'Terms', action: 'Terms' },
                { label: 'Contact', action: 'Contact' }
              ].map((link) => (
                <a
                  key={link.label}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleFooterClick(link.action);
                  }}
                  className="text-[14px] hover:opacity-70 transition-opacity"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e',
                    textDecoration: 'none'
                  }}
                >
                  {link.label}
                </a>
              ))}

              {/* Social media separator */}
              <span
                className="hidden sm:block w-px h-4"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.1)'
                }}
              />

              {/* Social media placeholder links */}
              {[
                { label: 'Twitter', href: '#' },
                { label: 'GitHub', href: '#' },
                { label: 'LinkedIn', href: '#' }
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="text-[13px] hover:opacity-70 transition-opacity"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e',
                    textDecoration: 'none'
                  }}
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
