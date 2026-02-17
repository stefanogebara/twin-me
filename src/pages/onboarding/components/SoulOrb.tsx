import React from 'react';
import { motion } from 'framer-motion';

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
      <motion.div
        className="absolute rounded-full"
        animate={{
          scale: [1, config.pulseScale, 1],
          opacity: [config.glowOpacity * 0.5, config.glowOpacity, config.glowOpacity * 0.5],
        }}
        transition={{
          duration: config.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          width: config.size + 60,
          height: config.size + 60,
          background: 'radial-gradient(circle, rgba(232, 213, 183, 0.15) 0%, transparent 70%)',
        }}
      />

      {/* Main orb */}
      <motion.div
        className="relative rounded-full"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{
          scale: [1, config.pulseScale, 1],
          opacity: 1,
          width: config.size,
          height: config.size,
        }}
        transition={{
          scale: { duration: config.pulseDuration, repeat: Infinity, ease: 'easeInOut' },
          opacity: { duration: 1 },
          width: { type: 'spring', stiffness: 60, damping: 20 },
          height: { type: 'spring', stiffness: 60, damping: 20 },
        }}
        style={{
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
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
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
      </motion.div>

      {/* Data ring — orbiting dots */}
      <div
        className="absolute"
        style={{
          width: config.size + 80,
          height: config.size + 80,
        }}
      >
        {dots.map((angle, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.8 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
              delay: i * 0.08,
            }}
            style={{
              width: 6,
              height: 6,
              backgroundColor: '#E8D5B7',
              boxShadow: '0 0 8px rgba(232, 213, 183, 0.6)',
              top: '50%',
              left: '50%',
              transform: `rotate(${angle}deg) translateY(-${(config.size + 80) / 2}px) translateX(-3px) translateY(-3px)`,
            }}
          />
        ))}
      </div>

      {/* Mobile size override via CSS class */}
      <style>{`
        @media (max-width: 640px) {
          .soul-orb-container { transform: scale(${config.mobileSize / config.size}); }
        }
      `}</style>
    </div>
  );
};

export default SoulOrb;
