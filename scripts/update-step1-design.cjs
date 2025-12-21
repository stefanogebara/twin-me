const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'Step1Welcome.tsx');

const newContent = `import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Music, Linkedin } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center px-6 py-20 bg-white">
      <div className="max-w-6xl mx-auto w-full relative">
        {/* Floating Platform Cards with Glass Morphism */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Gmail Box - Top Left */}
          <div
            className="absolute top-8 left-8 w-32 h-32 rounded-2xl shadow-lg transform rotate-6 transition-all hover:rotate-3"
            style={{
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(139, 92, 246, 0.1)',
              boxShadow: '0 8px 32px rgba(139, 92, 246, 0.1)'
            }}
          >
            <div className="flex items-center justify-center h-full">
              <Mail className="w-12 h-12 text-violet-500" />
            </div>
          </div>

          {/* Spotify Box - Top Right */}
          <div
            className="absolute top-16 right-16 w-36 h-36 rounded-2xl shadow-lg transform -rotate-6 transition-all hover:-rotate-3"
            style={{
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(139, 92, 246, 0.1)',
              boxShadow: '0 8px 32px rgba(139, 92, 246, 0.1)'
            }}
          >
            <div className="flex items-center justify-center h-full">
              <Music className="w-14 h-14 text-violet-500" />
            </div>
          </div>

          {/* LinkedIn Box - Bottom Left */}
          <div
            className="absolute bottom-24 left-20 w-32 h-32 rounded-2xl shadow-lg transform rotate-12 transition-all hover:rotate-6"
            style={{
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(139, 92, 246, 0.1)',
              boxShadow: '0 8px 32px rgba(139, 92, 246, 0.1)'
            }}
          >
            <div className="flex items-center justify-center h-full">
              <Linkedin className="w-12 h-12 text-violet-500" />
            </div>
          </div>
        </div>

        {/* Central Content */}
        <div className="text-center relative z-10 max-w-3xl mx-auto">
          <h1
            className="text-5xl md:text-6xl mb-6 tracking-tight"
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500,
              color: '#1a1a1a',
              letterSpacing: '-0.02em',
              lineHeight: 1.1
            }}
          >
            Beyond Your Resume <br />and Soul
          </h1>

          <p
            className="text-lg max-w-2xl mx-auto leading-relaxed mb-10"
            style={{
              color: '#666',
              fontFamily: 'var(--_typography---font--tiempos)',
              lineHeight: 1.7
            }}
          >
            Discover your authentic digital identity. Connect Gmail, Spotify, LinkedIn,
            and 30+ platforms to reveal your soul signature—the patterns, curiosities,
            and characteristics that make you uniquely you.
          </p>

          {/* CTA Button with violet accent */}
          <button
            onClick={handleBegin}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base text-white transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500,
              boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(139, 92, 246, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(139, 92, 246, 0.3)';
            }}
          >
            Begin Your Journey
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Feature Pills */}
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <div
              className="px-4 py-2 rounded-full text-sm"
              style={{
                background: 'rgba(139, 92, 246, 0.05)',
                color: '#8B5CF6',
                border: '1px solid rgba(139, 92, 246, 0.1)',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              30+ Platforms
            </div>
            <div
              className="px-4 py-2 rounded-full text-sm"
              style={{
                background: 'rgba(139, 92, 246, 0.05)',
                color: '#8B5CF6',
                border: '1px solid rgba(139, 92, 246, 0.1)',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              Complete Privacy
            </div>
            <div
              className="px-4 py-2 rounded-full text-sm"
              style={{
                background: 'rgba(139, 92, 246, 0.05)',
                color: '#8B5CF6',
                border: '1px solid rgba(139, 92, 246, 0.1)',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              100% Authentic
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step1Welcome;
`;

try {
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('✅ Step1Welcome.tsx updated successfully with glass morphism design!');
  console.log('   - White background');
  console.log('   - Glass morphism Gmail/Spotify/LinkedIn boxes');
  console.log('   - Violet accent colors');
  console.log('   - "Beyond Your Resume and Soul" heading');
} catch (error) {
  console.error('❌ Error updating file:', error.message);
  process.exit(1);
}
