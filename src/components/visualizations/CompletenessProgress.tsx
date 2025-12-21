/**
 * Completeness Progress
 * Circular progress bar showing soul signature completeness with category breakdown
 */

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface CompletenessProgressProps {
  completeness: number;
  breakdown: {
    personal: number;
    professional: number;
    creative: number;
  };
  className?: string;
}

export function CompletenessProgress({ completeness, breakdown, className = '' }: CompletenessProgressProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    // Animate the value
    const duration = 1500;
    const steps = 60;
    const increment = completeness / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= completeness) {
        setAnimatedValue(completeness);
        clearInterval(timer);
      } else {
        setAnimatedValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [completeness]);

  // Calculate circle properties
  const size = 240;
  const strokeWidth = 12;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate stroke dash offset for main circle
  const mainOffset = circumference - (animatedValue / 100) * circumference;

  // Calculate ring segments for breakdown
  const personalSegment = (breakdown.personal / 100) * circumference;
  const professionalSegment = (breakdown.professional / 100) * circumference;
  const creativeSegment = (breakdown.creative / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`bg-white rounded-xl border border-stone-200 p-6 ${className}`}
    >
      <div className="mb-6">
        <h3 className="text-2xl font-heading font-semibold text-slate-900">
          Soul Signature Completeness
        </h3>
        <p className="text-sm text-slate-600 mt-2">
          Connect more platforms to unlock deeper insights
        </p>
      </div>

      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
        {/* Circular Progress */}
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#E7E5E4"
              strokeWidth={strokeWidth}
            />

            {/* Main progress circle */}
            <motion.circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#D97706"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: mainOffset }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
            />

            {/* Inner breakdown ring */}
            <g transform={`rotate(0 ${center} ${center})`}>
              {/* Personal segment */}
              <motion.circle
                cx={center}
                cy={center}
                r={radius - 20}
                fill="none"
                stroke="#10B981"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`${personalSegment} ${circumference}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.5, delay: 0.3, ease: 'easeInOut' }}
              />

              {/* Professional segment */}
              <motion.circle
                cx={center}
                cy={center}
                r={radius - 20}
                fill="none"
                stroke="#3B82F6"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`0 ${personalSegment} ${professionalSegment} ${circumference}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.5, delay: 0.4, ease: 'easeInOut' }}
              />

              {/* Creative segment */}
              <motion.circle
                cx={center}
                cy={center}
                r={radius - 20}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`0 ${personalSegment + professionalSegment} ${creativeSegment} ${circumference}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.5, delay: 0.5, ease: 'easeInOut' }}
              />
            </g>
          </svg>

          {/* Center percentage */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="text-center"
            >
              <div className="text-5xl font-heading font-bold text-slate-900">
                {animatedValue}%
              </div>
              <div className="text-sm text-slate-600 mt-1">Complete</div>
            </motion.div>
          </div>

          {/* Pulse animation when reaching milestones */}
          {completeness > 0 && completeness % 25 === 0 && (
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-orange-400"
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>

        {/* Feature Unlocks - Value-focused instead of meaningless percentages */}
        <div className="flex-1 space-y-4">
          <div className="text-sm font-semibold text-slate-900 mb-4">Unlocked Features</div>

          {/* Musical Identity - Always shown as unlocked when data exists */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-start p-3 rounded-lg bg-green-50 border border-green-200"
          >
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-900">Musical Identity</p>
                <p className="text-xs text-green-700 mt-0.5">Spotify connected - emotional patterns discovered</p>
              </div>
            </div>
          </motion.div>

          {/* Deep Personality Analysis - Unlocks at 30% personal data */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className={`flex items-start p-3 rounded-lg ${
              breakdown.personal >= 30
                ? 'bg-green-50 border-green-200'
                : 'bg-stone-50 border-stone-200'
            } border`}
          >
            <div className="flex items-start space-x-3">
              {breakdown.personal >= 30 ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-stone-300 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-semibold ${breakdown.personal >= 30 ? 'text-green-900' : 'text-stone-600'}`}>
                  Deep Personality Analysis
                </p>
                <p className={`text-xs mt-0.5 ${breakdown.personal >= 30 ? 'text-green-700' : 'text-stone-500'}`}>
                  {breakdown.personal >= 30
                    ? 'Unlocked - 20+ insights generated'
                    : 'Connect 3 more personal platforms to unlock'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* AI Twin Chat - Unlocks at 50% overall completeness */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className={`flex items-start p-3 rounded-lg ${
              completeness >= 50
                ? 'bg-green-50 border-green-200'
                : 'bg-stone-50 border-stone-200'
            } border`}
          >
            <div className="flex items-start space-x-3">
              {completeness >= 50 ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-stone-300 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-semibold ${completeness >= 50 ? 'text-green-900' : 'text-stone-600'}`}>
                  AI Twin Chat
                </p>
                <p className={`text-xs mt-0.5 ${completeness >= 50 ? 'text-green-700' : 'text-stone-500'}`}>
                  {completeness >= 50
                    ? 'Unlocked - Chat with your digital twin'
                    : `${Math.max(0, 50 - completeness)}% more data needed to unlock`}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Soul Matching - Unlocks at 75% overall completeness */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className={`flex items-start p-3 rounded-lg ${
              completeness >= 75
                ? 'bg-green-50 border-green-200'
                : 'bg-stone-50 border-stone-200'
            } border`}
          >
            <div className="flex items-start space-x-3">
              {completeness >= 75 ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-stone-300 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-semibold ${completeness >= 75 ? 'text-green-900' : 'text-stone-600'}`}>
                  Soul Matching
                </p>
                <p className={`text-xs mt-0.5 ${completeness >= 75 ? 'text-green-700' : 'text-stone-500'}`}>
                  {completeness >= 75
                    ? 'Unlocked - Find compatible souls'
                    : `${Math.max(0, 75 - completeness)}% more data needed to unlock`}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Next Action - Dynamic guidance */}
          {completeness < 100 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="pt-4 border-t border-stone-200"
            >
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <svg className="w-4 h-4 text-stone-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>
                  {completeness < 50 && 'Keep connecting platforms to unlock AI Twin Chat'}
                  {completeness >= 50 && completeness < 75 && 'You\'re halfway there! Unlock Soul Matching at 75%'}
                  {completeness >= 75 && 'Almost complete! Connect more platforms for deeper insights'}
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
