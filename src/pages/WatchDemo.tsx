import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Users, MessageCircle, BarChart3, Sparkles } from 'lucide-react';

export default function WatchDemo() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Navigation - Match home page exactly */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-6"
           style={{ backgroundColor: 'var(--_color-theme---background)/90', borderBottom: '1px solid var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="text-2xl font-bold" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Twin AI Learn
            </div>
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => navigate('/')}
                className="relative font-medium transition-all group"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                Home
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 transition-all group-hover:w-full" style={{ backgroundColor: 'var(--_color-theme---accent)' }}></div>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/get-started')}
              className="btn-anthropic-primary"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero with video */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="mb-12">
            <h1 className="u-display-xl text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Watch the Platform in Action
            </h1>
            <p className="text-body-large max-w-3xl mx-auto" style={{ color: 'var(--_color-theme---text)' }}>
              See voice conversations, chat explanations, and progress insights — all in a clean, distraction-free interface.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden bg-black">
                <iframe
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                  title="Twin AI Learn Demo"
                  className="absolute inset-0 w-full h-full"
                  frameBorder="0"
                  allowFullScreen
                />
                {/* Play overlay for visual appeal */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features section - Match home page exactly */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 mb-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--_color-theme---accent)' }}>
                Platform Demo
              </span>
            </div>
            <h2 className="u-display-l text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              What the Demo Shows
            </h2>
            <p className="text-body-large max-w-2xl mx-auto" style={{ color: 'var(--_color-theme---text)' }}>
              Experience the key capabilities that make our AI twins so effective for education
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300"
                 style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <Users className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading text-xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Voice Office Hours
              </h3>
              <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text)' }}>
                Natural, always-available conversations with a Teacher Twin that mirrors the educator's unique style and personality.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300"
                 style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <MessageCircle className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading text-xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Chat Walkthroughs
              </h3>
              <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text)' }}>
                Threaded, context-aware explanations with intelligent retries when confusion is detected automatically.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border hover:shadow-md transition-all duration-300"
                 style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                <BarChart3 className="w-8 h-8" style={{ color: 'var(--_color-theme---text)' }} />
              </div>
              <h3 className="text-heading text-xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Progress Insights
              </h3>
              <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text)' }}>
                Lightweight snapshots highlighting what teaching methods work best for each individual learner over time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Match home page */}
      <section className="py-24 px-6" style={{ backgroundColor: 'var(--_color-theme---card)' }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-12">
            <h2 className="u-display-l text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Ready to Create Your Twin?
            </h2>
            <p className="text-body-large max-w-2xl mx-auto" style={{ color: 'var(--_color-theme---text)' }}>
              It takes just minutes to get started. You can edit and refine everything later as your twin learns.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/get-started')}
              className="btn-anthropic-primary flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Get Started Now
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="btn-anthropic-secondary"
            >
              Contact Us
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}