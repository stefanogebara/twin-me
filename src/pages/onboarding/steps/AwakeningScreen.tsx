import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowRight, Brain, Music, Calendar } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface AwakeningScreenProps {
  onEnter: () => void;
}

/** Subtle chime — G4 + C5 */
function playChime() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [392, 523.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.3);
      gain.gain.linearRampToValueAtTime(0.04, now + i * 0.3 + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.3 + 1.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 2);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch {}
}

/** Floating particles */
function Stars() {
  const stars = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      y: 5 + Math.random() * 50,
      size: 1 + Math.random() * 2.5,
      opacity: 0.06 + Math.random() * 0.14,
      dur: 3 + Math.random() * 5,
      delay: Math.random() * 4,
    }))
  , []);
  return <>
    {stars.map(s => (
      <div key={s.id} className="absolute rounded-full" style={{
        left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size,
        backgroundColor: `rgba(255,255,255,${s.opacity})`,
        animation: `starFloat ${s.dur}s ease-in-out ${s.delay}s infinite alternate`,
      }} />
    ))}
  </>;
}

const GLASS = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '16px',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
} as const;

const AwakeningScreen: React.FC<AwakeningScreenProps> = ({ onEnter }) => {
  const { authToken } = useAuth();
  const [shortMessage, setShortMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [cardsIn, setCardsIn] = useState(false);
  const [buttonIn, setButtonIn] = useState(false);
  const chimeRef = useRef(false);

  // Fetch twin's first message — but only use first sentence
  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const res = await fetch(`${API_URL}/twin/first-message`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        const full = data.message || "I'm here. Built from everything you've shared.";
        // Take only the first sentence — no wall of text
        const firstSentence = full.split(/[.!?]/).filter(Boolean)[0]?.trim();
        setShortMessage((firstSentence || full.slice(0, 80)) + '.');
      } catch {
        setShortMessage("I'm here. Built from everything you've shared.");
      }
    };
    fetchMessage();
  }, [authToken]);

  // Cinematic sequence
  useEffect(() => {
    const t1 = setTimeout(() => {
      setVisible(true);
      if (!chimeRef.current) { chimeRef.current = true; playChime(); }
    }, 600);
    const t2 = setTimeout(() => setCardsIn(true), 2000);
    const t3 = setTimeout(() => setButtonIn(true), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      className="h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #13121a 0%, #0e0e14 50%, #0a0a10 100%)',
      }}
    >
      <Stars />

      {/* Orb */}
      <div
        className="relative mb-6 flex-shrink-0"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.6)',
          transition: 'all 1.8s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Outer glow */}
        <div className="absolute" style={{
          width: 320, height: 320, top: -60, left: -60,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 40%, transparent 70%)',
          animation: 'orbBreathe 4s ease-in-out infinite',
        }} />
        {/* Core */}
        <div style={{
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, rgba(240,235,225,0.3) 0%, rgba(200,195,190,0.12) 35%, rgba(255,255,255,0.03) 65%, transparent 100%)',
          boxShadow: '0 0 80px rgba(255,255,255,0.1), 0 0 160px rgba(255,255,255,0.04), inset 0 0 60px rgba(255,255,255,0.04)',
        }} />
      </div>

      {/* Short message — ONE sentence, not a paragraph */}
      <p
        className="text-center max-w-md px-6 mb-10"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 'clamp(18px, 2.5vw, 22px)',
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.55)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'all 1.2s ease-out 0.8s',
        }}
      >
        {shortMessage || '\u00A0'}
      </p>

      {/* Glass insight cards — show what the twin already knows */}
      <div
        className="flex gap-4 px-6 mb-10 flex-wrap justify-center"
        style={{
          opacity: cardsIn ? 1 : 0,
          transform: cardsIn ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease-out',
        }}
      >
        {[
          { icon: Brain, label: 'Your memories', value: 'Already learning' },
          { icon: Music, label: 'Your music', value: 'Patterns detected' },
          { icon: Calendar, label: 'Your rhythm', value: 'Syncing up' },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-3 px-5 py-4"
            style={{ ...GLASS, minWidth: 180 }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <div>
              <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}>
                {label}
              </p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif" }}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{
        opacity: buttonIn ? 1 : 0,
        transform: buttonIn ? 'translateY(0)' : 'translateY(12px)',
        transition: 'all 0.8s ease-out',
      }}>
        <button
          onClick={onEnter}
          className="flex items-center gap-2.5"
          style={{
            fontFamily: "'Inter', sans-serif",
            backgroundColor: 'rgba(255,255,255,0.92)',
            color: '#0e0e14',
            borderRadius: '100px',
            padding: '14px 36px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 30px rgba(255,255,255,0.06)',
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.8)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.92)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Enter your world
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <style>{`
        @keyframes orbBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes starFloat {
          0% { transform: translate(0, 0); }
          100% { transform: translate(6px, -4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default AwakeningScreen;
