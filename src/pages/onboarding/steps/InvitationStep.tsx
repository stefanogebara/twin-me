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
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-stone-950 via-violet-950/30 to-stone-950">
      {/* Skip button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        whileHover={{ opacity: 1 }}
        onClick={onSkip}
        className="absolute top-6 right-6 text-white/60 text-sm hover:text-white transition-colors"
      >
        Skip intro
      </motion.button>

      {/* Animated particles/stars background */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 50 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-violet-400/40 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              scale: Math.random() * 0.5 + 0.5,
            }}
            animate={{
              y: [null, Math.random() * window.innerHeight],
              opacity: [0.2, 0.8, 0.2],
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-6 max-w-2xl">
        {/* Animated constellation icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 1.5, bounce: 0.4 }}
          className="mb-12"
        >
          <div className="w-24 h-24 mx-auto relative">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 30px rgba(139, 92, 246, 0.3)",
                  "0 0 60px rgba(139, 92, 246, 0.5)",
                  "0 0 30px rgba(139, 92, 246, 0.3)",
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-full h-full rounded-full bg-gradient-to-br from-violet-500 via-pink-500 to-amber-500 flex items-center justify-center"
            >
              <Sparkles className="w-12 h-12 text-white" />
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
              className="text-3xl md:text-4xl lg:text-5xl font-heading text-white tracking-tight"
              style={{ fontWeight: 400 }}
            >
              {phrases[currentPhraseIndex]}
            </motion.h1>
          </AnimatePresence>
        </div>

        {/* CTA Button */}
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
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className="group relative px-8 py-4 bg-gradient-to-r from-violet-600 to-pink-600 text-white rounded-full font-medium text-lg shadow-2xl shadow-violet-500/30 overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-violet-500 to-pink-500"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
                <span className="relative flex items-center gap-2">
                  Begin Discovery
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-6 text-white/40 text-sm"
              >
                Takes about 2 minutes
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-stone-950 to-transparent" />
    </div>
  );
};

export default InvitationStep;
