import React, { useMemo } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface PortfolioRadarProps {
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
    mbti_code: string | null;
  };
  platformCount: number;
  colorScheme: { primary: string; secondary: string; accent: string };
}

const LABELS = ['Openness', 'Conscientiousness', 'Extraversion', 'Agreeableness', 'Emotional Stability'];

// Pentagon geometry: 5 vertices, starting from top (270 degrees), going clockwise
const ANGLE_OFFSET = -Math.PI / 2;
const getPoint = (index: number, radius: number, cx: number, cy: number) => {
  const angle = ANGLE_OFFSET + (2 * Math.PI * index) / 5;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
};

const PortfolioRadar: React.FC<PortfolioRadarProps> = ({ personality, platformCount, colorScheme }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  // Convert neuroticism to emotional stability (inverted)
  const scores = useMemo(() => [
    personality.openness,
    personality.conscientiousness,
    personality.extraversion,
    personality.agreeableness,
    Math.max(0, 100 - personality.neuroticism),
  ], [personality]);

  const cx = 150;
  const cy = 150;
  const maxR = 110;

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Data polygon points
  const dataPoints = scores.map((score, i) => {
    const r = (score / 100) * maxR;
    return getPoint(i, r, cx, cy);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Calculate path length for stroke animation
  const pathLength = useMemo(() => {
    let len = 0;
    for (let i = 0; i < dataPoints.length; i++) {
      const next = dataPoints[(i + 1) % dataPoints.length];
      const dx = next.x - dataPoints[i].x;
      const dy = next.y - dataPoints[i].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }, [dataPoints]);

  return (
    <section ref={ref} className="py-16 px-6 flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-xl rounded-2xl p-8 md:p-10"
        style={{
          background: 'linear-gradient(145deg, rgba(232, 213, 183, 0.06) 0%, rgba(232, 213, 183, 0.02) 100%)',
          border: '1px solid rgba(232, 213, 183, 0.12)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Section label */}
        <p
          className="text-xs uppercase tracking-wider text-center mb-8 opacity-50"
          style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
        >
          Personality Profile
        </p>

        {/* SVG Radar */}
        <div className="flex justify-center mb-6">
          <svg viewBox="0 0 300 300" className="w-full max-w-xs">
            {/* Grid rings */}
            {rings.map((scale) => {
              const ringPoints = Array.from({ length: 5 }, (_, i) => getPoint(i, maxR * scale, cx, cy));
              const ringPath = ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
              return (
                <path
                  key={scale}
                  d={ringPath}
                  fill="none"
                  stroke="rgba(232, 213, 183, 0.1)"
                  strokeWidth="1"
                />
              );
            })}

            {/* Axis lines */}
            {Array.from({ length: 5 }, (_, i) => {
              const p = getPoint(i, maxR, cx, cy);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={p.x}
                  y2={p.y}
                  stroke="rgba(232, 213, 183, 0.08)"
                  strokeWidth="1"
                />
              );
            })}

            {/* Data fill */}
            <motion.path
              d={dataPath}
              fill={`${colorScheme.primary}30`}
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />

            {/* Data stroke (animated) */}
            <motion.path
              d={dataPath}
              fill="none"
              stroke={colorScheme.primary}
              strokeWidth="2"
              strokeLinejoin="round"
              initial={{ strokeDasharray: pathLength, strokeDashoffset: pathLength }}
              animate={isInView ? { strokeDashoffset: 0 } : { strokeDashoffset: pathLength }}
              transition={{ duration: 1.2, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            />

            {/* Data points */}
            {dataPoints.map((p, i) => (
              <motion.circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="4"
                fill={colorScheme.primary}
                initial={{ opacity: 0, scale: 0 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
              />
            ))}

            {/* Labels */}
            {LABELS.map((label, i) => {
              const p = getPoint(i, maxR + 24, cx, cy);
              return (
                <text
                  key={i}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(232, 213, 183, 0.6)"
                  fontSize="10"
                  fontFamily="var(--font-body)"
                >
                  {label}
                </text>
              );
            })}

            {/* Score values near data points */}
            {scores.map((score, i) => {
              const p = getPoint(i, (score / 100) * maxR + 14, cx, cy);
              return (
                <motion.text
                  key={`score-${i}`}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colorScheme.primary}
                  fontSize="9"
                  fontFamily="var(--font-body)"
                  fontWeight="600"
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.8 + i * 0.1 }}
                >
                  {Math.round(score)}
                </motion.text>
              );
            })}
          </svg>
        </div>

        {/* MBTI badge */}
        {personality.mbti_code && (
          <div className="flex justify-center mb-4">
            <span
              className="px-4 py-1.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: `${colorScheme.primary}15`,
                border: `1px solid ${colorScheme.primary}30`,
                color: colorScheme.primary,
                fontFamily: 'var(--font-body)',
              }}
            >
              {personality.mbti_code}
            </span>
          </div>
        )}

        {/* Platform count */}
        <p
          className="text-xs text-center opacity-40"
          style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
        >
          Based on {platformCount} platform{platformCount !== 1 ? 's' : ''}
        </p>
      </motion.div>
    </section>
  );
};

export default PortfolioRadar;
