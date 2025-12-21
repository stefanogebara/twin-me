import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Clock, ChevronLeft } from 'lucide-react';
import { PreliminaryScores } from '../hooks/useOnboardingState';

interface FirstGlimpseStepProps {
  archetype: {
    name: string;
    subtitle: string;
    description: string;
  };
  scores: PreliminaryScores;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

// Radar chart component
const RadarChart: React.FC<{ scores: PreliminaryScores }> = ({ scores }) => {
  const traits = [
    { key: 'openness', label: 'Openness', value: scores.openness },
    { key: 'conscientiousness', label: 'Conscientiousness', value: scores.conscientiousness },
    { key: 'extraversion', label: 'Extraversion', value: scores.extraversion },
    { key: 'agreeableness', label: 'Agreeableness', value: scores.agreeableness },
    { key: 'neuroticism', label: 'Stability', value: 100 - scores.neuroticism }, // Invert for display
  ];

  const centerX = 150;
  const centerY = 150;
  const maxRadius = 100;

  // Calculate points for the polygon
  const points = traits.map((trait, i) => {
    const angle = (i * 2 * Math.PI) / traits.length - Math.PI / 2;
    const radius = (trait.value / 100) * maxRadius;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      labelX: centerX + (maxRadius + 30) * Math.cos(angle),
      labelY: centerY + (maxRadius + 30) * Math.sin(angle),
      ...trait,
    };
  });

  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 300 300" className="w-full h-full max-w-[300px] mx-auto">
      {/* Background circles */}
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <circle
          key={scale}
          cx={centerX}
          cy={centerY}
          r={maxRadius * scale}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines */}
      {traits.map((_, i) => {
        const angle = (i * 2 * Math.PI) / traits.length - Math.PI / 2;
        return (
          <line
            key={i}
            x1={centerX}
            y1={centerY}
            x2={centerX + maxRadius * Math.cos(angle)}
            y2={centerY + maxRadius * Math.sin(angle)}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <motion.polygon
        points={polygonPoints}
        fill="url(#radarGradient)"
        stroke="url(#radarStroke)"
        strokeWidth="2"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
        style={{ transformOrigin: `${centerX}px ${centerY}px` }}
      />

      {/* Data points */}
      {points.map((point, i) => (
        <motion.circle
          key={i}
          cx={point.x}
          cy={point.y}
          r="4"
          fill="#8B5CF6"
          stroke="white"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.8 + i * 0.1 }}
        />
      ))}

      {/* Labels */}
      {points.map((point, i) => (
        <motion.text
          key={i}
          x={point.labelX}
          y={point.labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.6)"
          fontSize="10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 1 + i * 0.1 }}
        >
          {point.label.substring(0, 3).toUpperCase()}
        </motion.text>
      ))}

      {/* Gradient definitions */}
      <defs>
        <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(139, 92, 246, 0.4)" />
          <stop offset="100%" stopColor="rgba(236, 72, 153, 0.4)" />
        </linearGradient>
        <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const FirstGlimpseStep: React.FC<FirstGlimpseStepProps> = ({
  archetype,
  scores,
  onContinue,
  onSkip,
  onBack
}) => {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-stone-950 via-violet-950/20 to-stone-950">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-white/60 hover:text-white flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <button
          onClick={onSkip}
          className="text-white/60 hover:text-white text-sm transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <span className="text-violet-400 text-sm font-medium">Your First Glimpse</span>
            </div>
            <h1 className="text-2xl text-white/80 font-heading" style={{ fontWeight: 400 }}>
              Based on your answers, you might be...
            </h1>
          </motion.div>

          {/* Result card */}
          {showContent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 via-pink-500/20 to-amber-500/20 rounded-3xl blur-2xl" />

              {/* Card */}
              <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 overflow-hidden">
                {/* Archetype */}
                <div className="text-center mb-8">
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl md:text-4xl text-white font-heading mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    {archetype.name}
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-violet-300 text-lg"
                  >
                    {archetype.subtitle}
                  </motion.p>
                </div>

                {/* Radar chart */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mb-6"
                >
                  <RadarChart scores={scores} />
                </motion.div>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-white/70 text-center text-sm leading-relaxed"
                >
                  {archetype.description}
                </motion.p>

                {/* Disclaimer */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 }}
                  className="mt-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"
                >
                  <p className="text-amber-200/80 text-xs text-center flex items-center justify-center gap-2">
                    <Clock className="w-3 h-3" />
                    This is just a preview. Connect your platforms for a deeper, more accurate analysis.
                  </p>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="mt-8 text-center"
          >
            <p className="text-white/60 text-sm mb-4">
              Want to discover your <span className="text-violet-400">full</span> signature?
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <motion.button
                onClick={onContinue}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group px-6 py-3 bg-gradient-to-r from-violet-600 to-pink-600 text-white rounded-xl font-medium shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2"
              >
                Connect Your Platforms
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>

              <button
                onClick={onSkip}
                className="px-6 py-3 text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default FirstGlimpseStep;
