import React from 'react';
import { Compass, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../../components/ui/tooltip';
import { GlassPanel } from '../../../components/layout/PageLayout';
import { PersonalityScores, SoulSignature, MBTI_DIMENSIONS, ThemeColors } from './types';

interface PersonalityTypePanelProps {
  personalityScores: PersonalityScores;
  soulSignature: SoulSignature | null;
  colors: ThemeColors;
}

const MBTIDimensionBar: React.FC<{
  dimension: keyof typeof MBTI_DIMENSIONS;
  value: number;
  confidence?: number;
  colors: ThemeColors;
}> = ({ dimension, value, confidence, colors }) => {
  const { textMuted, textFaint, subtleBg } = colors;
  const info = MBTI_DIMENSIONS[dimension];
  const isHigh = value >= 50;
  const percentage = isHigh ? value : 100 - value;
  const letter = isHigh ? info.highLetter : info.lowLetter;

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs font-medium uppercase tracking-wider cursor-help flex items-center gap-1" style={{ color: textMuted }}>
                {info.name}
                <HelpCircle className="w-3 h-3 opacity-50" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">{info.description}</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: info.color }}>
              {letter}
            </span>
            <span className="text-xs" style={{ color: textMuted }}>
              {Math.round(percentage)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs w-20 text-right cursor-help" style={{
                color: !isHigh ? info.color : textFaint,
                fontWeight: !isHigh ? 600 : 400
              }}>
                {info.lowLabel}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-sm font-medium mb-1">{info.lowLabel} ({info.lowLetter})</p>
              <p className="text-xs opacity-80">{info.lowDesc}</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex-1 relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: subtleBg }}>
            <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{
              backgroundColor: 'rgba(0, 0, 0, 0.1)'
            }} />
            <div
              className="absolute h-full rounded-full transition-all duration-500"
              style={{
                left: value < 50 ? `${value}%` : '50%',
                width: `${Math.abs(value - 50)}%`,
                backgroundColor: info.color,
                opacity: confidence ? 0.4 + (confidence / 100) * 0.6 : 0.8
              }}
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs w-20 cursor-help" style={{
                color: isHigh ? info.color : textFaint,
                fontWeight: isHigh ? 600 : 400
              }}>
                {info.highLabel}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="text-sm font-medium mb-1">{info.highLabel} ({info.highLetter})</p>
              <p className="text-xs opacity-80">{info.highDesc}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};

export const PersonalityTypePanel: React.FC<PersonalityTypePanelProps> = ({
  personalityScores,
  soulSignature,
  colors
}) => {
  const { textColor, textMuted, textFaint } = colors;

  return (
    <GlassPanel className="!p-5 md:!p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(45, 39, 34, 0.08)' }}>
          <Compass className="w-5 h-5" style={{ color: '#000000' }} />
        </div>
        <div>
          <h3 className="text-sm" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            Personality Type
          </h3>
          <p className="text-xs" style={{ color: textMuted }}>
            16personalities-style type from your behavioral patterns
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6 p-4 rounded-xl" style={{
        backgroundColor: 'rgba(45, 39, 34, 0.06)',
        border: '1px solid rgba(45, 39, 34, 0.12)'
      }}>
        <div className="flex items-center gap-1">
          {(personalityScores.archetype_code || 'XXXX-X').split('').map((letter: string, i: number) => {
            if (letter === '-') return <span key={i} className="text-2xl font-light" style={{ color: textFaint }}>-</span>;
            const mbtiColors = [
              MBTI_DIMENSIONS.mind.color,
              MBTI_DIMENSIONS.energy.color,
              MBTI_DIMENSIONS.nature.color,
              MBTI_DIMENSIONS.tactics.color,
              MBTI_DIMENSIONS.identity.color
            ];
            const colorIndex = i > 4 ? 4 : i;
            return (
              <span key={i} className="text-3xl font-bold" style={{ color: mbtiColors[colorIndex] }}>
                {letter}
              </span>
            );
          })}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium" style={{ color: textColor }}>
            {soulSignature?.archetype_name || 'Your Unique Type'}
          </div>
          <div className="text-xs" style={{ color: textMuted }}>
            Based on your assessment and behavioral patterns
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <MBTIDimensionBar dimension="mind" value={personalityScores.mind ?? personalityScores.extraversion ?? 50} confidence={personalityScores.mind_ci ?? personalityScores.extraversion_confidence} colors={colors} />
        <MBTIDimensionBar dimension="energy" value={personalityScores.energy ?? personalityScores.openness ?? 50} confidence={personalityScores.energy_ci ?? personalityScores.openness_confidence} colors={colors} />
        <MBTIDimensionBar dimension="nature" value={personalityScores.nature ?? personalityScores.agreeableness ?? 50} confidence={personalityScores.nature_ci ?? personalityScores.agreeableness_confidence} colors={colors} />
        <MBTIDimensionBar dimension="tactics" value={personalityScores.tactics ?? personalityScores.conscientiousness ?? 50} confidence={personalityScores.tactics_ci ?? personalityScores.conscientiousness_confidence} colors={colors} />
        <MBTIDimensionBar dimension="identity" value={personalityScores.identity ?? (100 - (personalityScores.neuroticism ?? 50))} confidence={personalityScores.identity_ci ?? personalityScores.neuroticism_confidence} colors={colors} />
      </div>
    </GlassPanel>
  );
};
