import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';

interface WelcomeStepProps {
  onBegin: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onBegin }) => {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'you';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
    >
      <div
        className="text-center max-w-lg"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.9s ease-out, transform 0.9s ease-out',
        }}
      >
        {/* Flower brand mark */}
        <div
          className="mb-10 flex justify-center"
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.7s ease-out 0.1s',
          }}
        >
          <img
            src="/images/backgrounds/flower-hero.png"
            alt="Twin Me"
            className="w-16 h-16 object-contain drop-shadow-md"
          />
        </div>

        {/* Main headline */}
        <h1
          style={{
            fontFamily: 'Instrument Serif, Georgia, serif',
            fontWeight: 400,
            letterSpacing: '-0.05em',
            lineHeight: 1.1,
            color: 'var(--foreground)',
            fontSize: 'clamp(48px, 8vw, 80px)',
            marginBottom: '20px',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.8s ease-out 0.3s',
          }}
        >
          Hey {firstName}
        </h1>

        <p
          style={{
            fontFamily: "'Geist', sans-serif",
            fontSize: '14px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.4)',
            lineHeight: 1.65,
            marginBottom: '48px',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.8s ease-out 0.6s',
          }}
        >
          Before your twin wakes up, we need to meet you.
          <br />
          A few minutes. Totally you.
        </p>

        <button
          onClick={onBegin}
          style={{
            fontFamily: "'Geist', sans-serif",
            backgroundColor: '#10b77f',
            color: '#0a0f0a',
            borderRadius: '9999px',
            padding: '14px 28px',
            fontSize: '12px',
            fontWeight: 400,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: 'none',
            transition: 'background-color 0.2s ease, opacity 1s ease-out 1s',
            opacity: visible ? 1 : 0,
          }}
        >
          Begin
        </button>
      </div>
    </div>
  );
};

export default WelcomeStep;
