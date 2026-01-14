/**
 * PersonalityRadarChart - Interactive radar visualization for Big Five/MBTI scores
 *
 * Features:
 * - Animated radar chart with customizable colors
 * - Works with both Big Five (5 dimensions) and MBTI (4 dimensions)
 * - Hover tooltips with detailed scores
 * - Theme-aware styling
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

interface PersonalityScore {
  label: string;
  value: number; // 0-100 for percentile, or T-score
  color?: string;
  description?: string;
}

interface PersonalityRadarChartProps {
  scores: PersonalityScore[];
  size?: number;
  showLabels?: boolean;
  showValues?: boolean;
  animated?: boolean;
  fillOpacity?: number;
  title?: string;
  subtitle?: string;
}

// Default colors for Big Five dimensions
const DEFAULT_COLORS = [
  '#8b5cf6', // Openness - Purple
  '#22c55e', // Conscientiousness - Green
  '#f59e0b', // Extraversion - Amber
  '#06b6d4', // Agreeableness - Cyan
  '#ef4444', // Neuroticism - Red
];

export function PersonalityRadarChart({
  scores,
  size = 300,
  showLabels = true,
  showValues = true,
  animated = true,
  fillOpacity = 0.3,
  title,
  subtitle,
}: PersonalityRadarChartProps) {
  const { theme } = useTheme();

  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c',
    gridLine: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    accent: theme === 'dark' ? '#C1C0B6' : '#44403c',
  };

  const center = size / 2;
  const radius = size * 0.35; // Leave room for labels
  const n = scores.length;
  const angleStep = (2 * Math.PI) / n;

  // Calculate polygon points for a given set of values
  const calculatePoints = useMemo(() => {
    return scores.map((score, i) => {
      const angle = i * angleStep - Math.PI / 2; // Start from top
      const normalizedValue = Math.max(0, Math.min(100, score.value)) / 100;
      const r = radius * normalizedValue;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        labelX: center + (radius + 30) * Math.cos(angle),
        labelY: center + (radius + 30) * Math.sin(angle),
        score,
        angle,
      };
    });
  }, [scores, center, radius, angleStep]);

  // Create SVG path for the data polygon
  const dataPath = useMemo(() => {
    if (calculatePoints.length === 0) return '';
    return calculatePoints
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ') + ' Z';
  }, [calculatePoints]);

  // Create grid circles
  const gridCircles = [20, 40, 60, 80, 100];

  // Calculate average color from scores or use gradient
  const fillColor = scores[0]?.color || DEFAULT_COLORS[0];

  return (
    <div className="flex flex-col items-center">
      {/* Title */}
      {title && (
        <div className="text-center mb-4">
          <h3
            className="text-lg font-medium"
            style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {subtitle}
            </p>
          )}
        </div>
      )}

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid circles */}
        {gridCircles.map((percent) => (
          <circle
            key={percent}
            cx={center}
            cy={center}
            r={(radius * percent) / 100}
            fill="none"
            stroke={colors.gridLine}
            strokeWidth={1}
          />
        ))}

        {/* Grid lines from center to each point */}
        {calculatePoints.map((point, i) => (
          <line
            key={`grid-${i}`}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(point.angle)}
            y2={center + radius * Math.sin(point.angle)}
            stroke={colors.gridLine}
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <motion.path
          d={dataPath}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={fillColor}
          strokeWidth={2}
          initial={animated ? { scale: 0, opacity: 0 } : undefined}
          animate={animated ? { scale: 1, opacity: 1 } : undefined}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ transformOrigin: 'center' }}
        />

        {/* Data points */}
        {calculatePoints.map((point, i) => (
          <motion.circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r={5}
            fill={point.score.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            stroke={theme === 'dark' ? '#1a1a18' : '#fff'}
            strokeWidth={2}
            initial={animated ? { scale: 0 } : undefined}
            animate={animated ? { scale: 1 } : undefined}
            transition={{ delay: 0.4 + i * 0.1, duration: 0.3 }}
          />
        ))}

        {/* Labels */}
        {showLabels &&
          calculatePoints.map((point, i) => {
            // Calculate text anchor based on position
            let textAnchor: 'start' | 'middle' | 'end' = 'middle';
            let dy = 0;

            if (point.labelX < center - 10) {
              textAnchor = 'end';
            } else if (point.labelX > center + 10) {
              textAnchor = 'start';
            }

            if (point.labelY < center - 10) {
              dy = -5;
            } else if (point.labelY > center + 10) {
              dy = 15;
            }

            return (
              <g key={`label-${i}`}>
                <text
                  x={point.labelX}
                  y={point.labelY + dy}
                  textAnchor={textAnchor}
                  fontSize={12}
                  fontWeight={500}
                  fill={point.score.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                >
                  {point.score.label}
                </text>
                {showValues && (
                  <text
                    x={point.labelX}
                    y={point.labelY + dy + 14}
                    textAnchor={textAnchor}
                    fontSize={11}
                    fill={colors.textSecondary}
                  >
                    {Math.round(point.score.value)}%
                  </text>
                )}
              </g>
            );
          })}
      </svg>

      {/* Legend (optional, for detailed view) */}
      {scores.some((s) => s.description) && (
        <div className="mt-4 w-full max-w-md space-y-2">
          {scores.map((score, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: score.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
              />
              <span style={{ color: colors.text }}>{score.label}</span>
              <span style={{ color: colors.textSecondary }} className="ml-auto">
                {Math.round(score.value)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Preset configurations for common use cases
export function BigFiveRadarChart({
  openness,
  conscientiousness,
  extraversion,
  agreeableness,
  neuroticism,
  ...props
}: {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
} & Omit<PersonalityRadarChartProps, 'scores'>) {
  const scores: PersonalityScore[] = [
    { label: 'Openness', value: openness, color: '#8b5cf6' },
    { label: 'Conscientiousness', value: conscientiousness, color: '#22c55e' },
    { label: 'Extraversion', value: extraversion, color: '#f59e0b' },
    { label: 'Agreeableness', value: agreeableness, color: '#06b6d4' },
    { label: 'Neuroticism', value: neuroticism, color: '#ef4444' },
  ];

  return <PersonalityRadarChart scores={scores} {...props} />;
}

export function MBTIRadarChart({
  mind,
  energy,
  nature,
  tactics,
  identity,
  ...props
}: {
  mind: number;
  energy: number;
  nature: number;
  tactics: number;
  identity?: number;
} & Omit<PersonalityRadarChartProps, 'scores'>) {
  const scores: PersonalityScore[] = [
    { label: mind >= 50 ? 'Extraverted' : 'Introverted', value: mind, color: '#8b5cf6' },
    { label: energy >= 50 ? 'Intuitive' : 'Observant', value: energy, color: '#22c55e' },
    { label: nature >= 50 ? 'Feeling' : 'Thinking', value: nature, color: '#f59e0b' },
    { label: tactics >= 50 ? 'Judging' : 'Prospecting', value: tactics, color: '#06b6d4' },
  ];

  if (identity !== undefined) {
    scores.push({
      label: identity >= 50 ? 'Assertive' : 'Turbulent',
      value: identity,
      color: '#ef4444',
    });
  }

  return <PersonalityRadarChart scores={scores} {...props} />;
}

export default PersonalityRadarChart;
