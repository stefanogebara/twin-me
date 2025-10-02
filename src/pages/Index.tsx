import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton, SignUpButton } from '../contexts/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();

  // Debug authentication state when component loads
  useEffect(() => {
    console.log('Index component loaded - Auth state:', { isSignedIn, isLoaded });
  }, [isSignedIn, isLoaded]);

  const handleGetStartedClick = () => {
    console.log('Get Started clicked. isSignedIn:', isSignedIn, 'isLoaded:', isLoaded);
    if (!isLoaded) {
      console.log('Auth not loaded yet, waiting...');
      return; // Wait for auth to load
    }

    if (isSignedIn) {
      console.log('User is signed in, navigating to /get-started');
      navigate('/get-started');
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
      navigate('/get-started');
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
    <div className="min-h-screen bg-[#FAF9F5] text-[#141413] overflow-x-hidden" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
      {/* Navigation */}
      <nav id="navbar" className="fixed top-0 w-full z-50 px-[60px] py-6 bg-[#FAF9F5]">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="text-[28px] text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Twin Me</div>
          <ul className="flex gap-10 list-none">
            <li><a href="#features" className="text-[#141413] no-underline font-medium text-base">Features</a></li>
            <li><a href="#works" className="text-[#141413] no-underline font-medium text-base">How It Works</a></li>
            <li><a href="#about" className="text-[#141413] no-underline font-medium text-base">About</a></li>
            <li><a href="#contact" className="text-[#141413] no-underline font-medium text-base">Contact</a></li>
          </ul>
          {!isLoaded ? (
            <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
          ) : isSignedIn ? (
            <button onClick={() => navigate('/get-started')} className="btn-anthropic-primary">Get Started</button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="btn-anthropic-primary">Get Started</button>
            </SignInButton>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center relative pt-[120px] pb-20 px-[60px]">
        <div className="text-center relative z-10 max-w-[900px]">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)] leading-[1.1] mb-8 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Discover Your<br />
            Soul Signature
          </h1>
          <p className="text-[20px] text-[#141413] max-w-[700px] mx-auto mb-12 leading-[1.6]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            Beyond your resume and public persona lies your authentic digital identity. We reveal the signature of your originality through your curiosities, passions, and characteristic patterns.
          </p>
          <div className="flex gap-6 justify-center">
            {!isLoaded ? (
              <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={() => navigate('/get-started')} className="btn-anthropic-primary">Discover Your Signature</button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                <button className="btn-anthropic-primary">Discover Your Signature</button>
              </SignInButton>
            )}
            <button onClick={handleWatchDemoClick} className="btn-anthropic-secondary">See How It Works</button>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section id="works" className="py-[100px] px-[60px] bg-[#FAF9F5]">
        <div className="text-center mb-[60px]">
          <h2 className="text-[clamp(2rem,4vw,3rem)] mb-4 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Your Digital Identity, Revealed</h2>
          <p className="text-[20px] text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>From the branches to the roots—discover what makes you authentically you</p>
        </div>
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-[#141413] mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Personal Cluster</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-[#141413] bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>Hobbies & Passions</span>
          </div>
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-[#141413] mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Professional Cluster</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-[#141413] bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>Career & Skills</span>
          </div>
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-[#141413] mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Privacy Spectrum</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-[#141413] bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>What To Reveal</span>
          </div>
          <div className="bg-white rounded-[16px] p-8 border border-[rgba(20,20,19,0.1)]">
            <div className="w-full h-[200px] rounded-[12px] mb-6 bg-[#F5F5F5]"></div>
            <h3 className="text-[24px] text-[#141413] mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>Soul Dashboard</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-medium text-[#141413] bg-[rgba(20,20,19,0.05)]" style={{ fontFamily: 'var(--_typography---font--styrene-b)' }}>Your Signature</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-[100px] px-[60px] bg-[#FAF9F5]">
        <div className="text-center mb-[60px]">
          <h2 className="text-[clamp(2rem,4vw,3rem)] mb-4 text-[#141413]"
              style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Beyond Public Information
          </h2>
          <p className="text-[20px] text-[#141413]"
             style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            Information doesn't have a soul—discover yours
          </p>
        </div>
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-[#141413]">〜</div>
            <h3 className="text-[24px] text-[#141413] mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Voice Learning
            </h3>
            <p className="text-[#141413] leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Natural conversations with AI teachers that feel like real interactions
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-[#141413]">◐</div>
            <h3 className="text-[24px] text-[#141413] mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Text Interface
            </h3>
            <p className="text-[#141413] leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              ChatGPT-style learning experience for written communication
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-[#141413]">◉</div>
            <h3 className="text-[24px] text-[#141413] mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Adaptive AI
            </h3>
            <p className="text-[#141413] leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Personalized teaching that adapts to your unique learning style
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-[#141413]">▣</div>
            <h3 className="text-[24px] text-[#141413] mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Smart Analytics
            </h3>
            <p className="text-[#141413] leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Track progress and get insights into your learning journey
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-[#141413]">◎</div>
            <h3 className="text-[24px] text-[#141413] mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Global Access
            </h3>
            <p className="text-[#141413] leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Learn from anywhere, anytime, with any device
            </p>
          </div>
          <div className="bg-white rounded-[16px] p-10 border border-[rgba(20,20,19,0.1)]">
            <div className="w-[60px] h-[60px] bg-[#F5F5F5] rounded-[12px] flex items-center justify-center mb-6 text-[32px] text-[#141413]">△</div>
            <h3 className="text-[24px] text-[#141413] mb-3"
                style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Instant Setup
            </h3>
            <p className="text-[#141413] leading-[1.6]"
               style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              Teachers upload content, AI learns and deploys instantly
            </p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-[120px] px-[60px] bg-white">
        <div className="text-center max-w-[900px] mx-auto">
          <h2 className="text-[clamp(2rem,4vw,3rem)] mb-6 text-[#141413]"
              style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Behind the Technology
          </h2>
          <p className="text-[20px] leading-[1.6] mb-6 text-[#141413]"
             style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            Finally, meet the platform transforming education
          </p>
          <p className="text-[20px] leading-[1.6] mb-12 text-[#141413]"
             style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            We help educators create digital twins that actually work. Whether you need to scale your teaching or preserve your knowledge, we focus on real impact—no complicated tech, just education that works.
          </p>
          {isSignedIn ? (
            <button onClick={() => navigate('/get-started')} className="btn-anthropic-primary">
              Start Creating for Free
            </button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="btn-anthropic-primary">
                Start Creating for Free
              </button>
            </SignInButton>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-[120px] px-[60px] text-center bg-[#FAF9F5]">
        <h2 className="text-[clamp(2rem,4vw,3rem)] mb-6 text-[#141413]"
            style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
          Ready to transform education?
        </h2>
        <p className="text-[22px] text-[#141413] mb-12"
           style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
          Join thousands of educators creating their digital twins
        </p>
        {isSignedIn ? (
          <button onClick={() => navigate('/get-started')} className="btn-anthropic-primary">
            Get Started Today
          </button>
        ) : (
          <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
            <button className="btn-anthropic-primary">
              Get Started Today
            </button>
          </SignInButton>
        )}
      </section>

    </div>
  );
};

export default Index;