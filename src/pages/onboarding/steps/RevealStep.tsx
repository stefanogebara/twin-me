import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Check, Music, Calendar, Activity, User, Compass, Heart, Brain, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PreliminaryScores } from '../hooks/useOnboardingState';

interface RevealStepProps {
  connectedPlatforms: string[];
  questionsAnswered?: number;
  archetype?: {
    name: string;
    subtitle: string;
    description: string;
  } | null;
  scores?: PreliminaryScores | null;
  onComplete: () => void;
}

const processingSteps = [
  { id: 'gathering', label: 'Gathering your digital footprints', duration: 1500 },
  { id: 'analyzing', label: 'Analyzing behavioral patterns', duration: 2000 },
  { id: 'mapping', label: 'Mapping personality correlations', duration: 1500 },
  { id: 'synthesizing', label: 'Synthesizing your soul signature', duration: 2000 },
];

// Platform icons mapping
const platformIcons: Record<string, React.ReactNode> = {
  spotify: <Music className="w-4 h-4" />,
  google_calendar: <Calendar className="w-4 h-4" />,
  whoop: <Activity className="w-4 h-4" />,
  linkedin: <User className="w-4 h-4" />,
};

// Big Five trait info
const traitInfo: Record<string, { label: string; high: string; low: string; icon: React.ReactNode }> = {
  openness: {
    label: 'Openness',
    high: 'Creative & Curious',
    low: 'Practical & Grounded',
    icon: <Compass className="w-4 h-4" />
  },
  conscientiousness: {
    label: 'Conscientiousness',
    high: 'Organized & Driven',
    low: 'Flexible & Spontaneous',
    icon: <Zap className="w-4 h-4" />
  },
  extraversion: {
    label: 'Extraversion',
    high: 'Energetic & Social',
    low: 'Reflective & Reserved',
    icon: <Heart className="w-4 h-4" />
  },
  agreeableness: {
    label: 'Agreeableness',
    high: 'Warm & Cooperative',
    low: 'Direct & Competitive',
    icon: <User className="w-4 h-4" />
  },
  neuroticism: {
    label: 'Emotional Stability',
    high: 'Calm & Resilient',
    low: 'Sensitive & Passionate',
    icon: <Brain className="w-4 h-4" />
  },
};

