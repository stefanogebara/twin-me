import { useEffect } from 'react';

const Index = () => {
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

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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
          <button className="px-8 py-3 rounded-full bg-[#FF5722] text-white font-normal italic text-base cursor-pointer transition-all duration-300 border-none hover:scale-105 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]">Get Started</button>
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
          <h1 className="text-[clamp(56px,8vw,96px)] leading-[1.1] mb-8 text-[#1A1A4B] font-normal italic font-playfair">
            Transform Teaching<br />
            with Digital Twins
          </h1>
          <p className="text-[22px] italic text-[#6B7280] max-w-[700px] mx-auto mb-12 leading-[1.6]">Create AI replicas of educators that provide personalized, always-available learning experiences through natural conversations</p>
          <div className="flex gap-6 justify-center">
            <button className="px-8 py-3 rounded-full bg-[#FF5722] text-white font-normal italic text-base cursor-pointer transition-all duration-300 border-none hover:scale-105 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]">Create Your Twin</button>
            <button className="px-8 py-3 rounded-full bg-transparent text-[#1A1A4B] border-2 border-[#1A1A4B] font-normal italic text-base cursor-pointer transition-all duration-300 hover:bg-[#1A1A4B] hover:text-white hover:scale-105">Watch Demo</button>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section id="works" className="py-[100px] px-[60px] bg-white">
        <div className="text-center mb-[60px]">
          <h2 className="text-[56px] text-[#1A1A4B] mb-4 italic font-normal font-playfair">See Our Platform in Action</h2>
          <p className="text-[20px] text-[#6B7280] italic">Experience the future of personalized education</p>
        </div>
        <div className="max-w-[1400px] mx-auto flex gap-8 overflow-x-auto pb-5">
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover:translate-y-[-10px] hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#FF5722] to-[#FFC107]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Voice Assistant</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-normal italic text-white bg-[#FF5722]">Voice AI</span>
          </div>
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover:translate-y-[-10px] hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#4A90E2] to-[#00BCD4]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Chat Interface</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-normal italic text-white bg-[#4A90E2]">Text Learning</span>
          </div>
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover:translate-y-[-10px] hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#9C27B0] to-[#E91E63]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Analytics Dashboard</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-normal italic text-white bg-[#9C27B0]">Data Science</span>
          </div>
          <div className="flex-shrink-0 w-[360px] bg-white rounded-[24px] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-[400ms] cursor-pointer portfolio-card odd:rotate-[-2deg] even:rotate-[2deg] hover:translate-y-[-10px] hover:rotate-0 hover:scale-105 hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]">
            <div className="w-full h-[200px] rounded-[16px] mb-6 bg-gradient-to-br from-[#4CAF50] to-[#8BC34A]"></div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Teacher Portal</h3>
            <span className="inline-block px-4 py-2 rounded-full text-[14px] font-normal italic text-white bg-[#4CAF50]">Platform</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-[100px] px-[60px] bg-[#FBF7F0]">
        <div className="text-center mb-[60px]">
          <h2 className="text-[56px] text-[#1A1A4B] mb-4 italic font-normal">What We Bring to Education</h2>
          <p className="text-[20px] text-[#6B7280] italic">Digital experiences that revolutionize learning</p>
        </div>
        <div className="max-w-[1200px] mx-auto grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-10">
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover:translate-y-[-8px] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px]">〜</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Voice Learning</h3>
            <p className="text-[#6B7280] leading-[1.6] italic">Natural conversations with AI teachers that feel like real interactions</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover:translate-y-[-8px] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px]">◐</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Text Interface</h3>
            <p className="text-[#6B7280] leading-[1.6] italic">ChatGPT-style learning experience for written communication</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover:translate-y-[-8px] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px]">◉</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Adaptive AI</h3>
            <p className="text-[#6B7280] leading-[1.6] italic">Personalized teaching that adapts to your unique learning style</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover:translate-y-[-8px] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px]">▣</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Smart Analytics</h3>
            <p className="text-[#6B7280] leading-[1.6] italic">Track progress and get insights into your learning journey</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover:translate-y-[-8px] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px]">◎</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Global Access</h3>
            <p className="text-[#6B7280] leading-[1.6] italic">Learn from anywhere, anytime, with any device</p>
          </div>
          <div className="bg-white rounded-[24px] p-10 transition-all duration-300 cursor-pointer hover:translate-y-[-8px] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]">
            <div className="w-[60px] h-[60px] bg-[rgba(255,87,34,0.1)] rounded-[16px] flex items-center justify-center mb-6 text-[32px]">△</div>
            <h3 className="text-[28px] text-[#1A1A4B] mb-3 italic font-normal">Instant Setup</h3>
            <p className="text-[#6B7280] leading-[1.6] italic">Teachers upload content, AI learns and deploys instantly</p>
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
          <h2 className="text-[64px] text-white mb-6 italic font-normal">Behind the Technology</h2>
          <p className="text-[rgba(255,255,255,0.8)] text-[20px] leading-[1.6] mb-6 italic">Finally, meet the platform transforming education</p>
          <p className="text-[rgba(255,255,255,0.8)] text-[20px] leading-[1.6] mb-12 italic">We help educators create digital twins that actually work. Whether you need to scale your teaching or preserve your knowledge, we focus on real impact—no complicated tech, just education that works.</p>
          <button className="px-12 py-[18px] rounded-full bg-[#FF5722] text-white font-normal italic text-[18px] cursor-pointer transition-all duration-300 border-none hover:scale-105 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]">Start Creating for Free</button>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-[120px] px-[60px] text-center bg-[#FBF7F0]">
        <h2 className="text-[64px] text-[#1A1A4B] mb-6 italic font-normal">Ready to transform education?</h2>
        <p className="text-[22px] text-[#6B7280] mb-12 italic">Join thousands of educators creating their digital twins</p>
        <button className="px-12 py-[18px] rounded-full bg-[#FF5722] text-white font-normal italic text-[18px] cursor-pointer transition-all duration-300 border-none hover:scale-105 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]">Get Started Today</button>
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