import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { Sparkles, User, BookOpen, Mic, Brain, ArrowRight } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

const AnthropicIndex = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded, user } = useAuth();
  const [animatedWords, setAnimatedWords] = useState<string[]>("Discover Your Soul Signature".split(' '));

  // Anthropic-style word animation for hero text
  useEffect(() => {
    const heroText = "Discover Your Soul Signature";
    const words = heroText.split(' ');

    // Set words immediately to prevent layout shift
    setAnimatedWords(words);

    // Small delay to ensure DOM is ready, then trigger animations
    const timer = setTimeout(() => {
      words.forEach((_, index) => {
        setTimeout(() => {
          const wordElements = document.querySelectorAll('.hero-word');
          if (wordElements[index]) {
            wordElements[index].classList.add('animate-in');
          }
        }, index * 150);
      });
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleGetStartedClick = () => {
    console.log('🚀 Get Started clicked - Auth state:', { isLoaded, isSignedIn, user });

    // Always go to auth first - even if user might be logged in
    // After login, they should see proper onboarding
    console.log('🚀 Redirecting to authentication/onboarding flow');
    navigate('/auth');
  };

  const handleWatchDemoClick = () => {
    if (!isLoaded) return;

    if (isSignedIn) {
      navigate('/watch-demo');
    } else {
      navigate('/auth');
    }
  };



  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)', color: 'var(--_color-theme---text)' }}>
      {/* Navigation - Anthropic Style */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-sm transition-all duration-300"
           style={{ backgroundColor: 'var(--_color-theme---background)/90', borderBottom: '1px solid var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src="/twin-me-logo.svg" alt="Twin Me" className="w-10 h-10" />
              <div className="text-2xl font-medium text-heading" style={{ color: 'var(--_color-theme---text)' }}>
                Twin Me
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {!isLoaded ? (
                <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
              ) : (
                <button onClick={handleGetStartedClick} className="btn-anthropic-primary">Get Started</button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Anthropic Style */}
      <section className="min-h-screen flex items-center justify-center pt-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="u-display-xl mb-8 text-center" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
            <div className="flex flex-wrap justify-center items-center gap-2">
              {animatedWords.map((word, index) => (
                <span
                  key={index}
                  className="hero-word animate-word inline-block"
                  style={{
                    transitionDelay: `${index * 150}ms`
                  }}
                >
                  {word}
                </span>
              ))}
            </div>
          </h1>

          <p className="text-body-large mb-12 max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--_color-theme---text)' }}>
            "Perhaps we are searching in the branches for what we only find in the roots." Connect your digital life - Netflix, Spotify, Discord, and 30+ platforms - to discover and share your authentic soul signature.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            {!isLoaded ? (
              <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
            ) : (
              <button onClick={handleGetStartedClick} className="btn-anthropic-primary flex items-center gap-2">
                Create Your Twin
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
            <button onClick={handleWatchDemoClick} className="btn-anthropic-secondary">
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="u-display-l text-heading mb-6">
              Beyond Digital Cloning
            </h2>
            <p className="text-body-large max-w-2xl mx-auto">
              While public information is easily cloned, it lacks soul. We go deeper - discovering what makes you authentically YOU through your genuine curiosities, passions, and digital footprints.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <Sparkles className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading font-medium text-xl mb-4">Soul Signature Discovery</h3>
              <p className="text-body">Connect your digital life to reveal your unique patterns and authentic self</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <User className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading font-medium text-xl mb-4">30+ Platform Connectors</h3>
              <p className="text-body">Spotify, Netflix, YouTube, Discord - your digital footprint becomes your identity</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <Mic className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading font-medium text-xl mb-4">Privacy Spectrum Control</h3>
              <p className="text-body">Choose what to reveal and what to share with granular intensity sliders</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <Brain className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading font-medium text-xl mb-4">Life Clusters</h3>
              <p className="text-body">Organize your identity into meaningful groupings - hobbies, spirituality, career</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <BookOpen className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading font-medium text-xl mb-4">Instant Twin Generation</h3>
              <p className="text-body">Connect platforms → Discover soul signature → Create authentic twin</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6" style={{ backgroundColor: 'var(--_color-theme---card)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="u-display-l text-heading mb-6">
              How It Works
            </h2>
            <p className="text-body-large max-w-2xl mx-auto">
              Discover your soul signature in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto" style={{ backgroundColor: 'var(--_color-theme---button-primary--background)' }}>1</div>
              <h3 className="text-heading text-xl font-medium mb-4">Connect Your Digital Life</h3>
              <p className="text-body">Link your entertainment platforms, professional tools, and social networks. We extract your authentic patterns from Spotify moods, Netflix narratives, and more.</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto" style={{ backgroundColor: 'var(--_color-theme---button-primary--background)' }}>2</div>
              <h3 className="text-heading text-xl font-medium mb-4">Control Your Privacy</h3>
              <p className="text-body">Use our revolutionary privacy spectrum with intensity sliders. Choose what to reveal and what to share - different levels for different audiences.</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto" style={{ backgroundColor: 'var(--_color-theme---button-primary--background)' }}>3</div>
              <h3 className="text-heading text-xl font-medium mb-4">Share Your Twin</h3>
              <p className="text-body">Your soul signature is ready! Share different aspects of yourself with different contexts - professional, social, or personal.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-16 px-6 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-heading font-medium text-xl mb-4">Twin Me</h3>
              <p className="text-body">Creating the future of personalized education through AI-powered digital twins.</p>
            </div>

            <div>
              <h4 className="text-heading font-medium mb-4">Platform</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="text-body hover:opacity-70">Features</a></li>
                <li><a href="#how-it-works" className="text-body hover:opacity-70">How It Works</a></li>
                <li><a href="#" className="text-body hover:opacity-70">Pricing</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-heading font-medium mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-body hover:opacity-70">Documentation</a></li>
                <li><a href="#" className="text-body hover:opacity-70">Support</a></li>
                <li><a href="#" className="text-body hover:opacity-70">Blog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-heading font-medium mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-body hover:opacity-70">About</a></li>
                <li><a href="#" className="text-body hover:opacity-70">Contact</a></li>
                <li><a href="#" className="text-body hover:opacity-70">Privacy</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t text-center" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <p className="text-body opacity-70">© 2024 Twin Me. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AnthropicIndex;