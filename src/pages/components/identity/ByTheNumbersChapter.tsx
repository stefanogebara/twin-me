import React from 'react';
import { RadarDataPoint } from '@/utils/dataTransformers';
import { SectionLabel, Divider } from './shared';

interface ByTheNumbersChapterProps {
  oceanCards: RadarDataPoint[];
}

const ByTheNumbersChapter: React.FC<ByTheNumbersChapterProps> = ({ oceanCards }) => (
  <>
    <SectionLabel label="By the Numbers" />
    <div className="grid grid-cols-2 gap-6">
      {[
        { value: oceanCards.find(o => o.trait === 'Openness')?.value ?? '--', unit: '%', label: 'Openness' },
        { value: oceanCards.find(o => o.trait === 'Conscientiousness')?.value ?? '--', unit: '%', label: 'Conscientiousness' },
        { value: oceanCards.find(o => o.trait === 'Extraversion')?.value ?? '--', unit: '%', label: 'Extraversion' },
        { value: oceanCards.find(o => o.trait === 'Agreeableness')?.value ?? '--', unit: '%', label: 'Agreeableness' },
      ].map((stat, i) => (
        <div key={i}>
          <span className="text-[28px] font-medium" style={{ color: 'var(--foreground)' }}>
            {stat.value}
            <span className="text-[11px] ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{stat.unit}</span>
          </span>
          <div className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</div>
        </div>
      ))}
    </div>
    <Divider />
  </>
);

export default ByTheNumbersChapter;
