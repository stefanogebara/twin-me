import React from 'react';
import { getPlatformLogo } from '../PlatformLogos';
import { Section, List, Row } from '@/components/register';

interface Trait {
  trait: string;
  score?: number;
  evidence?: string;
  source?: string;
}

interface PortfolioTraitsProps {
  traits: Trait[];
  /** Kept for callers; the register sets the traits in ink. */
  colorScheme: { primary: string; secondary: string; accent: string };
}

/** Defining traits as rows: the source's icon, the trait, its evidence as the
 *  grey line, and the score as the one action. */
const PortfolioTraits: React.FC<PortfolioTraitsProps> = ({ traits }) => {
  const visibleTraits = traits.slice(0, 6);

  if (visibleTraits.length === 0) return null;

  return (
    <Section title="Defining traits">
      <List label="Defining traits" className="pb-figures">
        {visibleTraits.map((trait, i) => {
          const score = typeof trait.score === 'number' ? Math.round(Math.min(100, Math.max(0, trait.score))) : null;
          const SourceLogo = trait.source ? getPlatformLogo(trait.source) : null;
          return (
            <Row
              key={i}
              icon={SourceLogo ? <SourceLogo className="w-4 h-4" /> : undefined}
              title={trait.trait}
              line={trait.evidence}
              action={score !== null ? <span>{score}</span> : undefined}
            />
          );
        })}
      </List>
    </Section>
  );
};

export default PortfolioTraits;
