import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

interface InvitationStepProps {
  onContinue: () => void;
  onSkip: () => void;
}

const phrases = [
  "Every person has a unique signature",
  "Not just what you do...",
  "...but who you truly are",
  "Your digital footprint tells a story",
  "Let's discover yours"
];

export const InvitationStep: React.FC<InvitationStepProps> = ({ onContinue, onSkip }) => {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (currentPhraseIndex < phrases.length - 1) {
      const timer = setTimeout(() => {
        setCurrentPhraseIndex(prev => prev + 1);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShowButton(true), 800);
      return () => clearTimeout(timer);
    }
  }, [currentPhraseIndex]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#232320]">
      {/* Skip button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        whileHover={{ opacity: 1 }}
        onClick={onSkip}
        className="absolute top-6 right-6 text-[rgba(193,192,182,0.5)] text-sm hover:text-[#C1C0B6] transition-colors font-ui"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        Skip intro
      </motion.button>

      {/* Subtle animated particles/stars background */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-0.5 h-0.5 bg-[rgba(193,192,182,0.3)] rounded-full"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1280),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
              scale: Math.random() * 0.5 + 0.5,
            }}
            animate={{
              y: [null, Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800)],
              opacity: [0.1, 0.4, 0.1],
            }}
            transition={{
              duration: Math.random() * 15 + 15,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-6 max-w-2xl">
        {/* Refined icon - no garish gradient */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 1.5, bounce: 0.4 }}
          className="mb-12"
        >
          <div className="w-20 h-20 mx-auto relative">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 30px rgba(193,192,182,0.1)",
                  "0 0 50px rgba(193,192,182,0.15)",
                  "0 0 30px rgba(193,192,182,0.1)",
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-full h-full rounded-full bg-[rgba(193,192,182,0.12)] border border-[rgba(193,192,182,0.2)] flex items-center justify-center backdrop-blur-sm"
            >
              <Sparkles className="w-9 h-9 text-[#C1C0B6]" strokeWidth={1.5} />
            </motion.div>
          </div>
        </motion.div>

        {/* Animated phrases */}
        <div className="h-32 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.h1
              key={currentPhraseIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="text-3xl md:text-4xl lg:text-5xl text-[#C1C0B6] tracking-tight"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 400 }}
            >
              {phrases[currentPhraseIndex]}
            </motion.h1>
          </AnimatePresence>
        </div>

        {/* CTA Button - refined, no garish gradient */}
        <AnimatePresence>
          {showButton && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-12"
            >
              <motion.button
                onClick={onContinue}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                className="group relative px-8 py-4 bg-[#C1C0B6] text-[#232320] rounded-xl font-medium text-base overflow-hidden transition-all duration-300 flex items-center justify-center gap-2 hover:bg-[#D4D3CC] shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                <span className="relative z-10">Begin Discovery</span>
                <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform duration-300" strokeWidth={2} />

                {/* Subtle shine effect on hover */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6 }}
                />
              </motion.button>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-6 text-[rgba(193,192,182,0.4)] text-sm"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                Takes about 2 minutes
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Subtle gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#1a1a18] to-transparent" />
    </div>
  );
};

export default InvitationStep;
