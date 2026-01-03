import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDemo } from '../contexts/DemoContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { X } from 'lucide-react';

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
            className="text-[24px]"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
          >
            Twin Me
          </div>

          {/* Nav Links - Pill Style */}
          <div className="hidden md:flex items-center gap-2">
            {['Product', 'Solutions', 'Company', 'FAQ'].map((item) => (
              <button
                key={item}
                onClick={() => handleNavClick(item)}
                className="px-4 py-2 rounded-full text-[14px] font-medium transition-colors hover:opacity-80"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  fontFamily: 'var(--font-body)'
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {!isLoaded ? (
              <button
                disabled
                className="px-5 py-2.5 rounded-full text-[14px] font-medium opacity-50"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#ffffff'
                }}
              >
                Loading...
              </button>
            ) : isSignedIn ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#ffffff'
                }}
              >
                Get a Demo
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
                <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
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

      {/* Hero Section - Lorix Style */}
      <section className="min-h-screen flex items-center justify-center relative pt-[100px] pb-20 px-6 lg:px-[60px]">
        {/* Gradient Background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: theme === 'dark'
              ? 'radial-gradient(ellipse at top, rgba(193, 192, 182, 0.08) 0%, transparent 50%)'
              : 'radial-gradient(ellipse at top, rgba(200, 180, 220, 0.15) 0%, transparent 50%)'
          }}
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

              {/* CTA Button */}
              <div className="flex justify-center">
                {!isLoaded ? (
                  <button
                    disabled
                    className="px-8 py-3.5 rounded-full text-[14px] font-medium opacity-50"
                    style={{
                      backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                      color: theme === 'dark' ? '#232320' : '#ffffff'
                    }}
                  >
                    Loading...
                  </button>
                ) : isSignedIn ? (
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-8 py-3.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                    style={{
                      backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                      color: theme === 'dark' ? '#232320' : '#ffffff'
                    }}
                  >
                    Start Free
                  </button>
                ) : (
                  <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                    <button
                      className="px-8 py-3.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                      style={{
                        backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                        color: theme === 'dark' ? '#232320' : '#ffffff'
                      }}
                    >
                      Start Free
                    </button>
                  </SignInButton>
                )}
              </div>
            </div>
          </div>

          {/* Feature Tagline */}
          <div className="mt-20 lg:mt-32">
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

      {/* Features/Product Section */}
      <section ref={featuresRef} className="py-16 px-6 lg:px-[60px]">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col items-center">
            <span
              className="px-4 py-2 rounded-full text-[12px] font-medium mb-10"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
                fontFamily: 'var(--font-body)'
              }}
            >
              Our Trusted Platforms
            </span>

            <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-12">
              {['Spotify', 'Google Calendar', 'Whoop'].map((company) => (
                <span
                  key={company}
                  className="text-[14px] font-medium"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e'
                  }}
                >
                  {company}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="py-20 px-6 lg:px-[60px]">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col items-center mb-16">
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
      <section ref={howItWorksRef} className="py-20 px-6 lg:px-[60px]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid md:grid-cols-3 gap-12 lg:gap-16">
            {[
              {
                step: '01',
                title: 'Connect',
                desc: 'Link your core platforms - Spotify, Google Calendar, and Whoop'
              },
              {
                step: '02',
                title: 'Discover',
                desc: 'AI reveals patterns and insights you didn\'t know about yourself'
              },
              {
                step: '03',
                title: 'Control',
                desc: 'Set privacy levels for each life cluster - share what you want'
              }
            ].map((item) => (
              <div key={item.step} className="text-center md:text-left">
                <span
                  className="text-[48px] lg:text-[64px] font-light"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.06)'
                  }}
                >
                  {item.step}
                </span>
                <h3
                  className="text-[20px] mb-3 -mt-4"
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
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 lg:px-[60px]">
        <div className="max-w-[600px] mx-auto text-center">
          <h2
            className="text-[clamp(1.75rem,4vw,2.5rem)] mb-6"
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
            className="text-[16px] mb-10"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
            }}
          >
            Join thousands creating authentic digital twins that capture their true originality
          </p>
          {isSignedIn ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-8 py-3.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                color: theme === 'dark' ? '#232320' : '#ffffff'
              }}
            >
              Get Started Today
            </button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button
                className="px-8 py-3.5 rounded-full text-[14px] font-medium transition-all hover:opacity-90"
                style={{
                  backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  color: theme === 'dark' ? '#232320' : '#ffffff'
                }}
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
        <div className="max-w-[1200px] mx-auto flex justify-between items-center">
          <span
            className="text-[14px]"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
            }}
          >
            {new Date().getFullYear()} Twin Me. All rights reserved.
          </span>
          <div className="flex gap-6">
            {['Privacy', 'Terms', 'Contact'].map((link) => (
              <button
                key={link}
                onClick={() => handleFooterClick(link)}
                className="text-[14px] hover:opacity-70 transition-opacity"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
                }}
              >
                {link}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
