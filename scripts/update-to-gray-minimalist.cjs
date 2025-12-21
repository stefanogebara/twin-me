const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'Step1Welcome.tsx');

const newContent = `import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, User, Heart, Zap } from 'lucide-react';

interface Step1WelcomeProps {
  onNext?: () => void;
  onPrev?: () => void;
  goToStep?: (step: number) => void;
}

const Step1Welcome: React.FC<Step1WelcomeProps> = ({ onNext }) => {
  const navigate = useNavigate();

  const handleBegin = () => {
    if (onNext) {
      onNext();
    } else {
      navigate('/onboarding/about');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-20 relative overflow-hidden" style={{ background: '#FAFAFA' }}>
      {/* Ultra-subtle gray gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 right-0 w-[900px] h-[900px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0, 0, 0, 0.02) 0%, rgba(250, 250, 250, 0) 60%)',
            filter: 'blur(100px)',
            transform: 'translate(35%, -35%)'
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[700px] h-[700px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0, 0, 0, 0.015) 0%, rgba(250, 250, 250, 0) 65%)',
            filter: 'blur(80px)',
            transform: 'translate(-25%, 25%)'
          }}
        />
      </div>

      <div className="w-full max-w-6xl space-y-16 relative z-10">
        {/* Eyebrow text */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-stone-600 bg-white/60 backdrop-blur-md border border-stone-200/60 shadow-sm">
            <Sparkles className="w-4 h-4 text-stone-400" />
            <span>Discover your authentic digital identity</span>
          </div>
        </div>

        {/* Main headline - minimalist gray */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-normal tracking-tight text-stone-900 text-center leading-[1.1] font-garamond">
          Beyond your resume<br />
          <span className="text-stone-500">lies your</span>{' '}
          <span className="text-stone-700 font-medium">
            soul signature
          </span>
        </h1>

        {/* Supporting copy */}
        <p className="text-lg sm:text-xl leading-relaxed text-stone-600 text-center max-w-2xl mx-auto font-light">
          We reveal the signature of your originality through your digital footprints—your Netflix binges, Spotify moods, GitHub commits, and Discord conversations.
        </p>

        {/* Liquid Glass Showcase Card - True glassmorphism */}
        <div className="flex justify-center px-4">
          <div
            className="relative w-full max-w-3xl rounded-3xl overflow-hidden"
            style={{
              background: 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
            }}
          >
            {/* Subtle highlight overlay */}
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 50%)',
              }}
            />

            <div className="relative p-8 sm:p-10">
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-medium text-stone-900 mb-2">Your Soul Signature Reveals</h3>
                  <p className="text-sm text-stone-500">Authentic patterns only you possess</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Personal Identity Card */}
                  <div
                    className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          background: 'rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <Heart className="w-6 h-6 text-stone-600" />
                      </div>
                      <h4 className="text-base font-medium text-stone-900">Personal Identity</h4>
                      <p className="text-sm text-stone-600">Your unique tastes and preferences</p>
                    </div>
                  </div>

                  {/* Curiosity Profile Card */}
                  <div
                    className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          background: 'rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <Zap className="w-6 h-6 text-stone-600" />
                      </div>
                      <h4 className="text-base font-medium text-stone-900">Curiosity Profile</h4>
                      <p className="text-sm text-stone-600">What makes you intellectually alive</p>
                    </div>
                  </div>

                  {/* Authentic You Card */}
                  <div
                    className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          background: 'rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <User className="w-6 h-6 text-stone-600" />
                      </div>
                      <h4 className="text-base font-medium text-stone-900">Authentic You</h4>
                      <p className="text-sm text-stone-600">Beyond your public persona</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Platform name scroll */}
        <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
          {[
            'Netflix', 'Spotify', 'GitHub', 'Discord', 'LinkedIn',
            'Reddit', 'Gmail', 'YouTube', 'Twitch', 'Steam'
          ].map((platform) => (
            <span
              key={platform}
              className="px-4 py-2 text-sm font-medium text-stone-500 bg-white/50 backdrop-blur-sm rounded-lg border border-stone-200/60 hover:bg-white/70 hover:text-stone-700 hover:border-stone-300/60 transition-all duration-200"
            >
              {platform}
            </span>
          ))}
        </div>

        {/* CTA Button - minimalist gray/black */}
        <div className="flex flex-col items-center gap-6 pt-8">
          <button
            onClick={handleBegin}
            className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 text-base font-medium text-white rounded-2xl transition-all duration-300 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-stone-400 shadow-lg hover:shadow-xl"
            style={{
              background: 'linear-gradient(135deg, #1C1C1C 0%, #0A0A0A 100%)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
          >
            <span className="relative z-10">Begin Your Journey</span>
            <ArrowRight className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1" />

            {/* Subtle inner glow on hover */}
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)',
              }}
            />
          </button>

          {/* Feature Pills */}
          <div className="flex items-center gap-6 text-sm text-stone-500">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
              <span>30+ platforms</span>
            </div>
            <div className="w-px h-4 bg-stone-300" />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
              <span>Complete privacy</span>
            </div>
            <div className="w-px h-4 bg-stone-300" />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
              <span>100% authentic</span>
            </div>
          </div>
        </div>

        {/* Social proof or quote */}
        <div className="text-center pt-12">
          <p className="text-sm italic text-stone-500 max-w-xl mx-auto">
            "Perhaps we are searching in the branches for what we only find in the roots."
            <span className="block text-xs mt-2 not-italic text-stone-400">— Rami</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Step1Welcome;
`;

fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ Step1Welcome.tsx updated to minimalist gray design!');
console.log('   - Changed background from #FEFFFC to #FAFAFA (light gray)');
console.log('   - Removed all light blue colors (#87CEEB, #B0D8F0, etc.)');
console.log('   - Updated liquid glass to transparent gray (rgba(255, 255, 255, 0.4))');
console.log('   - Increased backdrop blur to 24px for stronger glass effect');
console.log('   - Changed all accents to stone-gray tones');
console.log('   - Updated CTA button to dark gray/black gradient');
console.log('   - Made "soul signature" text simple gray instead of gradient');
console.log('   - Updated all icon colors to stone-600 (neutral gray)');
console.log('   - Applied subtle black/gray shadows instead of blue');
