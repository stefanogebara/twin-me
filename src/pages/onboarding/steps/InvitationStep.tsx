import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface InvitationStepProps {
  onContinue: () => void;
  onSkip: () => void;
}

// Phrases - single powerful statements
const phrases = [
  "You are more than your resume",
  "More than your LinkedIn",
  "More than what others see",
  "You have a soul signature",
  "Let me find it"
];

// Custom Soul Signature Icon - abstract fingerprint/DNA concept
const SoulIcon = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <motion.circle
      cx="40"
      cy="40"
      r="38"
      stroke="url(#soulGradient)"
      strokeWidth="1"
      strokeDasharray="4 4"
      initial={{ rotate: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
    />
    <motion.path
      d="M25 40C25 40 30 25 40 25C50 25 55 40 55 40C55 40 50 55 40 55C30 55 25 40 25 40Z"
      stroke="url(#soulGradient)"
      strokeWidth="1.5"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 2, ease: "easeInOut" }}
    />
    <motion.path
      d="M30 40C30 40 33 30 40 30C47 30 50 40 50 40C50 40 47 50 40 50C33 50 30 40 30 40Z"
      stroke="url(#soulGradient)"
      strokeWidth="1.5"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 2, delay: 0.3, ease: "easeInOut" }}
    />
    <motion.circle
      cx="40"
      cy="40"
      r="4"
      fill="url(#soulGradient)"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, delay: 1 }}
    />
    <defs>
      <linearGradient id="soulGradient" x1="0" y1="0" x2="80" y2="80">
        <stop offset="0%" stopColor="#E8D5B7" />
        <stop offset="50%" stopColor="#F5E6D3" />
        <stop offset="100%" stopColor="#D4C4A8" />
      </linearGradient>
    </defs>
  </svg>
);

export const InvitationStep: React.FC<InvitationStepProps> = ({ onContinue, onSkip }) => {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (currentPhraseIndex < phrases.length - 1) {
      const timer = setTimeout(() => {
        setCurrentPhraseIndex(prev => prev + 1);
      }, 1800);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShowButton(true), 600);
      return () => clearTimeout(timer);
    }
  }, [currentPhraseIndex]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#0C0C0C]">
      {/* Google Fonts */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400;1,500&family=Space+Grotesk:wght@300;400;500&display=swap');
        `}
      </style>

      {/* Skip button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        whileHover={{ opacity: 0.8 }}
        onClick={onSkip}
        className="absolute top-8 right-8 text-[#8A8A8A] text-sm tracking-wide uppercase transition-colors"
        style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.1em' }}
      >
        Skip
      </motion.button>

      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(232,213,183,0.03) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-6 max-w-3xl">
        {/* Soul Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mb-16"
        >
          <SoulIcon />
        </motion.div>

        {/* Animated phrases */}
        <div className="h-24 md:h-32 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.h1
              key={currentPhraseIndex}
              initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, filter: 'blur(5px)' }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-3xl md:text-5xl lg:text-6xl tracking-tight"
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                color: '#E8D5B7',
                lineHeight: 1.2,
              }}
            >
              {phrases[currentPhraseIndex]}
            </motion.h1>
          </AnimatePresence>
        </div>

        {/* Phrase indicators */}
        <motion.div
          className="flex justify-center gap-2 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {phrases.map((_, idx) => (
            <motion.div
              key={idx}
              className="h-0.5 rounded-full transition-all duration-500"
              style={{
                width: idx === currentPhraseIndex ? '24px' : '8px',
                backgroundColor: idx <= currentPhraseIndex ? '#E8D5B7' : 'rgba(232,213,183,0.2)',
              }}
            />
          ))}
        </motion.div>

        {/* CTA Button */}
        <AnimatePresence>
          {showButton && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mt-16"
            >
              <motion.button
                onClick={onContinue}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative px-10 py-4 rounded-full overflow-hidden transition-all duration-300 flex items-center justify-center gap-3 mx-auto"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                  boxShadow: '0 0 40px rgba(232,213,183,0.2)',
                }}
              >
                <span
                  className="relative z-10 text-[#0C0C0C] text-lg tracking-wide"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}
                >
                  Begin Discovery
                </span>
                <ArrowRight
                  className="w-5 h-5 text-[#0C0C0C] relative z-10 group-hover:translate-x-1 transition-transform duration-300"
                  strokeWidth={2}
                />
              </motion.button>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-6 text-sm tracking-wide"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: 'rgba(232,213,183,0.4)',
                }}
              >
                2 minutes to discover yourself
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default InvitationStep;
