import React from 'react';
import { RadarDataPoint } from '@/utils/dataTransformers';
import { SectionLabel, Divider, OceanBar } from './shared';

interface PersonalityChapterProps {
  oceanCards: RadarDataPoint[];
  temperature: number | null;
  topP: number | null;
  confidence: number | null;
}

const PersonalityChapter: React.FC<PersonalityChapterProps> = ({
  oceanCards,
  temperature,
  topP,
  confidence,
}) => (
  <>
    <SectionLabel label="Personality" color="#c17e2c" />
    <div className="space-y-3">
      {oceanCards.map((oc) => (
        <OceanBar key={oc.trait} trait={oc.trait} value={oc.value} />
      ))}
    </div>
    {temperature != null && topP != null && (
      <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
        temp {temperature.toFixed(2)} · top_p {topP.toFixed(3)} · confidence {Math.round((confidence ?? 0) * 100)}%
      </p>
    )}
    <Divider />
  </>
);

export default PersonalityChapter;
