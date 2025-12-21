import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RevealStepProps {
  connectedPlatforms: string[];
  onComplete: () => void;
}

const processingSteps = [
  { id: 'gathering', label: 'Gathering your digital footprints', duration: 2000 },
  { id: 'analyzing', label: 'Analyzing behavioral patterns', duration: 2500 },
  { id: 'mapping', label: 'Mapping personality correlations', duration: 2000 },
  { id: 'synthesizing', label: 'Synthesizing your soul signature', duration: 3000 },
];

// Constellation animation component
const ConstellationAnimation: React.FC<{ phase: 'processing' | 'revealing' | 'complete' }> = ({ phase }) => {
  const [stars, setStars] = useState<{ x: number; y: number; size: number; delay: number }[]>([]);
  const [connections, setConnections] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  useEffect(() => {
    // Generate random stars
    const newStars = Array.from({ length: 12 }).map((_, i) => ({
      x: 100 + Math.random() * 200,
      y: 50 + Math.random() * 200,
      size: Math.random() * 3 + 2,
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
    <svg viewBox="0 0 400 300" className="w-full h-full max-w-md mx-auto">
      {/* Gradient definitions */}
      <defs>
        <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(139, 92, 246, 0.8)" />
          <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
        </radialGradient>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(139, 92, 246, 0.6)" />
          <stop offset="100%" stopColor="rgba(236, 72, 153, 0.6)" />
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
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.6 }}
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
            r={star.size * 4}
            fill="url(#starGlow)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: phase === 'processing' ? [1, 1.2, 1] : 1,
              opacity: phase === 'processing' ? [0.3, 0.6, 0.3] : 0.5,
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
            fill="#8B5CF6"
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
          r="30"
          fill="url(#starGlow)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.8] }}
          transition={{ duration: 1 }}
        />
      )}
    </svg>
  );
};

export const RevealStep: React.FC<RevealStepProps> = ({ connectedPlatforms, onComplete }) => {
  const navigate = useNavigate();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [phase, setPhase] = useState<'processing' | 'revealing' | 'complete'>('processing');
  const [dataPoints, setDataPoints] = useState(0);

  // Simulate processing
  useEffect(() => {
    if (phase !== 'processing') return;

    let totalTime = 0;
    processingSteps.forEach((step, index) => {
      setTimeout(() => {
        setCurrentStepIndex(index);
        // Simulate data points being analyzed
        setDataPoints(prev => prev + Math.floor(Math.random() * 200) + 100);
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
    navigate('/soul-signature');
  };

  const progress = phase === 'processing'
    ? ((currentStepIndex + 1) / processingSteps.length) * 100
    : 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-stone-950 via-violet-950/30 to-stone-950 px-6">
      <div className="w-full max-w-lg">
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
              <div className="h-64 mb-8">
                <ConstellationAnimation phase={phase} />
              </div>

              {/* Progress */}
              <div className="mb-6">
                <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>

                <motion.p
                  key={currentStepIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-white/80 text-lg"
                >
                  {processingSteps[currentStepIndex]?.label}...
                </motion.p>

                <p className="text-white/40 text-sm mt-2">
                  Analyzing {dataPoints.toLocaleString()} data points across {connectedPlatforms.length} platform{connectedPlatforms.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Step checklist */}
              <div className="space-y-2">
                {processingSteps.map((step, index) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 text-left"
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      index < currentStepIndex
                        ? 'bg-green-500'
                        : index === currentStepIndex
                        ? 'bg-violet-500 animate-pulse'
                        : 'bg-white/10'
                    }`}>
                      {index < currentStepIndex && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm ${
                      index <= currentStepIndex ? 'text-white/80' : 'text-white/30'
                    }`}>
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
              initial={{ opacity: 0, scale: 0.9 }}
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
                className="text-white/60 text-lg"
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
              <div className="h-48 mb-6">
                <ConstellationAnimation phase={phase} />
              </div>

              {/* Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.5 }}
                className="mb-6"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-violet-500 via-pink-500 to-amber-500 flex items-center justify-center shadow-2xl shadow-violet-500/30">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-3xl md:text-4xl text-white font-heading mb-3"
                style={{ fontWeight: 500 }}
              >
                Your Soul Signature is Ready
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white/60 mb-8"
              >
                We've discovered the patterns that make you uniquely you.
              </motion.p>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-3 gap-4 mb-8 p-4 bg-white/5 rounded-2xl"
              >
                <div>
                  <div className="text-2xl font-bold text-white">{dataPoints.toLocaleString()}</div>
                  <div className="text-white/40 text-xs">Data points</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{connectedPlatforms.length}</div>
                  <div className="text-white/40 text-xs">Platforms</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">5</div>
                  <div className="text-white/40 text-xs">Trait dimensions</div>
                </div>
              </motion.div>

              {/* CTA */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                onClick={handleViewSignature}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group w-full px-8 py-4 bg-gradient-to-r from-violet-600 to-pink-600 text-white rounded-xl font-medium text-lg shadow-2xl shadow-violet-500/30 flex items-center justify-center gap-2"
              >
                Explore Your Signature
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default RevealStep;