// Circular trait visualization component
const TraitCircle: React.FC<{
  trait: string;
  value: number;
  delay: number;
  isNeuroticism?: boolean;
}> = ({ trait, value, delay, isNeuroticism }) => {
  const info = traitInfo[trait];
  // For neuroticism, invert display (show stability)
  const displayValue = isNeuroticism ? 100 - value : value;
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (displayValue / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="flex flex-col items-center"
    >
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="rgba(193,192,182,0.1)"
            strokeWidth="4"
          />
          {/* Progress circle */}
          <motion.circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="#C1C0B6"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-[#C1C0B6]" style={{ fontFamily: 'var(--font-heading)' }}>
            {displayValue}
          </span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs text-[rgba(193,192,182,0.7)]" style={{ fontFamily: 'var(--font-ui)' }}>
          {info?.label.substring(0, 4).toUpperCase()}
        </p>
      </div>
    </motion.div>
  );
};

// Insight card component
const InsightCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  delay: number;
}> = ({ title, description, icon, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="bg-[rgba(45,45,41,0.5)] backdrop-blur-sm border border-[rgba(193,192,182,0.1)] rounded-xl p-4"
  >
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[rgba(193,192,182,0.1)] flex items-center justify-center text-[#C1C0B6]">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-medium text-[#C1C0B6] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
          {title}
        </h4>
        <p className="text-xs text-[rgba(193,192,182,0.6)] leading-relaxed" style={{ fontFamily: 'var(--font-ui)' }}>
          {description}
        </p>
      </div>
    </div>
  </motion.div>
);

export const RevealStep: React.FC<RevealStepProps> = ({
  connectedPlatforms,
  questionsAnswered = 0,
  archetype,
  scores,
  onComplete
}) => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [phase, setPhase] = useState<'processing' | 'complete'>('processing');

  // Generate insights based on scores
  const insights = useMemo(() => {
    if (!scores) return [];

    const result = [];

    // Highest trait insight
    const traits = [
      { key: 'openness', value: scores.openness },
      { key: 'conscientiousness', value: scores.conscientiousness },
      { key: 'extraversion', value: scores.extraversion },
      { key: 'agreeableness', value: scores.agreeableness },
    ];
    const highest = traits.reduce((a, b) => a.value > b.value ? a : b);
    const info = traitInfo[highest.key];

    result.push({
      title: `Strong ${info.label}`,
      description: `Your ${info.label.toLowerCase()} score of ${highest.value}% suggests you're ${info.high.toLowerCase()}.`,
      icon: info.icon,
    });

    // Emotional stability insight
    const stability = 100 - scores.neuroticism;
    if (stability >= 60) {
      result.push({
        title: 'Emotional Resilience',
        description: `With ${stability}% emotional stability, you tend to stay calm under pressure and recover quickly from setbacks.`,
        icon: <Brain className="w-4 h-4" />,
      });
    } else {
      result.push({
        title: 'Emotional Depth',
        description: `Your emotional sensitivity (${100 - stability}%) means you feel things deeply and are highly attuned to your environment.`,
        icon: <Heart className="w-4 h-4" />,
      });
    }

    // Platform-based insight
    if (connectedPlatforms.length > 0) {
      result.push({
        title: 'Rich Data Foundation',
        description: `With ${connectedPlatforms.length} platform${connectedPlatforms.length > 1 ? 's' : ''} connected, we can build a more accurate picture of your authentic self.`,
        icon: <Sparkles className="w-4 h-4" />,
      });
    }

    return result;
  }, [scores, connectedPlatforms]);

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

    // Transition to complete phase
    setTimeout(() => {
      setPhase('complete');
    }, totalTime + 500);
  }, [phase]);

  const handleViewSignature = () => {
    onComplete();
    if (isSignedIn) {
      navigate('/soul-signature');
    } else {
      navigate('/auth?redirect=' + encodeURIComponent('/soul-signature'));
    }
  };

  const progress = phase === 'processing'
    ? ((currentStepIndex + 1) / processingSteps.length) * 100
    : 100;

  // Default archetype if none provided
  const displayArchetype = archetype || {
    name: 'The Unique Soul',
    subtitle: 'Your journey of discovery begins',
    description: 'Connect your platforms and answer a few questions to reveal your complete soul signature.'
  };

  // Default scores if none provided
  const displayScores = scores || {
    openness: 50,
    conscientiousness: 50,
    extraversion: 50,
    agreeableness: 50,
    neuroticism: 50,
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#232320] px-6 py-12">
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {/* Processing phase */}
          {phase === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              {/* Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mb-8"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-[rgba(193,192,182,0.08)] border border-[rgba(193,192,182,0.15)] flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-8 h-8 text-[#C1C0B6]" strokeWidth={1.5} />
                  </motion.div>
                </div>
              </motion.div>

              {/* Progress */}
              <div className="mb-8">
                <div className="h-1 bg-[rgba(193,192,182,0.1)] rounded-full overflow-hidden mb-6 max-w-md mx-auto">
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
                  className="text-[#C1C0B6] text-base mb-3"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  {processingSteps[currentStepIndex]?.label}...
                </motion.p>

                <p className="text-[rgba(193,192,182,0.5)] text-sm" style={{ fontFamily: 'var(--font-ui)' }}>
                  {connectedPlatforms.length > 0 && questionsAnswered > 0
                    ? `Analyzing ${questionsAnswered} responses across ${connectedPlatforms.length} platform${connectedPlatforms.length !== 1 ? 's' : ''}`
                    : questionsAnswered > 0
                      ? `Processing ${questionsAnswered} question responses`
                      : connectedPlatforms.length > 0
                        ? `Analyzing data from ${connectedPlatforms.length} platform${connectedPlatforms.length !== 1 ? 's' : ''}`
                        : 'Building your personality profile'
                  }
                </p>
              </div>

              {/* Step checklist */}
              <div className="space-y-3 max-w-sm mx-auto">
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
                        ? 'bg-[rgba(193,192,182,0.4)] animate-pulse'
                        : 'bg-[rgba(193,192,182,0.1)]'
                    }`}>
                      {index < currentStepIndex && <Check className="w-3 h-3 text-[#232320]" />}
                    </div>
                    <span className={`text-sm transition-all duration-300 ${
                      index <= currentStepIndex ? 'text-[rgba(193,192,182,0.8)]' : 'text-[rgba(193,192,182,0.3)]'
                    }`} style={{ fontFamily: 'var(--font-ui)' }}>
                      {step.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Complete phase - Beautiful reveal */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              {/* Archetype reveal */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[rgba(193,192,182,0.1)] border border-[rgba(193,192,182,0.2)] flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-[#C1C0B6]" strokeWidth={1.5} />
                </div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl md:text-4xl text-[#C1C0B6] mb-2 tracking-tight"
                  style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}
                >
                  {displayArchetype.name}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-[rgba(193,192,182,0.6)] text-lg mb-4"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  {displayArchetype.subtitle}
                </motion.p>
              </motion.div>

              {/* Big Five trait circles */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mb-8"
              >
                <p className="text-xs text-[rgba(193,192,182,0.5)] uppercase tracking-wider mb-4" style={{ fontFamily: 'var(--font-ui)' }}>
                  Your Big Five Profile
                </p>
                <div className="flex justify-center gap-4 flex-wrap">
                  <TraitCircle trait="openness" value={displayScores.openness} delay={0.5} />
                  <TraitCircle trait="conscientiousness" value={displayScores.conscientiousness} delay={0.6} />
                  <TraitCircle trait="extraversion" value={displayScores.extraversion} delay={0.7} />
                  <TraitCircle trait="agreeableness" value={displayScores.agreeableness} delay={0.8} />
                  <TraitCircle trait="neuroticism" value={displayScores.neuroticism} delay={0.9} isNeuroticism />
                </div>
              </motion.div>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-[rgba(193,192,182,0.6)] text-sm max-w-md mx-auto mb-8 leading-relaxed"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                {displayArchetype.description}
              </motion.p>

              {/* Insights */}
              {insights.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1 }}
                  className="mb-8 space-y-3 max-w-md mx-auto"
                >
                  <p className="text-xs text-[rgba(193,192,182,0.5)] uppercase tracking-wider mb-3" style={{ fontFamily: 'var(--font-ui)' }}>
                    Key Insights
                  </p>
                  {insights.map((insight, i) => (
                    <InsightCard
                      key={i}
                      title={insight.title}
                      description={insight.description}
                      icon={insight.icon}
                      delay={1.2 + i * 0.1}
                    />
                  ))}
                </motion.div>
              )}

              {/* Data sources */}
              {connectedPlatforms.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5 }}
                  className="mb-8"
                >
                  <p className="text-xs text-[rgba(193,192,182,0.5)] uppercase tracking-wider mb-3" style={{ fontFamily: 'var(--font-ui)' }}>
                    Data Sources
                  </p>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {connectedPlatforms.map((platform, i) => (
                      <motion.div
                        key={platform}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.6 + i * 0.1 }}
                        className="flex items-center gap-2 px-3 py-2 bg-[rgba(193,192,182,0.08)] border border-[rgba(193,192,182,0.1)] rounded-lg"
                      >
                        <span className="text-[#C1C0B6]">
                          {platformIcons[platform] || <Sparkles className="w-4 h-4" />}
                        </span>
                        <span className="text-xs text-[rgba(193,192,182,0.7)] capitalize" style={{ fontFamily: 'var(--font-ui)' }}>
                          {platform.replace('_', ' ')}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8 }}
              >
                <motion.button
                  onClick={handleViewSignature}
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  className="group w-full max-w-md px-8 py-4 bg-[#C1C0B6] text-[#232320] rounded-xl font-medium text-base flex items-center justify-center gap-2 hover:bg-[#D4D3CC] transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  <span>Explore Your Full Signature</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" strokeWidth={2} />
                </motion.button>

                <p className="mt-4 text-xs text-[rgba(193,192,182,0.4)]" style={{ fontFamily: 'var(--font-ui)' }}>
                  This is just the beginning. Your full signature includes deeper insights, patterns, and recommendations.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default RevealStep;
