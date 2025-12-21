const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'Step1Welcome.tsx');

const newContent = `import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center relative px-6 py-20" style={{ backgroundColor: 'hsl(var(--claude-bg))' }}>
      <div className="max-w-4xl mx-auto text-center">
        {/* Hero Section */}
        <h1
          className="text-4xl md:text-5xl mb-6"
          style={{
            fontFamily: 'var(--_typography---font--styrene-a)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'hsl(var(--claude-text))'
          }}
        >
          Discover Your Soul Signature
        </h1>

        <p
          className="text-base max-w-3xl mx-auto leading-relaxed mb-8"
          style={{
            color: '#6B7280',
            fontFamily: 'var(--_typography---font--tiempos)'
          }}
        >
          "Perhaps we are searching in the branches for what we only find in the roots." Connect your digital life - Netflix, Spotify, Discord, and 30+ platforms - to discover what makes you authentically you.
        </p>

        {/* Stats Row */}
        <div className="flex justify-center items-center gap-8 mb-12">
          <div className="text-center">
            <div
              className="text-2xl"
              style={{
                color: '#D97706',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              30+
            </div>
            <div
              className="text-sm"
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              Platforms
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-2xl"
              style={{
                color: '#D97706',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              100%
            </div>
            <div
              className="text-sm"
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              Authentic
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-2xl"
              style={{
                color: '#D97706',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500
              }}
            >
              ∞
            </div>
            <div
              className="text-sm"
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              Sharable
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleBegin}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base bg-[hsl(var(--claude-accent))] text-white hover:opacity-90 transition-opacity"
          style={{
            fontFamily: 'var(--_typography---font--styrene-a)',
            fontWeight: 500
          }}
        >
          Begin Your Journey
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Step1Welcome;
`;

try {
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('✅ Successfully applied InstantTwinOnboarding hero design to Step1Welcome.tsx');
  console.log('');
  console.log('Applied design features:');
  console.log('  ✓ Styrene-A font for headings');
  console.log('  ✓ Tiempos font for body text');
  console.log('  ✓ Rami quote: "Perhaps we are searching in the branches..."');
  console.log('  ✓ Stats row: 30+ Platforms, 100% Authentic, ∞ Sharable');
  console.log('  ✓ Orange accent color (#D97706)');
  console.log('  ✓ Light background (hsl(var(--claude-bg)))');
  console.log('  ✓ Clean centered layout');
} catch (error) {
  console.error('Error updating file:', error);
  process.exit(1);
}
