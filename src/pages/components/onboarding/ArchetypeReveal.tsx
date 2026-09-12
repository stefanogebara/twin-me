/**
 * ArchetypeReveal — Step 2: the archetype loading state, or the revealed
 * soul archetype with its traits and the call to enter the twin. A section of
 * the page kit: an upright Cosmos heading, one grey line, then the reading.
 */

import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { RevealedArchetype } from './onboardingTypes';
import { Section } from '@/components/register';

interface ArchetypeRevealProps {
  revealedArchetype: RevealedArchetype | null;
  onEnterTwin: () => void;
}

export const ArchetypeReveal: React.FC<ArchetypeRevealProps> = ({
  revealedArchetype,
  onEnterTwin,
}) => {
  if (!revealedArchetype) {
    return (
      <Section
        title="Finding your archetype"
        line={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Reading your platforms into a soul signature
          </span>
        }
      >
        <span />
      </Section>
    );
  }

  const traits = Array.isArray(revealedArchetype.core_traits)
    ? revealedArchetype.core_traits
        .slice(0, 5)
        .map((trait) => (typeof trait === 'string' ? trait : (trait as { trait?: string })?.trait ?? ''))
        .filter(Boolean)
    : [];

  return (
    <Section title={revealedArchetype.archetype_name} line={revealedArchetype.signature_quote || undefined}>
      <div style={{ display: 'grid', gap: 12, paddingTop: 20, borderTop: '1px solid var(--rg-ink)' }}>
        {traits.length > 0 && <p className="rs-strong" style={{ margin: 0 }}>{traits.join(' · ')}</p>}
        {revealedArchetype.first_impression && (
          <p className="rs-prose">{revealedArchetype.first_impression}</p>
        )}
      </div>

      <div className="rs-cta">
        <button type="button" onClick={onEnterTwin} className="n-btn n-btn--primary pb-cta">
          View your Soul Signature
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </Section>
  );
};
