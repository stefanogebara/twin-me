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
    <div className="min-h-screen flex items-center justify-center px-6 py-20 bg-stone-100">
      <div className="w-full max-w-3xl space-y-8">
        <h1 className="text-4xl md:text-5xl font-normal tracking-tight text-stone-900 text-center font-garamond leading-tight">
          Beyond Your Resume<br />and Soul
        </h1>

        <p className="text-[17px] leading-7 text-stone-700 text-center max-w-2xl mx-auto">
          Discover your authentic digital identity. Connect Gmail, Spotify, LinkedIn,
          and 30+ platforms to reveal your soul signature—the patterns, curiosities,
          and characteristics that make you uniquely you.
        </p>

        {/* Static Platform Icons with Glass Morphism */}
        <div className="flex justify-center items-center gap-6 py-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}
          >
            <Mail className="w-10 h-10 text-stone-600" />
          </div>
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}
          >
            <Music className="w-10 h-10 text-stone-600" />
          </div>
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}
          >
            <Linkedin className="w-10 h-10 text-stone-600" />
          </div>
        </div>

        {/* CTA Button matching Cofounder style */}
        <div className="flex justify-center">
          <button
            onClick={handleBegin}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-stone-900/10 group"
          >
            Begin Your Journey
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Feature Pills matching Cofounder style */}
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <div className="px-4 py-2 rounded-full text-sm text-stone-700 bg-white border border-stone-200">
            30+ Platforms
          </div>
          <div className="px-4 py-2 rounded-full text-sm text-stone-700 bg-white border border-stone-200">
            Complete Privacy
          </div>
          <div className="px-4 py-2 rounded-full text-sm text-stone-700 bg-white border border-stone-200">
            100% Authentic
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
  console.log('✅ Step1Welcome.tsx updated with clean, static design!');
  console.log('   - Removed floating/animated cards');
  console.log('   - Static platform icons with Apple glass morphism');
  console.log('   - Cofounder design framework (stone colors, garamond)');
  console.log('   - Clean, centered layout');
  console.log('   - "Beyond Your Resume and Soul" heading');
} catch (error) {
  console.error('❌ Error updating file:', error.message);
  process.exit(1);
}
