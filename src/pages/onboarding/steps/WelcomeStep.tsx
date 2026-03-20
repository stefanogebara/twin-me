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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient glow behind content */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,132,0,0.08) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -55%)',
        }}
      />

      <div
        className="text-center max-w-lg relative z-10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.9s ease-out, transform 0.9s ease-out',
        }}
      >
        {/* Flower brand mark */}
        <div
          className="mb-8 flex justify-center"
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.7s ease-out 0.1s',
          }}
        >
          <img
            src="/images/backgrounds/flower-hero.png"
            alt="Twin Me"
            className="w-20 h-20 object-contain drop-shadow-lg"
          />
        </div>

        {/* Main headline */}
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontWeight: 400,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            color: 'var(--foreground)',
            fontSize: 'clamp(48px, 8vw, 72px)',
            marginBottom: '20px',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.8s ease-out 0.3s',
          }}
        >
          Hey {firstName}
        </h1>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '15px',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.7,
            marginBottom: '44px',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.8s ease-out 0.6s',
          }}
        >
          Before your twin wakes up, we need to meet you.
          <br />
          A few minutes. Totally you.
        </p>

        {/* CTA — brand orange, warm pill */}
        <button
          onClick={onBegin}
          className="group"
          style={{
            fontFamily: "'Inter', sans-serif",
            backgroundColor: '#ff8400',
            color: '#fff',
            borderRadius: '100px',
            padding: '16px 36px',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            cursor: 'pointer',
            border: 'none',
            boxShadow: '0 4px 24px rgba(255,132,0,0.25)',
            transition: 'all 0.2s ease, opacity 0.8s ease-out 0.8s',
            opacity: visible ? 1 : 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#e67600';
            e.currentTarget.style.boxShadow = '0 6px 32px rgba(255,132,0,0.35)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#ff8400';
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(255,132,0,0.25)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Let's go
        </button>
      </div>
    </div>
  );
};

export default WelcomeStep;
