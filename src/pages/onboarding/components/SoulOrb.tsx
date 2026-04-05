import React from 'react';
import type { OrbVoiceState } from '../../../hooks/useVoiceInterview';

type OrbPhase = 'dormant' | 'awakening' | 'alive';

interface SoulOrbProps {
  phase: OrbPhase;
  dataPointCount: number;
  /** Voice state — controls visual feedback during voice conversation */
  voiceState?: OrbVoiceState;
  /** Audio output volume (0-1) — for pulse sync during speaking */
  outputVolume?: number;
  /** Whether the orb is clickable (voice available) */
  onClick?: () => void;
  /** Label shown below the orb */
  statusLabel?: string;
}

const phaseConfig: Record<OrbPhase, {
  size: number;
  mobileSize: number;
  glowOpacity: number;
  pulseScale: number;
  pulseDuration: number;
}> = {
  dormant: { size: 160, mobileSize: 120, glowOpacity: 0.15, pulseScale: 1.04, pulseDuration: 3 },
  awakening: { size: 180, mobileSize: 140, glowOpacity: 0.3, pulseScale: 1.06, pulseDuration: 2 },
  alive: { size: 200, mobileSize: 160, glowOpacity: 0.45, pulseScale: 1.03, pulseDuration: 4 },
};

// Voice state overrides for visual feedback
const voiceOverrides: Record<OrbVoiceState, {
  glowMultiplier: number;
  pulseScale: number;
  pulseDuration: number;
  shimmerSpeed: number;
  ringColor: string;
}> = {
  idle: { glowMultiplier: 1, pulseScale: 1.04, pulseDuration: 3, shimmerSpeed: 20, ringColor: '#E8D5B7' },
  listening: { glowMultiplier: 1.8, pulseScale: 1.08, pulseDuration: 1.2, shimmerSpeed: 8, ringColor: '#F0C880' },
  thinking: { glowMultiplier: 1.4, pulseScale: 1.02, pulseDuration: 0.8, shimmerSpeed: 4, ringColor: '#E8D5B7' },
  speaking: { glowMultiplier: 2.2, pulseScale: 1.06, pulseDuration: 2, shimmerSpeed: 12, ringColor: '#FFB347' },
};

