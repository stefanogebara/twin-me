import React from 'react';
import { Target, ArrowRight } from 'lucide-react';
import { GlassPanel } from '../../../components/layout/PageLayout';
import { BigFiveRadarChart } from '@/components/PersonalityRadarChart';
import { PersonalityScores, ThemeColors } from './types';

interface BigFivePanelProps {
  personalityScores: PersonalityScores | null;
  onNavigateToBigFive: () => void;
  colors: ThemeColors;
}

export const BigFivePanel: React.FC<BigFivePanelProps> = ({
  personalityScores,
  onNavigateToBigFive,
  colors
}) => {
  const { textColor, textSecondary, textMuted, textFaint, subtleBg } = colors;

  return (
    <GlassPanel className="!p-5 md:!p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(193, 192, 182, 0.1)' }}>
            <Target className="w-5 h-5" style={{ color: '#C1C0B6' }} />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Big Five Personality Profile
            </h3>
            <p className="text-xs" style={{ color: textMuted }}>
              Scientific IPIP-NEO-120 assessment
            </p>
          </div>
        </div>
        <button
          onClick={onNavigateToBigFive}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{
            backgroundColor: 'rgba(193, 192, 182, 0.1)',
            color: textColor,
            border: '1px solid rgba(193, 192, 182, 0.2)'
          }}
        >
          Take Assessment
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm mb-6" style={{ color: textSecondary }}>
        The scientifically validated IPIP-NEO-120 assessment measures five core personality dimensions with T-score normalization against 619,000+ respondents.
      </p>

      {personalityScores ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="flex justify-center">
            <BigFiveRadarChart
              openness={personalityScores.openness || 50}
              conscientiousness={personalityScores.conscientiousness || 50}
              extraversion={personalityScores.extraversion || 50}
              agreeableness={personalityScores.agreeableness || 50}
              neuroticism={personalityScores.neuroticism || 50}
              size={280}
              showValues={true}
              animated={true}
            />
          </div>

          <div className="space-y-4">
            {[
              { name: 'Openness', value: personalityScores.openness, color: '#9B59B6', desc: 'Creativity & intellectual curiosity' },
              { name: 'Conscientiousness', value: personalityScores.conscientiousness, color: '#3498DB', desc: 'Organization & dependability' },
              { name: 'Extraversion', value: personalityScores.extraversion, color: '#E74C3C', desc: 'Sociability & positive emotions' },
              { name: 'Agreeableness', value: personalityScores.agreeableness, color: '#2ECC71', desc: 'Cooperation & trust' },
              { name: 'Neuroticism', value: personalityScores.neuroticism, color: '#F39C12', desc: 'Emotional sensitivity' },
            ].map((trait) => (
              <div key={trait.name} className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: trait.color }} />
                    <span className="text-sm font-medium" style={{ color: textColor }}>{trait.name}</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: trait.color }}>{Math.round(trait.value || 50)}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: subtleBg }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${trait.value || 50}%`, backgroundColor: trait.color, opacity: 0.7 }}
                  />
                </div>
                <p className="text-xs" style={{ color: textFaint }}>{trait.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Target className="w-12 h-12 mx-auto mb-4" style={{ color: textFaint }} />
          <p className="mb-4" style={{ color: textMuted }}>
            Complete the assessment to see your Big Five personality profile
          </p>
          <button
            onClick={onNavigateToBigFive}
            className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))', color: '#1a1a17', boxShadow: '0 2px 12px var(--accent-vibrant-glow)' }}
          >
            Start Big Five Assessment
          </button>
        </div>
      )}
    </GlassPanel>
  );
};
