/**
 * ArchetypeReveal — Step 2: Shows archetype loading state or the revealed
 * soul archetype with traits and CTA to enter the twin.
 */

import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { RevealedArchetype } from './onboardingTypes';

interface ArchetypeRevealProps {
  revealedArchetype: RevealedArchetype | null;
  onEnterTwin: () => void;
}

export const ArchetypeReveal: React.FC<ArchetypeRevealProps> = ({
  revealedArchetype,
  onEnterTwin,
}) => (
  <div className="flex flex-col items-center justify-center py-16">
    {!revealedArchetype ? (
      <div className="flex flex-col items-center gap-6">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10b77f' }} />
        <div className="text-center">
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontWeight: 400,
              color: 'var(--foreground)',
            }}
          >
            Discovering your archetype...
          </h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Weaving your digital footprint into a soul signature
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full max-w-lg text-center">
        <span
          className="text-[11px] font-medium tracking-widest uppercase block mb-4"
          style={{ color: '#10b77f', fontFamily: 'Inter, sans-serif' }}
        >
          Your Soul Archetype
        </span>

        <h2
          className="text-3xl mb-3"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--foreground)',
          }}
        >
          {revealedArchetype.archetype_name}
        </h2>

        {revealedArchetype.signature_quote && (
          <p className="text-sm italic mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {revealedArchetype.signature_quote}
          </p>
        )}

        {Array.isArray(revealedArchetype.core_traits) && revealedArchetype.core_traits.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {revealedArchetype.core_traits.slice(0, 5).map((trait, i) => {
              const label = typeof trait === 'string' ? trait : (trait as { trait?: string })?.trait ?? '';
              if (!label) return null;
              return (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-xs"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {revealedArchetype.first_impression && (
          <p
            className="text-sm leading-relaxed mb-8"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {revealedArchetype.first_impression}
          </p>
        )}

        <div className="my-8" style={{ borderTop: '1px solid var(--border-glass)' }} />

        <button
          onClick={onEnterTwin}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: '#10b77f',
            color: '#0a0f0a',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Enter your Twin
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
);
