import React, { useState, useEffect, useRef } from 'react';
import type { PlatformDataPoint } from '@/services/enrichmentService';

// ============================================================================
// PLATFORM CONFIG
// ============================================================================

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  google_calendar: '#4285F4',
  discord: '#5865F2',
  linkedin: '#0A66C2',
  github: '#F0F6FC',
  reddit: '#FF4500',
  twitch: '#9146FF',
  whoop: '#44D62C',
  gmail: '#EA4335',
};

const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  google_calendar: 'Calendar',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  reddit: 'Reddit',
  twitch: 'Twitch',
  whoop: 'Whoop',
  gmail: 'Gmail',
};

const DISCOVERY_VERBS: Record<string, string[]> = {
  spotify: ['your listening patterns', 'your music taste', 'your sonic identity'],
  youtube: ['your viewing habits', 'your content world', 'your curiosity map'],
  google_calendar: ['your rhythms', 'your time patterns', 'how you structure your days'],
  discord: ['your communities', 'your social world', 'your digital tribes'],
  linkedin: ['your career arc', 'your professional identity', 'your growth trajectory'],
  github: ['your code', 'your building patterns', 'your creative output'],
  reddit: ['your interests', 'your community voice', 'your curiosity trails'],
  twitch: ['your gaming world', 'your streaming taste', 'your digital playground'],
  whoop: ['your body data', 'your recovery patterns', 'your physical rhythm'],
  gmail: ['your communication style', 'your network patterns', 'your digital voice'],
};

// ============================================================================
// PHASE TYPE
// ============================================================================

type LearningPhase = 'discovering' | 'revealing' | 'reacting';

// ============================================================================
// COMPONENT
// ============================================================================

interface TwinLearningOverlayProps {
  platform: string;
  dataPoints: PlatformDataPoint[];
  twinReaction: string;
  insight: string;
  isDataReady: boolean;
  onComplete: () => void;
}

