import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton, SignUpButton } from '../contexts/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { ArtemisTestimonialsSection } from '../components/ArtemisTestimonialsSection';

const Index = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();

  // Debug authentication state when component loads
  useEffect(() => {
    console.log('Index component loaded - Auth state:', { isSignedIn, isLoaded });
  }, [isSignedIn, isLoaded]);

  // Redirect logged-in users to dashboard
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      console.log('User is signed in, redirecting to dashboard...');
      navigate('/dashboard');
    }
  }, [isLoaded, isSignedIn, navigate]);

  const handleGetStartedClick = () => {
    console.log('Get Started clicked. isSignedIn:', isSignedIn, 'isLoaded:', isLoaded);
    if (!isLoaded) {
      console.log('Auth not loaded yet, waiting...');
      return; // Wait for auth to load
    }

    if (isSignedIn) {
      console.log('User is signed in, navigating to /get-started');
      navigate('/dashboard');
    } else {
      console.log('User not signed in - Clerk modal will handle sign-in');
      // Don't navigate, let Clerk handle the modal
    }
  };

  const handleCreateTwinClick = () => {
    console.log('Create Twin clicked. isSignedIn:', isSignedIn, 'isLoaded:', isLoaded);
    if (!isLoaded) {
      console.log('Auth not loaded yet, waiting...');
      return; // Wait for auth to load
    }

    if (isSignedIn) {
      console.log('User is signed in, navigating to /get-started');
      navigate('/dashboard');
    } else {
      console.log('User not signed in - Clerk modal will handle sign-in');
      // Don't navigate, let Clerk handle the modal
    }
  };

  const handleWatchDemoClick = () => {
    console.log('Watch Demo clicked. isSignedIn:', isSignedIn, 'isLoaded:', isLoaded);
    if (!isLoaded) return; // Wait for auth to load

    if (isSignedIn) {
      navigate('/watch-demo');
    } else {
      navigate('/auth');
    }
  };

  // Add smooth scrolling to anchor links
  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    // Navigation scroll effect
    const handleScroll = () => {
      const navbar = document.getElementById('navbar');
      if (window.scrollY > 50) {
        navbar?.classList.add('scrolled');
      } else {
        navbar?.classList.remove('scrolled');
      }
    };

    // Scroll reveal animations
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');

          // Add staggered animations for child elements
          const staggerElements = entry.target.querySelectorAll('.stagger-1, .stagger-2, .stagger-3, .stagger-4, .stagger-5, .stagger-6');
          staggerElements.forEach((el, index) => {
            setTimeout(() => {
              el.classList.add('animate-in');
            }, index * 100);
          });
        }
      });
    }, observerOptions);

    // Observe scroll-reveal elements
    const scrollRevealElements = document.querySelectorAll('.scroll-reveal, .animate-text-reveal, .animate-slide-in-left, .animate-scale-in');
    scrollRevealElements.forEach((el) => observer.observe(el));

    // Parallax effect for gradient blobs
    const handleParallax = () => {
      const scrolled = window.pageYOffset;
      const parallaxElements = document.querySelectorAll('.gradient-blob-orange, .gradient-blob-blue');

      parallaxElements.forEach((el, index) => {
        const speed = 0.5 + (index * 0.2);
        const element = el as HTMLElement;
        element.style.transform = `translateY(${scrolled * speed}px)`;
      });
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleParallax);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleParallax);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
      {/* Navigation */}
      <nav id="navbar" className="fixed top-0 w-full z-50 px-[60px] py-6 bg-background border-b border-border">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="text-[28px] text-foreground" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Twin Me</div>
          <ul className="flex gap-10 list-none">
            <li><a href="#features" onClick={(e) => handleAnchorClick(e, 'features')} className="text-foreground no-underline font-medium text-base hover:text-primary transition-colors cursor-pointer">Features</a></li>
            <li><a href="#works" onClick={(e) => handleAnchorClick(e, 'works')} className="text-foreground no-underline font-medium text-base hover:text-primary transition-colors cursor-pointer">How It Works</a></li>
            <li><a href="#about" onClick={(e) => handleAnchorClick(e, 'about')} className="text-foreground no-underline font-medium text-base hover:text-primary transition-colors cursor-pointer">About</a></li>
            <li><a href="#contact" onClick={(e) => handleAnchorClick(e, 'contact')} className="text-foreground no-underline font-medium text-base hover:text-primary transition-colors cursor-pointer">Contact</a></li>
          </ul>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {!isLoaded ? (
              <button disabled className="cartoon-button opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="cartoon-button">Get Started</button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                <button className="cartoon-button">Get Started</button>
              </SignInButton>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center relative pt-[120px] pb-20 px-[60px]">
        <div className="text-center relative z-10 max-w-[900px]">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)] leading-[1.1] mb-8 text-foreground" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Discover Your Soul Signature
          </h1>
          <p className="text-[20px] text-foreground max-w-[700px] mx-auto mb-12 leading-[1.6]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            Beyond your resume and public persona lies your authentic digital identity. We reveal the signature of your originality through your curiosities, passions, and characteristic patterns.
          </p>
          <div className="flex gap-6 justify-center">
            {!isLoaded ? (
              <button disabled className="cartoon-button text-lg px-10 py-4 opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={() => navigate('/dashboard')} className="cartoon-button text-lg px-10 py-4">Discover Your Signature</button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                <button className="cartoon-button text-lg px-10 py-4">Discover Your Signature</button>
              </SignInButton>
            )}
            <button onClick={handleWatchDemoClick} className="btn-anthropic-secondary text-lg px-10 py-4">See How It Works</button>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section id="works" className="py-[100px] px-[60px] bg-background">
        <div className="text-center mb-[60px]">
          <h2 className="text-[clamp(2rem,4vw,3rem)] mb-4 text-foreground" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Your Digital Identity, Revealed</h2>
          <p className="text-[20px] text-foreground" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>From the branches to the roots—discover what makes you authentically you</p>
        </div>
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-foreground mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Personal Cluster</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-foreground bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>Hobbies & Passions</span>
          </div>
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-foreground mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Professional Cluster</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-foreground bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>Career & Skills</span>
          </div>
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-foreground mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Privacy Spectrum</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-foreground bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>What To Reveal</span>
          </div>
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-foreground mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Soul Dashboard</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-foreground bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>Your Signature</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-[100px] px-[60px] bg-background">
        <div className="text-center mb-[60px]">
          <h2 className="text-[clamp(2rem,4vw,3rem)] mb-4 text-foreground"
              style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Beyond Public Information
          </h2>
          <p className="text-[20px] text-foreground"
             style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            Information doesn't have a soul—discover yours
          </p>
        </div>
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-foreground">〜</div>
            <h3 className="text-[24px] text-foreground mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Platform Integration
            </h3>
            <p className="text-foreground leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Connect Netflix, Spotify, Discord, GitHub, and 30+ platforms to reveal your authentic patterns
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-foreground">◐</div>
            <h3 className="text-[24px] text-foreground mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Privacy Control
            </h3>
            <p className="text-foreground leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Granular 0-100% sliders for each life cluster. Share what you want, when you want
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-foreground">◉</div>
            <h3 className="text-[24px] text-foreground mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Soul Discovery
            </h3>
            <p className="text-foreground leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              AI reveals patterns and curiosities you didn't know about yourself
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-foreground">▣</div>
            <h3 className="text-[24px] text-foreground mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Contextual Sharing
            </h3>
            <p className="text-foreground leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Different twin personas for professional, social, dating, or creative contexts
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-foreground">◎</div>
            <h3 className="text-[24px] text-foreground mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Digital Twin Chat
            </h3>
            <p className="text-foreground leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Interact with your authentic digital twin through voice and text
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-foreground">△</div>
            <h3 className="text-[24px] text-foreground mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Instant Creation
            </h3>
            <p className="text-foreground leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Connect platforms, answer questions, deploy your soul signature instantly
            </p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-[120px] px-[60px] bg-white">
        <div className="text-center max-w-[900px] mx-auto">
          <h2 className="text-[clamp(2rem,4vw,3rem)] mb-6 text-foreground"
              style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Beyond Digital Cloning
          </h2>
          <p className="text-[20px] leading-[1.6] mb-6 text-foreground"
             style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            "Perhaps we are searching in the branches for what we only find in the roots."
          </p>
          <p className="text-[20px] leading-[1.6] mb-12 text-foreground"
             style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            Public information is easy to clone, but it lacks soul. We create digital twins that capture your true originality—not just what you wrote, but your curiosities, passions, and the patterns that make you uniquely yourself.
          </p>
          {isSignedIn ? (
            <button onClick={() => navigate('/dashboard')} className="cartoon-button text-lg px-10 py-4">
              Discover Your Soul Signature
            </button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="cartoon-button text-lg px-10 py-4">
                Discover Your Soul Signature
              </button>
            </SignInButton>
          )}
        </div>
      </section>

      {/* Testimonials Section */}
      <ArtemisTestimonialsSection />

      {/* CTA Section */}
      <section id="contact" className="py-[120px] px-[60px] text-center bg-background">
        <h2 className="text-[clamp(2rem,4vw,3rem)] mb-6 text-foreground"
            style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
          Ready to Discover Your Soul Signature?
        </h2>
        <p className="text-[22px] text-foreground mb-12"
           style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
          Join thousands creating authentic digital twins that capture their true originality
        </p>
        {isSignedIn ? (
          <button onClick={() => navigate('/dashboard')} className="cartoon-button text-lg px-10 py-4">
            Get Started Today
          </button>
        ) : (
          <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
            <button className="cartoon-button text-lg px-10 py-4">
              Get Started Today
            </button>
          </SignInButton>
        )}
      </section>

    </div>
  );
};

export default Index;