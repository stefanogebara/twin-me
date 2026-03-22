import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import ParticleField from '../components/ParticleField';

interface WelcomeStepProps {
  onBegin: () => void;
}

/**
 * Subtle welcome chime using Web Audio API — no file needed.
 * Two soft sine tones (C5 + E5) with quick decay. Respects reduced motion.
 */
function playWelcomeChime() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.06, now + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 1);
    });

    // Cleanup after sounds finish
    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Web Audio not available — silent fallback
  }
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onBegin }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const chimePlayedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Play chime once content is visible
  useEffect(() => {
    if (visible && !chimePlayedRef.current) {
      chimePlayedRef.current = true;
      // Small delay so it feels intentional, not jarring
      setTimeout(playWelcomeChime, 600);
    }
  }, [visible]);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'you';

  const handleSkipToChat = useCallback(() => {
    navigate('/talk-to-twin');
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Particle field — warm amber floating particles behind content */}
      <div className="absolute inset-0 pointer-events-none">
        <ParticleField />
      </div>

      {/* Ambient glow behind content */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 40%, transparent 70%)',
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
        {/* Flower brand mark — gentle float animation */}
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
            style={{
              animation: visible ? 'welcomeFloat 4s ease-in-out infinite' : 'none',
            }}
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
          style={{
            fontFamily: "'Inter', sans-serif",
            backgroundColor: 'var(--foreground)',
            color: 'var(--primary-foreground)',
            borderRadius: '100px',
            padding: '16px 40px',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            cursor: 'pointer',
            border: 'none',
            boxShadow: '0 4px 24px rgba(255,255,255,0.08)',
            transition: 'all 0.2s ease, opacity 0.8s ease-out 0.8s',
            opacity: visible ? 1 : 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.85';
            e.currentTarget.style.boxShadow = '0 6px 32px rgba(255,255,255,0.12)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Let's go
        </button>

        {/* Skip link for returning users */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.8s ease-out 1.2s',
          }}
        >
          <button
            onClick={handleSkipToChat}
            className="mt-8 text-[12px] transition-opacity hover:opacity-70"
            style={{
              color: 'rgba(255,255,255,0.2)',
              fontFamily: "'Inter', sans-serif",
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Already set up? Skip to chat
          </button>
        </div>
      </div>

      {/* CSS animation for flower float */}
      <style>{`
        @keyframes welcomeFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-6px) rotate(1deg); }
          75% { transform: translateY(4px) rotate(-1deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .welcome-float { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default WelcomeStep;
