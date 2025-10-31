import React from 'react';
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
    <div className="min-h-screen flex items-center justify-center relative px-6 py-20 bg-background">
      <div className="text-center relative z-10 max-w-[900px]">
        <h1
          className="text-[clamp(2.5rem,5vw,4rem)] leading-[1.1] mb-8 text-foreground"
          style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          Discover Your Soul Signature
        </h1>
        <p
          className="text-[20px] text-foreground max-w-[700px] mx-auto mb-12 leading-[1.6]"
          style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
        >
          Beyond your resume and public persona lies your authentic digital identity. We reveal the signature of your originality through your curiosities, passions, and characteristic patterns.
        </p>
        <button
          onClick={handleBegin}
          className="cartoon-button text-lg px-10 py-4 inline-flex items-center gap-2"
        >
          Begin Your Journey
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Step1Welcome;
