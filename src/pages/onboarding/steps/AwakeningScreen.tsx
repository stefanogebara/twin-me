import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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

    // Short delay before typing starts
    typingRef.current = setTimeout(type, 600);

    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  }, [message, loading]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a09] text-white px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="max-w-lg w-full"
      >
        {/* Twin avatar */}
        <div className="flex justify-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
            <span className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>T</span>
          </div>
        </div>

        {/* Message */}
        <div className="min-h-[100px] mb-10">
          {loading ? (
            <div className="flex gap-1 justify-center mt-4">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-white/40 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xl text-white/90 leading-relaxed text-center">
              {displayedText}
              {!done && <span className="inline-block w-0.5 h-5 bg-white/60 ml-1 animate-pulse align-middle" />}
            </p>
          )}
        </div>

        {/* CTA — only show after typing finishes */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: done ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        >
          <button
            onClick={onEnter}
            disabled={!done}
            className="w-full py-4 bg-white text-[#0a0a09] rounded-2xl font-semibold text-base hover:bg-white/90 transition-colors disabled:pointer-events-none"
          >
            Enter your world →
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AwakeningScreen;
