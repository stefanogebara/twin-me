import React from 'react';
import { Section } from '@/components/register';

interface PortfolioNarrativeProps {
  narrative: string;
  /** Kept for callers; the register sets the narrative in ink. */
  colorScheme: { primary: string; secondary: string; accent: string };
}

/** The narrative: the one paragraph the page holds, under the ink rule. */
const PortfolioNarrative: React.FC<PortfolioNarrativeProps> = ({ narrative }) => {
  if (!narrative) return null;

  return (
    <Section title="The portrait">
      <div className="sh-prose"><p>{narrative}</p></div>
    </Section>
  );
};

export default PortfolioNarrative;
