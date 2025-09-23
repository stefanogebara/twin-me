import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, SignInButton, SignUpButton } from '@clerk/clerk-react';

const Index = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useUser();

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
    <div className="min-h-screen bg-[#FBF7F0] text-[#1A1A4B] overflow-x-hidden font-playfair italic">
      {/* Navigation */}
      <nav id="navbar" className="fixed top-0 w-full z-50 px-[60px] py-6 transition-all duration-300 navbar-default">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="text-[28px] text-[#1A1A4B] font-normal italic font-playfair">Twin Me</div>
          <ul className="flex gap-10 list-none">
            <li><a href="#features" className="text-[#1A1A4B] no-underline font-normal italic text-base transition-colors duration-300 hover:text-[#FF5722]">Features</a></li>
            <li><a href="#works" className="text-[#1A1A4B] no-underline font-normal italic text-base transition-colors duration-300 hover:text-[#FF5722]">How It Works</a></li>
            <li><a href="#about" className="text-[#1A1A4B] no-underline font-normal italic text-base transition-colors duration-300 hover:text-[#FF5722]">About</a></li>
            <li><a href="#contact" className="text-[#1A1A4B] no-underline font-normal italic text-base transition-colors duration-300 hover:text-[#FF5722]">Contact</a></li>
          </ul>
          {!isLoaded ? (
            <button disabled className="px-8 py-3 rounded-full bg-gray-400 text-white font-normal italic text-base cursor-not-allowed transition-all duration-300 border-none">Loading...</button>
          ) : isSignedIn ? (
            <button onClick={() => navigate('/get-started')} className="px-8 py-3 rounded-full bg-[#FF5722] text-white font-normal italic text-base cursor-pointer transition-all duration-300 border-none hover:scale-105 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]">Get Started</button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="px-8 py-3 rounded-full bg-[#FF5722] text-white font-normal italic text-base cursor-pointer transition-all duration-300 border-none hover:scale-105 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]">Get Started</button>
            </SignInButton>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center relative pt-[120px] pb-20 px-[60px]">
        {/* Gradient Blobs */}
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-30 top-[10%] right-[10%] gradient-blob-orange"></div>
        <div className="absolute w-[300px] h-[300px] rounded-full opacity-30 bottom-[20%] left-[5%] gradient-blob-blue"></div>
        
        {/* Floating Skills */}
        <div className="absolute w-full h-full top-0 left-0 pointer-events-none skills-container">
          <div className="skill-pill" style={{"--orbit-radius": "250px", "--duration": "30s", "animationDelay": "0s"} as React.CSSProperties}>Voice Learning</div>
          <div className="skill-pill" style={{"--orbit-radius": "200px", "--duration": "25s", "animationDelay": "-5s"} as React.CSSProperties}>AI Teaching</div>
          <div className="skill-pill" style={{"--orbit-radius": "280px", "--duration": "35s", "animationDelay": "-10s"} as React.CSSProperties}>Digital Twins</div>
          <div className="skill-pill" style={{"--orbit-radius": "220px", "--duration": "28s", "animationDelay": "-15s"} as React.CSSProperties}>24/7 Support</div>
          <div className="skill-pill" style={{"--orbit-radius": "260px", "--duration": "32s", "animationDelay": "-20s"} as React.CSSProperties}>Adaptive Learning</div>
          <div className="skill-pill" style={{"--orbit-radius": "240px", "--duration": "27s", "animationDelay": "-25s"} as React.CSSProperties}>Personalized</div>
          <div className="skill-pill" style={{"--orbit-radius": "270px", "--duration": "33s", "animationDelay": "-30s"} as React.CSSProperties}>Real-time</div>
        </div>
        
        <div className="text-center relative z-10">
          <h1 className="text-fluid-xl leading-[1.1] mb-8 text-[#1A1A4B] font-display text-weight-animate animate-text-reveal stagger-1 gradient-text">
            Transform Teaching<br />
            with Digital Twins
          </h1>
          <p className="text-[22px] font-body text-[#6B7280] max-w-[700px] mx-auto mb-12 leading-[1.6] animate-text-reveal stagger-2">Create AI replicas of educators that provide personalized, always-available learning experiences through natural conversations</p>
          <div className="flex gap-6 justify-center animate-scale-in stagger-3">
            {!isLoaded ? (
              <button disabled className="btn-modern opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={() => navigate('/get-started')} className="btn-modern hover-lift hover-glow">Create Your Twin</button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                <button className="btn-modern hover-lift hover-glow">Create Your Twin</button>
              </SignInButton>
            )}
            <button onClick={handleWatchDemoClick} className="px-8 py-3 rounded-full bg-transparent text-[#1A1A4B] border-2 border-[#1A1A4B] font-display font-medium text-base cursor-pointer transition-all duration-300 hover:bg-[#1A1A4B] hover:text-white hover-lift">Watch Demo</button>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section id="works" className="py-[100px] px-[60px] bg-white scroll-reveal">
        <div className="text-center mb-[60px]">
          <h2 className="text-fluid-lg text-[#1A1A4B] mb-4 font-display text-weight-animate gradient-text-blue">See Our Platform in Action</h2>
          <p className="text-[20px] text-[#6B7280] font-body">Experience the future of personalized education</p>
        </div>
        <div className="max-w-[1400px] mx-auto flex gap-8 overflow-x-auto pb-5">
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover-lift hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)] glass-card animate-slide-in-left stagger-1">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#FF5722] to-[#FFC107]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Voice Assistant</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-body font-medium text-white bg-[#FF5722] pill-glow">Voice AI</span>
          </div>
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover-lift hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)] glass-card animate-slide-in-left stagger-2">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#4A90E2] to-[#00BCD4]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Chat Interface</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-body font-medium text-white bg-[#4A90E2] pill-glow">Text Learning</span>
          </div>
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover-lift hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)] glass-card animate-slide-in-left stagger-3">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#9C27B0] to-[#E91E63]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Analytics Dashboard</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-body font-medium text-white bg-[#9C27B0] pill-glow">Data Science</span>
          </div>
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover-lift hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)] glass-card animate-slide-in-left stagger-4">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#4CAF50] to-[#8BC34A]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Teacher Portal</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-body font-medium text-white bg-[#4CAF50] pill-glow">Platform</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-[100px] px-[60px] bg-[#FBF7F0] scroll-reveal">
        <div className="text-center mb-[60px]">
          <h2 className="text-fluid-lg text-[#1A1A4B] mb-4 font-display text-weight-animate gradient-text-purple animate-text-reveal">What We Bring to Education</h2>
          <p className="text-[20px] text-[#6B7280] font-body animate-text-reveal stagger-1">Digital experiences that revolutionize learning</p>
        </div>
        <div className="max-w-[1200px] mx-auto grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-10">
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover-lift hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] glass-card animate-scale-in stagger-1">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px] icon-float">〜</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Voice Learning</h3>
            <p className="text-[#6B7280] leading-[1.6] font-body">Natural conversations with AI teachers that feel like real interactions</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover-lift hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] glass-card animate-scale-in stagger-2">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px] icon-float">◐</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Text Interface</h3>
            <p className="text-[#6B7280] leading-[1.6] font-body">ChatGPT-style learning experience for written communication</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover-lift hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] glass-card animate-scale-in stagger-3">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px] icon-float">◉</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Adaptive AI</h3>
            <p className="text-[#6B7280] leading-[1.6] font-body">Personalized teaching that adapts to your unique learning style</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover-lift hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] glass-card animate-scale-in stagger-4">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px] icon-float">▣</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Smart Analytics</h3>
            <p className="text-[#6B7280] leading-[1.6] font-body">Track progress and get insights into your learning journey</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover-lift hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] glass-card animate-scale-in stagger-5">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px] icon-float">◎</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Global Access</h3>
            <p className="text-[#6B7280] leading-[1.6] font-body">Learn from anywhere, anytime, with any device</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover-lift hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] glass-card animate-scale-in stagger-6">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px] icon-float">△</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 font-display text-weight-animate">Instant Setup</h3>
            <p className="text-[#6B7280] leading-[1.6] font-body">Teachers upload content, AI learns and deploys instantly</p>
          </div>
        </div>
      </section>

      {/* 3D Grid Section */}
      <section id="about" className="relative py-[120px] px-[60px] bg-[#2A3F3A] overflow-hidden">
        <div className="perspective-grid absolute w-full h-full top-0 left-0"></div>
        <div className="floating-image absolute bg-white p-3 rounded-[12px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] w-[150px] h-[150px] top-[20%] left-[10%] bg-gradient-to-br from-[#FF5722] to-[#FFC107] floating-anim"></div>
        <div className="floating-image absolute bg-white p-3 rounded-[12px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] w-[120px] h-[160px] top-[30%] right-[15%] bg-gradient-to-br from-[#4A90E2] to-[#9C27B0] floating-anim-delay-2"></div>
        <div className="floating-image absolute bg-white p-3 rounded-[12px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] w-[140px] h-[140px] bottom-[25%] left-[20%] bg-gradient-to-br from-[#4CAF50] to-[#00BCD4] floating-anim-delay-4"></div>
        
        <div className="relative z-10 text-center max-w-[900px] mx-auto">
          <h2 className="text-fluid-lg text-white mb-6 font-display text-weight-animate animate-text-reveal gradient-text-white">Behind the Technology</h2>
          <p className="text-[rgba(255,255,255,0.8)] text-[20px] leading-[1.6] mb-6 font-body animate-text-reveal stagger-1">Finally, meet the platform transforming education</p>
          <p className="text-[rgba(255,255,255,0.8)] text-[20px] leading-[1.6] mb-12 font-body animate-text-reveal stagger-2">We help educators create digital twins that actually work. Whether you need to scale your teaching or preserve your knowledge, we focus on real impact—no complicated tech, just education that works.</p>
          {isSignedIn ? (
            <button onClick={() => navigate('/get-started')} className="btn-modern px-12 py-[18px] text-[18px] hover-lift hover-glow animate-scale-in stagger-3">Start Creating for Free</button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="btn-modern px-12 py-[18px] text-[18px] hover-lift hover-glow animate-scale-in stagger-3">Start Creating for Free</button>
            </SignInButton>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-[120px] px-[60px] text-center bg-[#FBF7F0] scroll-reveal">
        <h2 className="text-fluid-lg text-[#1A1A4B] mb-6 font-display text-weight-animate gradient-text animate-text-reveal">Ready to transform education?</h2>
        <p className="text-[22px] text-[#6B7280] mb-12 font-body animate-text-reveal stagger-1">Join thousands of educators creating their digital twins</p>
        {isSignedIn ? (
          <button onClick={() => navigate('/get-started')} className="btn-modern px-12 py-[18px] text-[18px] hover-lift hover-glow animate-scale-in stagger-2">Get Started Today</button>
        ) : (
          <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
            <button className="btn-modern px-12 py-[18px] text-[18px] hover-lift hover-glow animate-scale-in stagger-2">Get Started Today</button>
          </SignInButton>
        )}
      </section>

      <style dangerouslySetInnerHTML={{
        __html: `
        .navbar-default.scrolled {
          background: rgba(251, 247, 240, 0.95) !important;
          backdrop-filter: blur(10px);
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
          padding: 16px 60px !important;
        }
        
        .gradient-blob-orange {
          background: linear-gradient(135deg, #FF5722, #FF9800);
          filter: blur(100px);
          animation: morphing 20s ease-in-out infinite;
        }
        
        .gradient-blob-blue {
          background: linear-gradient(135deg, #4A90E2, #00BCD4);
          filter: blur(100px);
          animation: morphing 20s ease-in-out infinite;
        }
        
        @keyframes morphing {
          0%, 100% {
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
            transform: translate(0, 0) scale(1);
          }
          33% {
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
            transform: translate(50px, -30px) scale(1.1);
          }
          66% {
            border-radius: 50% 50% 40% 60% / 40% 50% 60% 50%;
            transform: translate(-30px, 30px) scale(0.95);
          }
        }
        
        @keyframes orbit {
          0% {
            transform: rotate(0deg) translateX(var(--orbit-radius)) rotate(0deg);
          }
          100% {
            transform: rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg);
          }
        }
        
        .skill-pill {
          position: absolute;
          padding: 12px 24px;
          background: #C5D8FF;
          color: #1A1A4B;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 400;
          font-style: italic;
          white-space: nowrap;
          left: 50%;
          top: 50%;
          transform-origin: center;
          animation: orbit var(--duration) linear infinite;
          opacity: 0.9;
          pointer-events: auto;
          transition: all 0.3s ease;
        }
        
        .skill-pill:hover {
          transform: scale(1.1);
          opacity: 1;
          z-index: 20;
        }
        
        .perspective-grid {
          transform: perspective(1000px) rotateX(60deg) translateY(50%);
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        
        @keyframes floatImage {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-20px) rotate(3deg); }
        }
        
        .floating-anim {
          animation: floatImage 6s ease-in-out infinite;
        }
        
        .floating-anim-delay-2 {
          animation: floatImage 6s ease-in-out infinite;
          animation-delay: 2s;
        }
        
        .floating-anim-delay-4 {
          animation: floatImage 6s ease-in-out infinite;
          animation-delay: 4s;
        }
        
        .floating-image:hover {
          transform: translateY(-10px) scale(1.1);
        }
        `
      }} />
    </div>
  );
};

export default Index;