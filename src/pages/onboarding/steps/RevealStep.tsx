import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface RevealStepProps {
  connectedPlatforms: string[];
  questionsAnswered?: number;
  onComplete: () => void;
}

const processingSteps = [
  { id: 'gathering', label: 'Gathering your digital footprints', duration: 2000 },
  { id: 'analyzing', label: 'Analyzing behavioral patterns', duration: 2500 },
  { id: 'mapping', label: 'Mapping personality correlations', duration: 2000 },
  { id: 'synthesizing', label: 'Synthesizing your soul signature', duration: 3000 },
];

// Constellation animation component - refined with muted colors
const ConstellationAnimation: React.FC<{ phase: 'processing' | 'revealing' | 'complete' }> = ({ phase }) => {
  const [stars, setStars] = useState<{ x: number; y: number; size: number; delay: number }[]>([]);
  const [connections, setConnections] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  useEffect(() => {
    // Generate random stars
    const newStars = Array.from({ length: 12 }).map((_, i) => ({
      x: 100 + Math.random() * 200,
      y: 50 + Math.random() * 200,
      size: Math.random() * 2.5 + 1.5,
      delay: i * 0.2,
    }));
    setStars(newStars);

    // Generate connections between nearby stars
    if (phase !== 'processing') {
      const newConnections: typeof connections = [];
      newStars.forEach((star, i) => {
        newStars.slice(i + 1).forEach((otherStar) => {
          const distance = Math.sqrt(
            Math.pow(star.x - otherStar.x, 2) + Math.pow(star.y - otherStar.y, 2)
          );
          if (distance < 100 && Math.random() > 0.5) {
            newConnections.push({
              x1: star.x,
              y1: star.y,
              x2: otherStar.x,
              y2: otherStar.y,
            });
          }
        });
      });
      setConnections(newConnections);
    }
  }, [phase]);

  return (
    <svg viewBox="0 0 400 300" className="w-full h-full max-w-md mx-auto opacity-80">
      {/* Gradient definitions - muted, elegant colors */}
      <defs>
        <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(193, 192, 182, 0.4)" />
          <stop offset="100%" stopColor="rgba(193, 192, 182, 0)" />
        </radialGradient>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(193, 192, 182, 0.3)" />
          <stop offset="100%" stopColor="rgba(193, 192, 182, 0.2)" />
        </linearGradient>
      </defs>

      {/* Connection lines */}
      {phase !== 'processing' && connections.map((conn, i) => (
        <motion.line
          key={i}
          x1={conn.x1}
          y1={conn.y1}
          x2={conn.x2}
          y2={conn.y2}
          stroke="url(#lineGradient)"
          strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.4 }}
          transition={{ duration: 0.8, delay: 0.5 + i * 0.1 }}
        />
      ))}

      {/* Stars */}
      {stars.map((star, i) => (
        <motion.g key={i}>
          {/* Glow */}
          <motion.circle
            cx={star.x}
            cy={star.y}
            r={star.size * 3}
            fill="url(#starGlow)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: phase === 'processing' ? [1, 1.2, 1] : 1,
              opacity: phase === 'processing' ? [0.2, 0.4, 0.2] : 0.3,
            }}
            transition={{
              duration: 2,
              delay: star.delay,
              repeat: phase === 'processing' ? Infinity : 0,
            }}
          />
          {/* Core */}
          <motion.circle
            cx={star.x}
            cy={star.y}
            r={star.size}
            fill="#C1C0B6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: star.delay }}
          />
        </motion.g>
      ))}

      {/* Center focal point when complete */}
      {phase === 'complete' && (
        <motion.circle
          cx="200"
          cy="150"
          r="25"
          fill="url(#starGlow)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 0.5, 0.3] }}
          transition={{ duration: 1 }}
        />
      )}
    </svg>
  );
};

