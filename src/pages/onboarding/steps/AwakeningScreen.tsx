import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface AwakeningScreenProps {
  onEnter: () => void;
}

const AwakeningScreen: React.FC<AwakeningScreenProps> = ({ onEnter }) => {
  const { authToken } = useAuth();
  const [message, setMessage] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Word-by-word typewriter once message is ready
  useEffect(() => {
    if (!message || loading) return;

    const words = message.split(' ');
    let idx = 0;

    const type = () => {
      if (idx < words.length) {
        setDisplayedText(words.slice(0, idx + 1).join(' '));
        idx++;
        typingRef.current = setTimeout(type, 60 + Math.random() * 50);
      } else {
        setDone(true);
      }
    };

    typingRef.current = setTimeout(type, 600);

    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  }, [message, loading]);

  return (
    <div
      className="h-screen flex flex-col items-center px-6 py-10"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-lg flex flex-col min-h-0 flex-1"
      >
        {/* Flower card — fixed-height hero visual */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1 }}
          className="w-full mb-8 overflow-hidden flex-shrink-0"
          style={{ borderRadius: '28px', height: '220px' }}
        >
          <img
            src="/images/backgrounds/flower-card-4.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Message — scrollable so long AI responses don't push CTA off screen */}
        <div className="flex-1 overflow-y-auto mb-8 w-full text-center scrollbar-hide">
          {loading ? (
            <div className="flex gap-2 justify-center mt-2">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: 'rgba(0,0,0,0.25)', animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          ) : (
            <p
              style={{
                fontFamily: 'Halant, Georgia, serif',
                fontWeight: 400,
                fontSize: 'clamp(18px, 3vw, 24px)',
                letterSpacing: '-0.02em',
                lineHeight: 1.4,
                color: 'var(--foreground)',
              }}
            >
              {displayedText}
              {!done && (
                <span
                  className="inline-block w-0.5 h-5 ml-1 animate-pulse align-middle"
                  style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
                />
              )}
            </p>
          )}
        </div>

        {/* CTA — pinned at bottom, always visible */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: done ? 1 : 0 }}
          transition={{ duration: 0.6 }}
          className="w-full flex justify-center flex-shrink-0"
        >
          <button
            onClick={onEnter}
            disabled={!done}
            className="flex items-center gap-2 disabled:pointer-events-none"
            style={{
              fontFamily: "'Geist', sans-serif",
              backgroundColor: 'var(--foreground)',
              color: 'var(--foreground)',
              borderRadius: '9999px',
              padding: '14px 32px',
              fontSize: '12px',
              fontWeight: 400,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: done ? 'pointer' : 'default',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={e => { if (done) e.currentTarget.style.backgroundColor = 'var(--foreground)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--foreground)'; }}
          >
            Enter your world
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AwakeningScreen;
