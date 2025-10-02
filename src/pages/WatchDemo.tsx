import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Heart, Sparkles, TrendingUp, Lock } from 'lucide-react';

export default function WatchDemo() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F5' }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-6"
           style={{ backgroundColor: '#FAF9F5', borderBottom: '1px solid rgba(20,20,19,0.1)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="text-2xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
              Twin Me
            </div>
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => navigate('/')}
                className="font-medium"
                style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#141413' }}
              >
                Home
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
            <h1 className="text-5xl md:text-6xl mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
              Your Soul Signature in Action
            </h1>
            <p className="text-lg max-w-3xl mx-auto" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
              Watch how Twin Me discovers your authentic self through the digital footprints that reveal your true curiosities, passions, and unique patterns.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
              <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden bg-black">
                <iframe
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                  title="Twin Me Soul Signature Demo"
                  className="absolute inset-0 w-full h-full"
                  frameBorder="0"
                  allowFullScreen
                />
                {/* Play overlay for visual appeal */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D97706' }}>
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-2 mb-4" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
              <span className="text-sm font-medium" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#D97706' }}>
                Soul Signature Demo
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
              Discover Your Authentic Self
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
              Experience how Twin Me captures the signature of your originality through personal and professional patterns
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm border"
                 style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: '#FAF9F5' }}>
                <Heart className="w-8 h-8" style={{ color: '#D97706' }} />
              </div>
              <h3 className="text-xl mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                Personal Soul Extraction
              </h3>
              <p className="leading-relaxed" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                Connect entertainment platforms like Spotify, Netflix, and YouTube to reveal your authentic curiosities, narrative preferences, and genuine interests.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border"
                 style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: '#FAF9F5' }}>
                <TrendingUp className="w-8 h-8" style={{ color: '#D97706' }} />
              </div>
              <h3 className="text-xl mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                Dual-Mode Identity
              </h3>
              <p className="leading-relaxed" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                Switch between your Personal Soul and Professional Identity. Chat with your twin and test its authenticity with customized scenarios.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border"
                 style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
              <div className="mb-6 p-3 rounded-xl w-fit" style={{ backgroundColor: '#FAF9F5' }}>
                <Lock className="w-8 h-8" style={{ color: '#D97706' }} />
              </div>
              <h3 className="text-xl mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                Privacy Spectrum Control
              </h3>
              <p className="leading-relaxed" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                Control exactly what your twin reveals with intensity sliders for every life cluster. Different privacy settings for different audiences.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-12">
            <h2 className="text-4xl md:text-5xl mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
              Ready to Discover Your Soul Signature?
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
              Connect your platforms and watch as your digital twin emerges—capturing the patterns and curiosities that make you authentically you.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/get-started')}
              className="btn-anthropic-primary flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Start Discovery
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