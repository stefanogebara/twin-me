import { useNavigate } from 'react-router-dom';
import { useAuth, SignInButton } from '../contexts/AuthContext';
import { ArrowRight, Brain, Lock, Sparkles, Users } from 'lucide-react';

/**
 * Cofounder-Inspired Hero Component
 *
 * Design System inspired by cofounder.co:
 * - Neutral color palette (off-white backgrounds)
 * - Large responsive typography
 * - Gradient text highlights
 * - Card-based features
 * - Shadow depth effects
 * - Centered vertical layout
 */

export const CofounderHero = () => {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();

  const features = [
    {
      icon: Brain,
      title: 'Your Soul Signature',
      description: 'Discover the authentic patterns that make you uniquely you through your digital footprints.',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: Lock,
      title: 'Privacy-First Design',
      description: 'Granular control over what you share. Your data, your rules, your audience-specific twins.',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Sparkles,
      title: 'AI-Powered Insights',
      description: 'Claude AI analyzes your entertainment, work, and social data to reveal hidden personality patterns.',
      gradient: 'from-stone-500 to-red-500',
    },
    {
      icon: Users,
      title: 'Soul Matching',
      description: 'Find people with complementary or similar soul signatures for meaningful connections.',
      gradient: 'from-green-500 to-emerald-500',
    },
  ];

  const stats = [
    { number: '30+', label: 'Platform Integrations' },
    { number: '100%', label: 'Privacy Control' },
    { number: '∞', label: 'Possibilities' },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-neutral-50/80 backdrop-blur-lg border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold text-neutral-900">Twin Me</div>
          <div className="flex items-center gap-4">
            {!isLoaded ? (
              <button disabled className="px-6 py-2 rounded-full bg-neutral-200 text-neutral-500 cursor-not-allowed text-sm font-medium">
                Loading...
              </button>
            ) : isSignedIn ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 transition-all text-sm font-medium shadow-lg"
              >
                Dashboard
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                <button className="px-6 py-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 transition-all text-sm font-medium shadow-lg">
                  Get Started
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Headline */}
          <h1 className="text-[48px] md:text-[72px] lg:text-[90px] font-bold text-neutral-900 leading-[1.1] mb-6 tracking-tight">
            Discover your{' '}
            <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-stone-500 bg-clip-text text-transparent">
              authentic self
            </span>
            {' '}through AI
          </h1>

          {/* Supporting Text */}
          <p className="text-[15px] md:text-[18px] text-neutral-700 leading-[1.6] max-w-[620px] mx-auto mb-12">
            Twin Me creates digital twins that capture your true originality - not just your public persona,
            but your complete soul signature through the digital footprints that reveal your genuine curiosities,
            passions, and characteristics.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {!isLoaded ? (
              <button
                disabled
                className="px-8 py-4 rounded-full bg-neutral-200 text-neutral-500 cursor-not-allowed text-base font-medium w-full sm:w-auto"
              >
                Loading...
              </button>
            ) : isSignedIn ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-8 py-4 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 transition-all text-base font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                Launch Dashboard
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
                <button className="px-8 py-4 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 transition-all text-base font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 w-full sm:w-auto justify-center">
                  Try Twin Me yourself
                  <ArrowRight className="w-5 h-5" />
                </button>
              </SignInButton>
            )}
            <button
              onClick={() => navigate('/watch-demo')}
              className="px-8 py-4 rounded-full border-2 border-neutral-700 text-neutral-900 hover:bg-neutral-100 transition-all text-base font-medium w-full sm:w-auto"
            >
              Watch Demo
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mb-20">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-neutral-900 mb-2">
                  {stat.number}
                </div>
                <div className="text-sm text-neutral-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-[36px] md:text-[48px] font-bold text-neutral-900 text-center mb-4">
            Beyond digital cloning
          </h2>
          <p className="text-[15px] md:text-[18px] text-neutral-700 text-center max-w-2xl mx-auto mb-16">
            While public information is easily cloned, it lacks soul. We discover what makes you authentically YOU.
          </p>

          {/* Feature Cards Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group bg-white rounded-3xl p-8 border border-neutral-200 hover:border-neutral-300 transition-all hover:shadow-xl cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-[24px] font-bold text-neutral-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-[15px] text-neutral-700 leading-[1.6]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platforms Section */}
      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-[36px] md:text-[48px] font-bold text-neutral-900 mb-4">
            Connect your digital life
          </h2>
          <p className="text-[15px] md:text-[18px] text-neutral-700 max-w-2xl mx-auto mb-12">
            Integrate with 30+ platforms to build your authentic soul signature
          </p>

          {/* Platform Badges */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {['Spotify', 'YouTube', 'Discord', 'GitHub', 'Netflix', 'Reddit', 'Gmail', 'Slack'].map((platform) => (
              <div
                key={platform}
                className="px-6 py-3 rounded-full bg-white border border-neutral-200 text-neutral-900 text-sm font-medium hover:border-neutral-300 hover:shadow-md transition-all cursor-pointer"
              >
                {platform}
              </div>
            ))}
          </div>
          <div className="text-neutral-600 text-sm">+ 22 more platforms</div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-32 px-6">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-[32px] p-12 md:p-16 shadow-2xl">
          <h2 className="text-[36px] md:text-[48px] font-bold text-white mb-6">
            Ready to discover your soul signature?
          </h2>
          <p className="text-[15px] md:text-[18px] text-neutral-300 mb-8 max-w-2xl mx-auto">
            Start your journey to authentic self-discovery with complete privacy control.
          </p>
          {!isLoaded ? (
            <button
              disabled
              className="px-10 py-5 rounded-full bg-neutral-700 text-neutral-500 cursor-not-allowed text-lg font-medium"
            >
              Loading...
            </button>
          ) : isSignedIn ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-10 py-5 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition-all text-lg font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 inline-flex items-center gap-2"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <SignInButton mode="modal" fallbackRedirectUrl="/get-started" forceRedirectUrl="/get-started">
              <button className="px-10 py-5 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition-all text-lg font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 inline-flex items-center gap-2">
                Get Started Now
                <ArrowRight className="w-5 h-5" />
              </button>
            </SignInButton>
          )}
        </div>
      </section>
    </div>
  );
};
