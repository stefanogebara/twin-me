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
    <SectionLabel label="OCEAN Profile" color="rgba(255,255,255,0.6)" />
    <div className="space-y-3">
      {oceanCards.map((oc) => (
        <OceanBar key={oc.trait} trait={oc.trait} value={oc.value} />
      ))}
    </div>
    {/* Sampling params (temp, top_p) are internal — not shown to users */}
    <Divider />
  </>
);

export default PersonalityChapter;
