import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface AwakeningScreenProps {
  onEnter: () => void;
}

/** Subtle awakening chime — two sine tones, very quiet */
function playAwakeningChime() {
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

/** Floating particles around the orb */
function StarField() {
  const stars = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 60,
      y: 30 + (Math.random() - 0.5) * 40,
      size: 1.5 + Math.random() * 2,
      opacity: 0.08 + Math.random() * 0.18,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4,
    }))
  , []);

  return (
    <>
      {stars.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            backgroundColor: `rgba(255,255,255,${s.opacity})`,
            animation: `starDrift ${s.duration}s ease-in-out ${s.delay}s infinite alternate`,
          }}
        />
      ))}
    </>
  );
}

const AwakeningScreen: React.FC<AwakeningScreenProps> = ({ onEnter }) => {
  const { authToken } = useAuth();
  const [message, setMessage] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orbReady, setOrbReady] = useState(false);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chimeRef = useRef(false);

  // Fetch twin's first message
  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const res = await fetch(`${API_URL}/twin/first-message`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        setMessage(data.message || "I'm here. Let's figure each other out.");
      } catch {
        setMessage("I'm here. Let's figure each other out.");
      } finally {
        setLoading(false);
      }
    };
    fetchMessage();
  }, [authToken]);

  // Cinematic sequence: black → orb fades in → text starts
  useEffect(() => {
    const t = setTimeout(() => {
      setOrbReady(true);
      if (!chimeRef.current) {
        chimeRef.current = true;
        playAwakeningChime();
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  // Split message into words and type them out
  useEffect(() => {
    if (!message || loading || !orbReady) return;

    const w = message.split(' ');
    setWords(w);

    let idx = 0;
    const type = () => {
      if (idx < w.length) {
        idx++;
        setVisibleCount(idx);
        typingRef.current = setTimeout(type, 80 + Math.random() * 60);
      } else {
        setDone(true);
      }
    };

    // Start typing after orb has settled
    typingRef.current = setTimeout(type, 1200);

    return () => { if (typingRef.current) clearTimeout(typingRef.current); };
  }, [message, loading, orbReady]);

  // Orb glow intensity grows with word count
  const progress = words.length > 0 ? visibleCount / words.length : 0;
  const orbGlow = 0.06 + progress * 0.14; // 6% → 20%
  const orbScale = 0.85 + progress * 0.15; // 85% → 100%

  return (
    <div
      className="h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: '#0C0C0C' }}
    >
      {/* Floating star particles */}
      <StarField />

      {/* Orb + glow */}
      <div
        className="relative flex-shrink-0 mb-10"
        style={{
          opacity: orbReady ? 1 : 0,
          transform: `scale(${orbReady ? orbScale : 0.5})`,
          transition: 'opacity 2s ease-out, transform 2s ease-out',
        }}
      >
        {/* Outer glow rings */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            width: 280,
            height: 280,
            top: -40,
            left: -40,
            background: `radial-gradient(circle, rgba(255,255,255,${orbGlow * 0.5}) 0%, rgba(255,255,255,${orbGlow * 0.15}) 40%, transparent 70%)`,
            transition: 'background 0.5s ease',
            animation: 'orbBreathe 4s ease-in-out infinite',
          }}
        />
        {/* Inner orb */}
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: `radial-gradient(circle at 40% 35%, rgba(232,224,213,0.35) 0%, rgba(200,195,185,0.15) 40%, rgba(255,255,255,0.04) 70%, transparent 100%)`,
            boxShadow: `0 0 60px rgba(255,255,255,${orbGlow}), 0 0 120px rgba(255,255,255,${orbGlow * 0.4}), inset 0 0 40px rgba(255,255,255,0.05)`,
            transition: 'box-shadow 0.5s ease',
          }}
        />
      </div>

      {/* Text — words fade in individually */}
      <div
        className="max-w-xl px-8 text-center mb-12"
        style={{
          opacity: orbReady && !loading ? 1 : 0,
          transition: 'opacity 1s ease-out 0.5s',
          minHeight: 120,
        }}
      >
        {loading ? (
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        ) : (
          <p
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 'clamp(17px, 2.5vw, 21px)',
              lineHeight: 1.8,
              letterSpacing: '-0.01em',
              color: 'transparent', // hide base, show via spans
            }}
          >
            {words.map((word, i) => (
              <span
                key={i}
                style={{
                  color: i < visibleCount ? 'rgba(255,255,255,0.65)' : 'transparent',
                  transition: 'color 0.4s ease-out',
                  transitionDelay: `${i < visibleCount ? 0 : 0}ms`,
                }}
              >
                {word}{' '}
              </span>
            ))}
            {!done && visibleCount > 0 && (
              <span
                className="inline-block w-px h-4 ml-0.5 animate-pulse align-middle"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
              />
            )}
          </p>
        )}
      </div>

      {/* CTA — fades up when done */}
      <div
        style={{
          opacity: done ? 1 : 0,
          transform: done ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.8s ease-out 0.3s, transform 0.8s ease-out 0.3s',
        }}
      >
        <button
          onClick={onEnter}
          disabled={!done}
          className="flex items-center gap-2.5 disabled:pointer-events-none"
          style={{
            fontFamily: "'Inter', sans-serif",
            backgroundColor: 'rgba(255,255,255,0.92)',
            color: '#0C0C0C',
            borderRadius: '100px',
            padding: '14px 36px',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            border: 'none',
            cursor: done ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 30px rgba(255,255,255,0.06)',
          }}
          onMouseEnter={e => { if (done) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.8)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.92)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Enter your world
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes orbBreathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes starDrift {
          0% { transform: translate(0, 0); opacity: var(--star-opacity, 0.15); }
          100% { transform: translate(${Math.random() > 0.5 ? '' : '-'}8px, ${Math.random() > 0.5 ? '' : '-'}6px); opacity: calc(var(--star-opacity, 0.15) * 0.5); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition-duration: 0s !important; }
        }
      `}</style>
    </div>
  );
};

export default AwakeningScreen;
