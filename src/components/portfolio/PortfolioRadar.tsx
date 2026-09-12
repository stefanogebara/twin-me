import React, { useMemo } from 'react';
import { Section, List, Row } from '@/components/register';

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
  /** Kept for callers; the chart draws in the register's personality hue. */
  colorScheme: { primary: string; secondary: string; accent: string };
}

const LABELS = ['Openness', 'Conscientiousness', 'Extraversion', 'Agreeableness', 'Emotional stability'];

/* SVG presentation attributes do not resolve var(), so the register's values are
   written out: the hairline (--rg-rule) and the personality hue (--rg-iris). */
const RULE = '#eae9ea';
const IRIS = '#8179fb';

// Pentagon geometry: 5 vertices, starting from top (270 degrees), going clockwise
const ANGLE_OFFSET = -Math.PI / 2;
const getPoint = (index: number, radius: number, cx: number, cy: number) => {
  const angle = ANGLE_OFFSET + (2 * Math.PI * index) / 5;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
};

/** Personality: the radar beside its five scores. The scores are rows, so the
 *  chart carries no text of its own. */
const PortfolioRadar: React.FC<PortfolioRadarProps> = ({ personality, platformCount }) => {
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
  const maxR = 130;

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Data polygon points
  const dataPoints = scores.map((score, i) => {
    const r = (score / 100) * maxR;
    return getPoint(i, r, cx, cy);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  const basis = `Based on ${platformCount} platform${platformCount !== 1 ? 's' : ''}`;

  return (
    <Section
      title="Personality"
      line={personality.mbti_code ? `${basis}. Type ${personality.mbti_code}.` : `${basis}.`}
    >
      <div className="sh-radar">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          {rings.map((scale) => {
            const ringPoints = Array.from({ length: 5 }, (_, i) => getPoint(i, maxR * scale, cx, cy));
            const ringPath = ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
            return <path key={scale} d={ringPath} fill="none" stroke={RULE} strokeWidth="1" />;
          })}

          {Array.from({ length: 5 }, (_, i) => {
            const p = getPoint(i, maxR, cx, cy);
            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={RULE} strokeWidth="1" />;
          })}

          <path d={dataPath} fill={IRIS} fillOpacity="0.14" />
          <path d={dataPath} fill="none" stroke={IRIS} strokeWidth="2" strokeLinejoin="round" />
          {dataPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill={IRIS} />
          ))}
        </svg>

        <List label="Personality scores" className="sh-compact pb-figures">
          {LABELS.map((label, i) => (
            <Row key={label} title={label} action={<span>{Math.round(scores[i])}</span>} />
          ))}
        </List>
      </div>
    </Section>
  );
};

export default PortfolioRadar;
