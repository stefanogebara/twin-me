import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { Sparkles, User, BookOpen, Mic, Brain, ArrowRight } from 'lucide-react';

const AnthropicIndex = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useUser();
  const [animatedWords, setAnimatedWords] = useState<string[]>("Transform Teaching with Digital Twins".split(' '));

  // Anthropic-style word animation for hero text
  useEffect(() => {
    const heroText = "Transform Teaching with Digital Twins";
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
    if (!isLoaded) return;

    if (isSignedIn) {
      navigate('/legacy-get-started');
    }
  };

  const handleWatchDemoClick = () => {
    if (!isLoaded) return;

    if (isSignedIn) {
      navigate('/watch-demo');
    } else {
      navigate('/auth');
    }
  };

  // Apple-style content grouping by user benefit
  const featureGroups = {
    forEducators: {
      title: "For Educators",
      description: "Powerful tools to amplify your teaching",
      features: [
        {
          icon: <Sparkles className="w-8 h-8" />,
          title: "AI-Powered Teaching",
          description: "Create digital twins that capture your unique teaching style and personality"
        },
        {
          icon: <User className="w-8 h-8" />,
          title: "24/7 Availability",
          description: "Your teaching presence available anytime, anywhere for students"
        }
      ]
    },
    forStudents: {
      title: "For Students",
      description: "Personalized learning experiences that adapt to you",
      features: [
        {
          icon: <Mic className="w-8 h-8" />,
          title: "Voice-Enabled Learning",
          description: "Natural conversation experiences with voice synthesis technology"
        },
        {
          icon: <Brain className="w-8 h-8" />,
          title: "Personalized Education",
          description: "Adaptive learning that adjusts to each student's pace and style"
        }
      ]
    }
  };


  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)', color: 'var(--_color-theme---text)' }}>
      {/* Navigation - Anthropic Style */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-sm transition-all duration-300"
           style={{ backgroundColor: 'var(--_color-theme---background)/90', borderBottom: '1px solid var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="text-2xl font-medium text-heading" style={{ color: 'var(--_color-theme---text)' }}>
              Twin Me
            </div>
            {/* Apple-style Navigation with Clear Hierarchy */}
            <div className="hidden md:flex items-center space-x-8">
              <a
                href="#features"
                className="text-sm font-medium transition-all hover:opacity-70 relative group"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                Features
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 transition-all group-hover:w-full" style={{ backgroundColor: 'var(--_color-theme---accent)' }}></div>
              </a>
              <a
                href="#how-it-works"
                className="text-sm font-medium transition-all hover:opacity-70 relative group"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                How It Works
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 transition-all group-hover:w-full" style={{ backgroundColor: 'var(--_color-theme---accent)' }}></div>
              </a>
              <a
                href="#contact"
                className="text-sm font-medium transition-all hover:opacity-70 relative group"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                Contact
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 transition-all group-hover:w-full" style={{ backgroundColor: 'var(--_color-theme---accent)' }}></div>
              </a>
            </div>
            {!isLoaded ? (
              <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={() => navigate('/professor-dashboard')} className="btn-anthropic-primary">
                Dashboard
              </button>
            ) : (
              <SignInButton mode="modal" afterSignInUrl="/legacy-get-started">
                <button className="btn-anthropic-primary">Get Started</button>
              </SignInButton>
            )}
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
            Create AI replicas of educators that provide personalized, always-available learning experiences through natural conversations. Transform how students learn with digital twins that capture your unique teaching style.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            {!isLoaded ? (
              <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={handleGetStartedClick} className="btn-anthropic-primary flex items-center gap-2">
                Create Your Twin
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <SignInButton mode="modal" afterSignInUrl="/legacy-get-started">
                <button className="btn-anthropic-primary flex items-center gap-2">
                  Create Your Twin
                  <ArrowRight className="w-5 h-5" />
                </button>
              </SignInButton>
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
              The Future of Personalized Education
            </h2>
            <p className="text-body-large max-w-2xl mx-auto">
              Our AI-powered platform creates digital twins of educators, enabling personalized learning experiences that adapt to each student's unique needs.
            </p>
          </div>

          {/* Apple-style Grouped Content */}
          <div className="space-y-16">
            {Object.entries(featureGroups).map(([groupKey, group]) => (
              <div key={groupKey} className="">
                {/* Group Header */}
                <div className="text-center mb-12">
                  <div className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 mb-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--_color-theme---accent)' }}>
                      {group.title}
                    </span>
                  </div>
                  <p className="text-lg" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                    {group.description}
                  </p>
                </div>

                {/* Group Features */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  {group.features.map((feature, index) => (
                    <div
                      key={index}
                      className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300"
                      style={{ borderColor: 'var(--_color-theme---border)' }}
                    >
                      <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                        <div style={{ color: 'var(--_color-theme---text)' }}>
                          {feature.icon}
                        </div>
                      </div>
                      <h3 className="text-heading font-medium text-xl mb-4">
                        {feature.title}
                      </h3>
                      <p className="text-body">
                        {feature.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
              Create your digital teaching twin in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto"
                   style={{ backgroundColor: 'var(--_color-theme---button-primary--background)' }}>
                1
              </div>
              <h3 className="text-heading text-xl font-medium mb-4">Share Your Teaching Style</h3>
              <p className="text-body">
                Answer a few conversational questions about your teaching philosophy, communication style, and expertise areas.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto"
                   style={{ backgroundColor: 'var(--_color-theme---button-primary--background)' }}>
                2
              </div>
              <h3 className="text-heading text-xl font-medium mb-4">Add Your Content</h3>
              <p className="text-body">
                Upload course materials, lectures, or simply describe your classes. Our AI learns from your content to create authentic responses.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto"
                   style={{ backgroundColor: 'var(--_color-theme---button-primary--background)' }}>
                3
              </div>
              <h3 className="text-heading text-xl font-medium mb-4">Start Teaching</h3>
              <p className="text-body">
                Your digital twin is ready! Students can now have natural conversations and get personalized help anytime.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="py-24 px-6" style={{ backgroundColor: 'var(--_color-theme---card)' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="u-display-l text-heading mb-6">
            Ready to Transform Your Teaching?
          </h2>
          <p className="text-body-large mb-8 max-w-2xl mx-auto">
            Join thousands of educators who are already using AI to create more personalized and effective learning experiences.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            {!isLoaded ? (
              <button disabled className="btn-anthropic-primary opacity-50 cursor-not-allowed">Loading...</button>
            ) : isSignedIn ? (
              <button onClick={() => navigate('/legacy-get-started')} className="btn-anthropic-primary flex items-center gap-2">
                Start Building Your Twin
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <SignInButton mode="modal" afterSignInUrl="/legacy-get-started">
                <button className="btn-anthropic-primary flex items-center gap-2">
                  Start Building Your Twin
                  <ArrowRight className="w-5 h-5" />
                </button>
              </SignInButton>
            )}
            <button onClick={handleWatchDemoClick} className="btn-anthropic-secondary">
              See Demo First
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-16 px-6 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-heading font-medium text-xl mb-4">Twin Me</h3>
              <p className="text-body">
                Creating the future of personalized education through AI-powered digital twins.
              </p>
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
            <p className="text-body opacity-70">
              © 2024 Twin Me. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AnthropicIndex;