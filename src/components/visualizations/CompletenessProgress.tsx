/**
 * Completeness Progress
 * Circular progress bar showing soul signature completeness with category breakdown
 */

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

const darkCardStyle: React.CSSProperties = {
  border: '1px solid var(--border-glass)',
  backgroundColor: 'rgba(255,255,255,0.02)',
};

export function CompletenessProgress({ completeness, breakdown, className = '' }: CompletenessProgressProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
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
    <div
      className={`rounded-lg p-6 ${className}`}
      style={darkCardStyle}
    >
      <div className="mb-6">
        <h3 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
          Soul Signature Completeness
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
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
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#D97706"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={mainOffset}
              style={{ transition: 'stroke-dashoffset 1.5s ease-in-out' }}
            />

            {/* Inner breakdown ring */}
            <g transform={`rotate(0 ${center} ${center})`}>
              <circle
                cx={center}
                cy={center}
                r={radius - 20}
                fill="none"
                stroke="#10B981"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`${personalSegment} ${circumference}`}
                strokeDashoffset={0}
              />
              <circle
                cx={center}
                cy={center}
                r={radius - 20}
                fill="none"
                stroke="#3B82F6"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`0 ${personalSegment} ${professionalSegment} ${circumference}`}
                strokeDashoffset={0}
              />
              <circle
                cx={center}
                cy={center}
                r={radius - 20}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`0 ${personalSegment + professionalSegment} ${creativeSegment} ${circumference}`}
                strokeDashoffset={0}
              />
            </g>
          </svg>

          {/* Center percentage */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-bold text-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
                {animatedValue}%
              </div>
              <div className="text-sm text-muted-foreground mt-1">Complete</div>
            </div>
          </div>
        </div>

        {/* Feature Unlocks */}
        <div className="flex-1 space-y-4">
          <div className="text-sm font-semibold text-foreground mb-4">Unlocked Features</div>

          {/* Musical Identity */}
          <div className="flex items-start p-3 rounded-lg bg-green-900/20 border border-green-800/30">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-900">Musical Identity</p>
                <p className="text-xs text-green-400 mt-0.5">Spotify connected - emotional patterns discovered</p>
              </div>
            </div>
          </div>

          {/* Deep Personality Analysis */}
          <div
            className={`flex items-start p-3 rounded-lg ${
              breakdown.personal >= 30
                ? 'bg-green-900/20 border-green-800/30'
                : ''
            } border`}
            style={breakdown.personal < 30 ? { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-glass)' } : undefined}
          >
            <div className="flex items-start space-x-3">
              {breakdown.personal >= 30 ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-semibold ${breakdown.personal >= 30 ? 'text-green-900' : 'text-muted-foreground'}`}>
                  Deep Personality Analysis
                </p>
                <p className={`text-xs mt-0.5 ${breakdown.personal >= 30 ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {breakdown.personal >= 30
                    ? 'Unlocked - 20+ insights generated'
                    : 'Connect 3 more personal platforms to unlock'}
                </p>
              </div>
            </div>
          </div>

          {/* AI Twin Chat */}
          <div
            className={`flex items-start p-3 rounded-lg ${
              completeness >= 50
                ? 'bg-green-900/20 border-green-800/30'
                : ''
            } border`}
            style={completeness < 50 ? { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-glass)' } : undefined}
          >
            <div className="flex items-start space-x-3">
              {completeness >= 50 ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-semibold ${completeness >= 50 ? 'text-green-900' : 'text-muted-foreground'}`}>
                  AI Twin Chat
                </p>
                <p className={`text-xs mt-0.5 ${completeness >= 50 ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {completeness >= 50
                    ? 'Unlocked - Chat with your digital twin'
                    : `${Math.max(0, 50 - completeness)}% more data needed to unlock`}
                </p>
              </div>
            </div>
          </div>

          {/* Soul Matching */}
          <div
            className={`flex items-start p-3 rounded-lg ${
              completeness >= 75
                ? 'bg-green-900/20 border-green-800/30'
                : ''
            } border`}
            style={completeness < 75 ? { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-glass)' } : undefined}
          >
            <div className="flex items-start space-x-3">
              {completeness >= 75 ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-semibold ${completeness >= 75 ? 'text-green-900' : 'text-muted-foreground'}`}>
                  Soul Matching
                </p>
                <p className={`text-xs mt-0.5 ${completeness >= 75 ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {completeness >= 75
                    ? 'Unlocked - Find compatible souls'
                    : `${Math.max(0, 75 - completeness)}% more data needed to unlock`}
                </p>
              </div>
            </div>
          </div>

          {/* Next Action */}
          {completeness < 100 && (
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>
                  {completeness < 50 && 'Keep connecting platforms to unlock AI Twin Chat'}
                  {completeness >= 50 && completeness < 75 && 'You\'re halfway there! Unlock Soul Matching at 75%'}
                  {completeness >= 75 && 'Almost complete! Connect more platforms for deeper insights'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