const SoulOrb: React.FC<SoulOrbProps> = ({
  phase,
  dataPointCount,
  voiceState = 'idle',
  outputVolume = 0,
  onClick,
  statusLabel,
}) => {
  const config = phaseConfig[phase];
  const voice = voiceOverrides[voiceState];

  // When speaking, modulate pulse scale with audio volume
  const effectivePulseScale = voiceState === 'speaking'
    ? 1 + (voice.pulseScale - 1) * (0.5 + outputVolume * 0.5)
    : voice.pulseScale;

  const effectiveGlow = config.glowOpacity * voice.glowMultiplier;
  const effectivePulseDuration = voice.pulseDuration;

  // Generate data ring dots
  const dots = Array.from({ length: dataPointCount }, (_, i) => {
    const angle = (i / Math.max(dataPointCount, 1)) * 360;
    return angle;
  });

  const isClickable = !!onClick;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div
        className={`relative flex items-center justify-center soul-orb-container ${isClickable ? 'cursor-pointer' : ''}`}
        onClick={onClick}
        role={isClickable ? 'button' : undefined}
        aria-label={isClickable ? (voiceState === 'idle' ? 'Start voice conversation' : 'Stop voice conversation') : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
        style={{ outline: 'none' }}
      >
        {/* Outer glow */}
        <div
          className="absolute rounded-full soul-orb-pulse"
          style={{
            width: config.size + 60,
            height: config.size + 60,
            background: `radial-gradient(circle, rgba(232, 213, 183, ${effectiveGlow * 0.4}) 0%, transparent 70%)`,
            animationDuration: `${effectivePulseDuration}s`,
          }}
        />

        {/* Listening ring — visible only during active voice states */}
        {voiceState !== 'idle' && (
          <div
            className="absolute rounded-full soul-orb-listening-ring"
            style={{
              width: config.size + 40,
              height: config.size + 40,
              border: `2px solid rgba(240, 200, 128, ${voiceState === 'listening' ? 0.6 : 0.3})`,
              animationDuration: `${effectivePulseDuration * 0.8}s`,
            }}
          />
        )}

        {/* Main orb */}
        <div
          className="relative rounded-full soul-orb-pulse"
          style={{
            width: config.size,
            height: config.size,
            animationDuration: `${effectivePulseDuration}s`,
            background: `
              radial-gradient(circle at 35% 35%,
                rgba(255, 245, 230, ${voiceState !== 'idle' ? 0.6 : (phase === 'alive' ? 0.6 : 0.3)}) 0%,
                rgba(232, 213, 183, ${voiceState !== 'idle' ? 0.5 : (phase === 'alive' ? 0.5 : 0.25)}) 30%,
                rgba(180, 160, 130, ${voiceState !== 'idle' ? 0.35 : (phase === 'alive' ? 0.35 : 0.15)}) 60%,
                rgba(100, 85, 65, 0.1) 100%)
            `,
            boxShadow: `
              0 0 ${voiceState !== 'idle' ? 80 : (phase === 'alive' ? 80 : 40)}px rgba(232, 213, 183, ${effectiveGlow}),
              inset 0 0 ${voiceState !== 'idle' ? 60 : (phase === 'alive' ? 60 : 30)}px rgba(232, 213, 183, ${effectiveGlow * 0.5})
            `,
            transition: 'box-shadow 0.3s ease',
          }}
        >
          {/* Inner shimmer layer */}
          <div
            className="absolute inset-0 rounded-full soul-orb-rotate"
            style={{
              background: `
                conic-gradient(
                  from 0deg,
                  transparent 0%,
                  rgba(232, 213, 183, ${voiceState !== 'idle' ? 0.2 : (phase === 'alive' ? 0.15 : 0.05)}) 25%,
                  transparent 50%,
                  rgba(232, 213, 183, ${voiceState !== 'idle' ? 0.15 : (phase === 'alive' ? 0.1 : 0.03)}) 75%,
                  transparent 100%
                )
              `,
              animationDuration: `${voice.shimmerSpeed}s`,
            }}
          />

          {/* Mic icon — visible when clickable and idle */}
          {isClickable && voiceState === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-60 transition-opacity duration-300">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(232, 213, 183, 0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
          )}

          {/* Voice active indicator */}
          {voiceState === 'listening' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex gap-1 items-end h-8">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="w-1 bg-amber-200/60 rounded-full soul-orb-bar"
                    style={{
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: '0.8s',
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Data ring removed — clean orb only */}

        {/* CSS animations */}
        <style>{`
          @keyframes soul-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(${effectivePulseScale}); }
          }
          @keyframes soul-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes soul-bar {
            0%, 100% { height: 4px; }
            50% { height: 24px; }
          }
          @keyframes soul-ring-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes soul-listening-ring {
            0%, 100% { transform: scale(1); opacity: 0.6; }
            50% { transform: scale(1.05); opacity: 0.3; }
          }
          .soul-orb-pulse {
            animation: soul-pulse ease-in-out infinite;
          }
          .soul-orb-rotate {
            animation: soul-rotate linear infinite;
          }
          .soul-orb-bar {
            animation: soul-bar ease-in-out infinite;
          }
          .soul-orb-ring {
            animation: soul-ring-rotate linear infinite;
          }
          .soul-orb-listening-ring {
            animation: soul-listening-ring ease-in-out infinite;
          }
          @keyframes soul-label-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .soul-orb-label {
            animation: soul-label-pulse 2.5s ease-in-out infinite;
          }
          @media (max-width: 640px) {
            .soul-orb-container { transform: scale(${config.mobileSize / config.size}); }
          }
        `}</style>
      </div>

      {/* Status label below orb */}
      {statusLabel && (
        <p
          className="mt-4 text-sm font-inter soul-orb-label"
          style={{
            color: voiceState !== 'idle' ? 'rgba(240, 200, 128, 0.7)' : '#86807b',
            transition: 'color 0.3s ease',
          }}
        >
          {statusLabel}
        </p>
      )}
    </div>
  );
};

export default SoulOrb;
