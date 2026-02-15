import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface InspirationAnimationProps {
  onComplete?: () => void;
  autoStart?: boolean;
}

const messages = [
  "hey,",
  "remember...",
  "you only get one life",
  "make sure you do something cool with it",
  "or dont"
];

export const InspirationAnimation: React.FC<InspirationAnimationProps> = ({
  onComplete,
  autoStart = true
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isPlaying || isComplete) return;

    if (currentIndex < messages.length - 1) {
      // Show each message for 1.5 seconds
      const timer = setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 1500);

      return () => clearTimeout(timer);
    } else {
      // After last message, wait 2 seconds then complete
      const timer = setTimeout(() => {
        setIsComplete(true);
        onComplete?.();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, isPlaying, isComplete, onComplete]);

  if (isComplete && !autoStart) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FAFAFA]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center px-8"
        >
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-stone-900">
            {messages[currentIndex]}
          </h1>
        </motion.div>
      </AnimatePresence>

      {/* Skip button */}
      {!isComplete && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={() => {
            setIsComplete(true);
            onComplete?.();
          }}
          className="absolute bottom-8 right-8 px-6 py-3 text-sm text-stone-600 hover:text-stone-900 transition-colors"
        >
          Skip
        </motion.button>
      )}

      {/* Progress indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
        {messages.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
              index === currentIndex
                ? 'bg-stone-900 w-8'
                : index < currentIndex
                ? 'bg-stone-400'
                : 'bg-stone-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
