import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '../contexts/AuthContext';

/**
 * Modern Illustration Hero Component
 *
 * Design Features:
 * - Vibrant solid-color backgrounds
 * - Pill-shaped navigation bar with dark overlay
 * - Bold typography (weight 800-900)
 * - Geometric character illustrations
 * - High-saturation complementary colors
 */

interface IllustrationHeroProps {
  variant?: 'tech-forward' | 'editorial' | 'diagonal' | 'title-card';
}

export const IllustrationHero = ({ variant = 'tech-forward' }: IllustrationHeroProps) => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();

  const variants = {
    'tech-forward': {
      bg: '#6B7FFF',
      accentBg: '#5A6FEE',
      textColor: '#FFFFFF',
      pillBg: 'rgba(0, 0, 0, 0.8)',
      ctaColor: '#00D97E',
      ctaHover: '#00C770',
      title: 'AI Agents That Know You Better Than You Know Yourself',
      subtitle: 'Connect 30+ platforms. Deploy personal AI workforce. Automate everything.',
      characterStyle: 'tech',
    },
    'editorial': {
      bg: '#FF7A4D',
      accentBg: '#FF6B3D',
      textColor: '#FFFFFF',
      pillBg: 'rgba(0, 0, 0, 0.8)',
      ctaColor: '#FFE66D',
      ctaHover: '#FFD93D',
      title: 'Your Personal AI Workforce',
      subtitle: 'Trained on your life. Working in your style.',
      characterStyle: 'editorial',
    },
    'diagonal': {
      bg: '#00D97E',
      accentBg: '#00C770',
      textColor: '#0A2540',
      pillBg: 'rgba(0, 0, 0, 0.8)',
      ctaColor: '#0A2540',
      ctaHover: '#1A3550',
      title: 'Meet Your Digital Twin',
      subtitle: 'AI that thinks, writes, and creates exactly like you',
      characterStyle: 'diagonal',
    },
    'title-card': {
      bg: '#8B5CF6',
      accentBg: '#7C3AED',
      textColor: '#FFFFFF',
      pillBg: 'rgba(0, 0, 0, 0.8)',
      ctaColor: '#F472B6',
      ctaHover: '#EC4899',
      title: 'TWIN ME',
      subtitle: 'Your life. Your data. Your AI workforce.',
      characterStyle: 'minimal',
    },
  };

  const config = variants[variant];

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: config.bg }}
    >
      {/* Pill-Shaped Navigation Bar */}
      <nav
        className="fixed top-8 left-1/2 -translate-x-1/2 z-50 rounded-full px-8 py-4 backdrop-blur-md shadow-2xl"
        style={{ backgroundColor: config.pillBg }}
      >
        <div className="flex items-center gap-8">
          <div className="text-white font-bold text-xl">Twin Me</div>
          <div className="flex gap-6 text-sm font-medium">
            <a href="#features" className="text-white/80 hover:text-white transition-colors">Features</a>
            <a href="#agents" className="text-white/80 hover:text-white transition-colors">Agents</a>
            <a href="#privacy" className="text-white/80 hover:text-white transition-colors">Privacy</a>
          </div>
          {!isLoaded ? (
            <button disabled className="ml-auto px-6 py-2 rounded-full bg-white/20 text-white/50 cursor-not-allowed text-sm font-bold">
              Loading...
            </button>
          ) : isSignedIn ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="ml-auto px-6 py-2 rounded-full bg-white text-stone-900 hover:bg-white/90 transition-all text-sm font-bold shadow-lg"
            >
              Dashboard
            </button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="ml-auto px-6 py-2 rounded-full bg-white text-stone-900 hover:bg-white/90 transition-all text-sm font-bold shadow-lg">
                Get Started
              </button>
            </SignInButton>
          )}
        </div>
      </nav>

      {/* Hero Content */}
      <div className="min-h-screen flex items-center justify-center px-8 pt-32 pb-16">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text Content */}
          <div className="relative z-10">
            <h1
              className="text-[clamp(3rem,8vw,6rem)] leading-[0.9] mb-6 tracking-tight"
              style={{
                color: config.textColor,
                fontWeight: 900,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {config.title}
            </h1>

            <p
              className="text-[clamp(1.25rem,3vw,1.75rem)] mb-12 leading-relaxed"
              style={{
                color: variant === 'diagonal' ? config.textColor : 'rgba(255,255,255,0.9)',
                fontWeight: 600,
                maxWidth: '600px'
              }}
            >
              {config.subtitle}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4">
              {!isLoaded ? (
                <button
                  disabled
                  className="px-10 py-5 rounded-2xl text-lg font-bold opacity-50 cursor-not-allowed"
                  style={{ backgroundColor: config.ctaColor }}
                >
                  Loading...
                </button>
              ) : isSignedIn ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-10 py-5 rounded-2xl text-lg font-bold shadow-2xl transition-all transform hover:scale-105 hover:shadow-3xl"
                  style={{
                    backgroundColor: config.ctaColor,
                    color: variant === 'diagonal' || variant === 'title-card' ? '#FFFFFF' : '#0A2540'
                  }}
                >
                  Launch Dashboard →
                </button>
              ) : (
                <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                  <button
                    className="px-10 py-5 rounded-2xl text-lg font-bold shadow-2xl transition-all transform hover:scale-105 hover:shadow-3xl"
                    style={{
                      backgroundColor: config.ctaColor,
                      color: variant === 'diagonal' || variant === 'title-card' ? '#FFFFFF' : '#0A2540'
                    }}
                  >
                    Start Free Trial →
                  </button>
                </SignInButton>
              )}

              <button
                className="px-10 py-5 rounded-2xl text-lg font-bold border-2 transition-all"
                style={{
                  borderColor: variant === 'diagonal' ? config.textColor : 'rgba(255,255,255,0.3)',
                  color: config.textColor,
                  backgroundColor: 'transparent'
                }}
              >
                Watch Demo
              </button>
            </div>

            {/* Platform Badges */}
            <div className="mt-12 flex flex-wrap gap-3">
              {['Spotify', 'Discord', 'GitHub', 'Gmail', 'Netflix', '+25 more'].map((platform) => (
                <span
                  key={platform}
                  className="px-4 py-2 rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: variant === 'diagonal' ? 'rgba(10,37,64,0.1)' : 'rgba(255,255,255,0.15)',
                    color: config.textColor,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Character Illustration */}
          <div className="relative">
            {/* Tech-Forward Character - Green Background with Headphones */}
            {config.characterStyle === 'tech' && (
              <div className="relative w-full aspect-square flex items-center justify-center">
                <div className="relative w-full h-full">
                  {/* Character Image Placeholder */}
                  <div className="absolute inset-0 flex items-end justify-center overflow-hidden">
                    {/* Placeholder for Image #1 - Character with headphones looking up */}
                    <div
                      className="w-full h-full bg-gradient-to-br from-emerald-400/20 to-green-500/20 rounded-3xl flex items-end justify-center relative"
                      style={{
                        backgroundImage: 'url(/assets/hero-character-green.png)',
                        backgroundSize: 'contain',
                        backgroundPosition: 'bottom center',
                        backgroundRepeat: 'no-repeat',
                      }}
                    >
                      {/* Fallback geometric illustration if image not found */}
                      <div className="w-3/4 h-3/4 opacity-30">
                        <div className="text-9xl text-center">🎧</div>
                        <p className="text-center text-white/50 mt-4 font-bold text-sm">
                          Character with headphones
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Floating Platform Icons */}
                  <div className="absolute top-1/4 right-0 w-16 h-16 rounded-xl bg-white/20 backdrop-blur-md shadow-xl flex items-center justify-center text-3xl animate-float">
                    🎵
                  </div>
                  <div className="absolute bottom-1/3 left-0 w-16 h-16 rounded-xl bg-white/20 backdrop-blur-md shadow-xl flex items-center justify-center text-3xl animate-float-delayed">
                    📧
                  </div>
                  <div className="absolute top-1/2 left-1/4 w-16 h-16 rounded-xl bg-white/20 backdrop-blur-md shadow-xl flex items-center justify-center text-3xl animate-float-slow">
                    🧠
                  </div>
                </div>
              </div>
            )}

            {/* Editorial Style Character */}
            {config.characterStyle === 'editorial' && (
              <div className="relative w-full aspect-square flex items-center justify-center">
                <div className="relative w-full h-full">
                  {/* Character Image Placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    {/* Placeholder for Image #2 - Orange background character */}
                    <div
                      className="w-full h-full bg-gradient-to-br from-stone-400/20 to-red-500/20 rounded-3xl flex items-center justify-center relative"
                      style={{
                        backgroundImage: 'url(/assets/hero-character-orange.png)',
                        backgroundSize: 'contain',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                      }}
                    >
                      {/* Fallback geometric illustration if image not found */}
                      <div className="w-3/4 h-3/4 opacity-30">
                        <div className="text-9xl text-center">👤</div>
                        <p className="text-center text-white/50 mt-4 font-bold text-sm">
                          Editorial character standing
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Floating Decorative Elements */}
                  <div className="absolute top-1/4 right-0 w-16 h-16 rounded-xl bg-white/20 backdrop-blur-md shadow-xl flex items-center justify-center text-3xl animate-float">
                    ✦
                  </div>
                  <div className="absolute bottom-1/3 left-0 w-16 h-16 rounded-xl bg-white/20 backdrop-blur-md shadow-xl flex items-center justify-center text-3xl animate-float-delayed">
                    ✨
                  </div>
                </div>
              </div>
            )}

            {/* Diagonal Dynamic Composition */}
            {config.characterStyle === 'diagonal' && (
              <div className="relative w-full aspect-square flex items-center justify-center">
                <div className="relative w-full h-full">
                  {/* Character Image Placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    {/* Placeholder for Image #3 - Blue background character */}
                    <div
                      className="w-full h-full bg-gradient-to-br from-blue-400/20 to-cyan-500/20 rounded-3xl flex items-center justify-center relative"
                      style={{
                        backgroundImage: 'url(/assets/hero-character-blue.png)',
                        backgroundSize: 'contain',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                      }}
                    >
                      {/* Fallback geometric illustration if image not found */}
                      <div className="w-3/4 h-3/4 opacity-30">
                        <div className="text-9xl text-center">🧠</div>
                        <p className="text-center text-stone-900/50 mt-4 font-bold text-sm">
                          Character with brain theme
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Platform Nodes */}
                  {[
                    { icon: '🎵', top: '10%', left: '20%' },
                    { icon: '📧', top: '20%', right: '15%' },
                    { icon: '📅', bottom: '25%', left: '10%' },
                    { icon: '🎬', bottom: '15%', right: '20%' },
                  ].map((node, i) => (
                    <div
                      key={i}
                      className="absolute w-20 h-20 rounded-2xl shadow-xl flex items-center justify-center text-4xl animate-float-slow"
                      style={{
                        ...node,
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        transform: `rotate(${Math.random() * 20 - 10}deg)`,
                      }}
                    >
                      {node.icon}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Minimal Title Card Style */}
            {config.characterStyle === 'minimal' && (
              <div className="relative w-full aspect-square flex items-center justify-center">
                {/* Large Typography */}
                <div className="text-center">
                  <div
                    className="text-[12rem] font-black leading-none mb-8"
                    style={{
                      color: config.textColor,
                      WebkitTextStroke: `2px ${config.ctaColor}`,
                      textShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}
                  >
                    AI
                  </div>
                  <div className="flex gap-4 justify-center">
                    {['YOU', 'WORK', 'LIFE'].map((word) => (
                      <div
                        key={word}
                        className="px-6 py-3 rounded-xl text-2xl font-black shadow-xl"
                        style={{
                          backgroundColor: config.ctaColor,
                          color: config.textColor,
                        }}
                      >
                        {word}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decorative Background Elements */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
        style={{
          background: `radial-gradient(circle, ${config.ctaColor} 0%, transparent 70%)`,
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
        style={{
          background: `radial-gradient(circle, ${config.accentBg} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
};