export const RevealStep: React.FC<RevealStepProps> = ({ connectedPlatforms, questionsAnswered = 0, onComplete }) => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [phase, setPhase] = useState<'processing' | 'revealing' | 'complete'>('processing');

  // Process through the animation steps
  useEffect(() => {
    if (phase !== 'processing') return;

    let totalTime = 0;
    processingSteps.forEach((step, index) => {
      setTimeout(() => {
        setCurrentStepIndex(index);
      }, totalTime);
      totalTime += step.duration;
    });

    // Transition to revealing phase
    setTimeout(() => {
      setPhase('revealing');
    }, totalTime);

    // Complete after revealing
    setTimeout(() => {
      setPhase('complete');
    }, totalTime + 2000);
  }, [phase]);

  const handleViewSignature = () => {
    onComplete();

    // If user is authenticated, go directly to soul signature
    // If not, go to auth with redirect parameter so they come back here after login
    if (isSignedIn) {
      navigate('/soul-signature');
    } else {
      // Encode the redirect destination for after auth
      navigate('/auth?redirect=' + encodeURIComponent('/soul-signature'));
    }
  };

  const progress = phase === 'processing'
    ? ((currentStepIndex + 1) / processingSteps.length) * 100
    : 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#232320] px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* Processing phase */}
        <AnimatePresence mode="wait">
          {phase === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              {/* Constellation animation */}
              <div className="h-64 mb-12">
                <ConstellationAnimation phase={phase} />
              </div>

              {/* Progress */}
              <div className="mb-8">
                <div className="h-0.5 bg-[rgba(193,192,182,0.15)] rounded-full overflow-hidden mb-6">
                  <motion.div
                    className="h-full bg-[#C1C0B6]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>

                <motion.p
                  key={currentStepIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[#C1C0B6] text-base font-ui mb-3"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  {processingSteps[currentStepIndex]?.label}...
                </motion.p>

                <p className="text-[rgba(193,192,182,0.5)] text-sm font-ui" style={{ fontFamily: 'var(--font-ui)' }}>
                  {connectedPlatforms.length > 0
                    ? `Analyzing data across ${connectedPlatforms.length} platform${connectedPlatforms.length !== 1 ? 's' : ''}`
                    : questionsAnswered > 0
                      ? `Processing ${questionsAnswered} question responses`
                      : 'Building your personality profile'
                  }
                </p>
              </div>

              {/* Step checklist */}
              <div className="space-y-3 max-w-md mx-auto">
                {processingSteps.map((step, index) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 text-left"
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                      index < currentStepIndex
                        ? 'bg-[#C1C0B6]'
                        : index === currentStepIndex
                        ? 'bg-[rgba(193,192,182,0.5)] animate-pulse'
                        : 'bg-[rgba(193,192,182,0.15)]'
                    }`}>
                      {index < currentStepIndex && <Check className="w-3 h-3 text-[#232320]" />}
                    </div>
                    <span className={`text-sm font-ui transition-all duration-300 ${
                      index <= currentStepIndex ? 'text-[rgba(193,192,182,0.9)]' : 'text-[rgba(193,192,182,0.4)]'
                    }`} style={{ fontFamily: 'var(--font-ui)' }}>
                      {step.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Revealing phase */}
          {phase === 'revealing' && (
            <motion.div
              key="revealing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="h-64 mb-8">
                <ConstellationAnimation phase={phase} />
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[rgba(193,192,182,0.7)] text-base font-ui"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                Connecting the patterns...
              </motion.p>
            </motion.div>
          )}

          {/* Complete phase */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              {/* Constellation */}
              <div className="h-48 mb-8">
                <ConstellationAnimation phase={phase} />
              </div>

              {/* Icon - refined, no garish gradient */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.3, delay: 0.1 }}
                className="mb-8"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-[rgba(193,192,182,0.12)] border border-[rgba(193,192,182,0.2)] flex items-center justify-center backdrop-blur-sm">
                  <Sparkles className="w-7 h-7 text-[#C1C0B6]" strokeWidth={1.5} />
                </div>
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-3xl md:text-4xl text-[#C1C0B6] mb-4 tracking-tight"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}
              >
                Your Soul Signature is Ready
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-[rgba(193,192,182,0.6)] text-base mb-10 max-w-md mx-auto"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                We've discovered the patterns that make you uniquely you.
              </motion.p>

              {/* Stats - elegant cards with proper depth */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-3 gap-4 mb-10"
              >
                <div className="bg-[rgba(45,45,41,0.5)] backdrop-blur-sm border border-[rgba(193,192,182,0.1)] rounded-2xl p-5 hover:bg-[rgba(45,45,41,0.6)] transition-all duration-300">
                  <div className="text-2xl font-semibold text-[#C1C0B6] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                    {questionsAnswered || 5}
                  </div>
                  <div className="text-[rgba(193,192,182,0.5)] text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-ui)' }}>
                    Questions
                  </div>
                </div>
                <div className="bg-[rgba(45,45,41,0.5)] backdrop-blur-sm border border-[rgba(193,192,182,0.1)] rounded-2xl p-5 hover:bg-[rgba(45,45,41,0.6)] transition-all duration-300">
                  <div className="text-2xl font-semibold text-[#C1C0B6] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                    {connectedPlatforms.length}
                  </div>
                  <div className="text-[rgba(193,192,182,0.5)] text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-ui)' }}>
                    Platforms
                  </div>
                </div>
                <div className="bg-[rgba(45,45,41,0.5)] backdrop-blur-sm border border-[rgba(193,192,182,0.1)] rounded-2xl p-5 hover:bg-[rgba(45,45,41,0.6)] transition-all duration-300">
                  <div className="text-2xl font-semibold text-[#C1C0B6] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                    5
                  </div>
                  <div className="text-[rgba(193,192,182,0.5)] text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-ui)' }}>
                    Traits
                  </div>
                </div>
              </motion.div>

              {/* CTA - sophisticated, no garish gradient */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                onClick={handleViewSignature}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                className="group relative w-full px-8 py-4 bg-[#C1C0B6] text-[#232320] rounded-xl font-medium text-base overflow-hidden transition-all duration-300 flex items-center justify-center gap-2 hover:bg-[#D4D3CC] shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                <span className="relative z-10">Explore Your Signature</span>
                <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform duration-300" strokeWidth={2} />

                {/* Subtle shine effect on hover */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6 }}
                />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default RevealStep;