const TwinLearningOverlay: React.FC<TwinLearningOverlayProps> = ({
  platform,
  dataPoints,
  twinReaction,
  insight,
  isDataReady,
  onComplete,
}) => {
  const [phase, setPhase] = useState<LearningPhase>('discovering');
  const [discoveryText, setDiscoveryText] = useState('');
  const [visibleDataPoints, setVisibleDataPoints] = useState<number>(0);
  const [showInsight, setShowInsight] = useState(false);
  const [showReaction, setShowReaction] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [pulseIndex, setPulseIndex] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const discoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTransitionedToReveal = useRef(false);

  const color = PLATFORM_COLORS[platform] || '#E8D5B7';
  const label = PLATFORM_LABELS[platform] || platform;
  const verbs = DISCOVERY_VERBS[platform] || ['your data', 'your patterns', 'your identity'];

  // Phase 1: Cycle through discovery verbs with typing effect
  useEffect(() => {
    if (phase !== 'discovering') return;

    let verbIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    const currentVerb = () => verbs[verbIdx % verbs.length];

    const tick = () => {
      if (isDeleting) {
        charIdx--;
        if (charIdx <= 0) {
          isDeleting = false;
          verbIdx++;
          charIdx = 0;
        }
      } else {
        charIdx++;
        if (charIdx >= currentVerb().length) {
          // Pause at full word before deleting
          setTimeout(() => {
            isDeleting = true;
          }, 800);
          setDiscoveryText(currentVerb());
          return;
        }
      }
      setDiscoveryText(currentVerb().slice(0, charIdx));
    };

    discoveryTimerRef.current = setInterval(tick, 60);
    return () => {
      if (discoveryTimerRef.current) clearInterval(discoveryTimerRef.current);
    };
  }, [phase, verbs]);

  // Pulse animation for the platform icon during discovery
  useEffect(() => {
    if (phase !== 'discovering') return;
    const interval = setInterval(() => {
      setPulseIndex(prev => prev + 1);
    }, 1200);
    return () => clearInterval(interval);
  }, [phase]);

  // Transition to reveal phase once data is ready (minimum 2s discovery)
  useEffect(() => {
    if (hasTransitionedToReveal.current) return;
    if (!isDataReady) return;

    const minDiscoveryTime = setTimeout(() => {
      if (hasTransitionedToReveal.current) return;
      hasTransitionedToReveal.current = true;
      if (discoveryTimerRef.current) clearInterval(discoveryTimerRef.current);
      setPhase('revealing');
    }, 2000);

    return () => clearTimeout(minDiscoveryTime);
  }, [isDataReady]);

  // Phase 2: Stagger data points one by one
  useEffect(() => {
    if (phase !== 'revealing') return;
    if (dataPoints.length === 0) {
      // Skip straight to reaction if no data points
      setShowInsight(true);
      setTimeout(() => setPhase('reacting'), 600);
      return;
    }

    // Show insight first
    const insightTimer = setTimeout(() => setShowInsight(true), 300);

    // Stagger data points at 500ms intervals
    const timers = dataPoints.map((_, i) =>
      setTimeout(() => {
        setVisibleDataPoints(i + 1);
      }, 800 + i * 500)
    );

    // After all data points shown, transition to reaction
    const reactionDelay = 800 + dataPoints.length * 500 + 600;
    const reactionTimer = setTimeout(() => {
      setPhase('reacting');
    }, reactionDelay);

    return () => {
      clearTimeout(insightTimer);
      timers.forEach(clearTimeout);
      clearTimeout(reactionTimer);
    };
  }, [phase, dataPoints]);

  // Phase 3: Show twin reaction
  useEffect(() => {
    if (phase !== 'reacting') return;
    const t1 = setTimeout(() => setShowReaction(true), 300);
    const t2 = setTimeout(() => setShowContinue(true), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  const handleContinue = () => {
    setFadeOut(true);
    setTimeout(onComplete, 400);
  };

  return (
    <div
      className="mt-3 rounded-[20px] p-5 relative overflow-hidden"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.4s ease-out',
      }}
    >
      {/* Accent line at top */}
      <div
        className="absolute top-0 left-0 w-full h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${color}, ${color}44, transparent)`,
        }}
      />

      {/* Animated glow behind icon */}
      <div
        className="absolute top-4 left-5 w-10 h-10 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}30 0%, transparent 70%)`,
          animation: phase === 'discovering' ? 'twinLearnPulse 2s ease-in-out infinite' : 'none',
          opacity: phase === 'discovering' ? 1 : 0,
          transition: 'opacity 0.6s ease-out',
        }}
      />

      {/* Phase 1: Discovering */}
      {phase === 'discovering' && (
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: `${color}20`,
                border: `1px solid ${color}40`,
                color,
                transform: pulseIndex % 2 === 0 ? 'scale(1)' : 'scale(1.08)',
                transition: 'transform 0.6s ease-in-out',
              }}
            >
              <PlatformMiniIcon platform={platform} />
            </div>
            <div>
              <p
                className="text-xs uppercase tracking-[0.15em]"
                style={{ color: `${color}CC`, fontFamily: "'Inter', sans-serif" }}
              >
                {label} connected
              </p>
            </div>
          </div>

          <p
            className="text-base leading-relaxed"
            style={{ color: '#F5F5F4', fontFamily: "'Inter', sans-serif" }}
          >
            Your twin is discovering{' '}
            <span
              style={{
                color,
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
              }}
            >
              {discoveryText}
            </span>
            <span
              style={{
                color,
                opacity: 0.8,
                animation: 'twinLearnCursor 1s step-end infinite',
              }}
            >
              |
            </span>
          </p>

          {/* Scanning dots */}
          <div className="flex gap-1.5 mt-4">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: color,
                  opacity: (pulseIndex + i) % 3 === 0 ? 1 : 0.25,
                  transition: 'opacity 0.4s ease',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Phase 2: Revealing data */}
      {(phase === 'revealing' || phase === 'reacting') && (
        <div className="relative z-10">
          {/* Insight headline */}
          {showInsight && insight && (
            <p
              className="text-sm mb-4 leading-relaxed"
              style={{
                color: 'rgba(245,245,244,0.85)',
                fontFamily: 'var(--font-heading)',
                opacity: showInsight ? 1 : 0,
                transform: showInsight ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
              }}
            >
              {insight}
            </p>
          )}

          {/* Data points - staggered reveal */}
          {dataPoints.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {dataPoints.map((dp, i) => {
                const isVisible = i < visibleDataPoints;
                return (
                  <div
                    key={dp.label}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{
                      backgroundColor: `${color}12`,
                      border: `1px solid ${color}25`,
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
                      transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
                    }}
                  >
                    <span
                      className="text-xs"
                      style={{
                        color: 'rgba(245,245,244,0.5)',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {dp.label}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: 'rgba(245,245,244,0.85)',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {dp.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phase 3: Twin reaction */}
          {showReaction && twinReaction && (
            <div
              style={{
                opacity: showReaction ? 1 : 0,
                transform: showReaction ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
              }}
            >
              <div
                className="mt-2 pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'rgba(245,245,244,0.6)',
                    fontFamily: 'var(--font-heading)',
                    fontStyle: 'italic',
                  }}
                >
                  &ldquo;{twinReaction}&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* Continue action */}
          {showContinue && (
            <div
              className="mt-4 flex justify-end"
              style={{
                opacity: showContinue ? 1 : 0,
                transition: 'opacity 0.4s ease-out',
              }}
            >
              <button
                onClick={handleContinue}
                className="text-xs px-4 py-2 rounded-full transition-all duration-200 hover:brightness-110"
                style={{
                  backgroundColor: `${color}20`,
                  border: `1px solid ${color}30`,
                  color: 'rgba(245,245,244,0.8)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Got it
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes twinLearnPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.4); opacity: 0.9; }
        }
        @keyframes twinLearnCursor {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// MINI PLATFORM ICON (SVG inlined to avoid import issues)
// ============================================================================

const PlatformMiniIcon: React.FC<{ platform: string }> = ({ platform }) => {
  switch (platform) {
    case 'spotify':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      );
    case 'youtube':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    case 'google_calendar':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" opacity="0.3" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
  }
};

export default TwinLearningOverlay;
