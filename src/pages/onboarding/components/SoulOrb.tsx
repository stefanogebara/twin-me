import React from 'react';

type OrbPhase = 'dormant' | 'awakening' | 'alive';

interface SoulOrbProps {
  phase: OrbPhase;
  dataPointCount: number;
}

const phaseConfig: Record<OrbPhase, {
  size: number;
  mobileSize: number;
  glowOpacity: number;
  pulseScale: number;
  pulseDuration: number;
}> = {
  dormant: { size: 200, mobileSize: 160, glowOpacity: 0.15, pulseScale: 1.04, pulseDuration: 3 },
  awakening: { size: 240, mobileSize: 190, glowOpacity: 0.3, pulseScale: 1.06, pulseDuration: 2 },
  alive: { size: 280, mobileSize: 220, glowOpacity: 0.45, pulseScale: 1.03, pulseDuration: 4 },
};

const SoulOrb: React.FC<SoulOrbProps> = ({ phase, dataPointCount }) => {
  const config = phaseConfig[phase];

  // Generate data ring dots
  const dots = Array.from({ length: dataPointCount }, (_, i) => {
    const angle = (i / Math.max(dataPointCount, 1)) * 360;
    return angle;
  });

  return (
    <div className="relative flex items-center justify-center soul-orb-container">
      {/* Outer glow */}
      <div
        className="absolute rounded-full soul-orb-pulse"
        style={{
          width: config.size + 60,
          height: config.size + 60,
          background: 'radial-gradient(circle, rgba(232, 213, 183, 0.15) 0%, transparent 70%)',
          animationDuration: `${config.pulseDuration}s`,
        }}
      />

      {/* Main orb */}
      <div
        className="relative rounded-full soul-orb-pulse"
        style={{
          width: config.size,
          height: config.size,
          animationDuration: `${config.pulseDuration}s`,
          background: `
            radial-gradient(circle at 35% 35%,
              rgba(255, 245, 230, ${phase === 'alive' ? 0.6 : 0.3}) 0%,
              rgba(232, 213, 183, ${phase === 'alive' ? 0.5 : 0.25}) 30%,
              rgba(180, 160, 130, ${phase === 'alive' ? 0.35 : 0.15}) 60%,
              rgba(100, 85, 65, 0.1) 100%)
          `,
          boxShadow: `
            0 0 ${phase === 'alive' ? 80 : 40}px rgba(232, 213, 183, ${config.glowOpacity}),
            inset 0 0 ${phase === 'alive' ? 60 : 30}px rgba(232, 213, 183, ${config.glowOpacity * 0.5})
          `,
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
                rgba(232, 213, 183, ${phase === 'alive' ? 0.15 : 0.05}) 25%,
                transparent 50%,
                rgba(232, 213, 183, ${phase === 'alive' ? 0.1 : 0.03}) 75%,
                transparent 100%
              )
            `,
          }}
        />
      </div>

      {/* Data ring — orbiting dots */}
      <div
        className="absolute"
        style={{
          width: config.size + 80,
          height: config.size + 80,
        }}
      >
        {dots.map((angle, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: '#E8D5B7',
              boxShadow: '0 0 8px rgba(232, 213, 183, 0.6)',
              top: '50%',
              left: '50%',
              opacity: 0.8,
              transform: `rotate(${angle}deg) translateY(-${(config.size + 80) / 2}px) translateX(-3px) translateY(-3px)`,
            }}
          />
        ))}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes soul-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(${config.pulseScale}); }
        }
        @keyframes soul-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .soul-orb-pulse {
          animation: soul-pulse ease-in-out infinite;
        }
        .soul-orb-rotate {
          animation: soul-rotate 20s linear infinite;
        }
        @media (max-width: 640px) {
          .soul-orb-container { transform: scale(${config.mobileSize / config.size}); }
        }
      `}</style>
    </div>
  );
};

export default SoulOrb;
