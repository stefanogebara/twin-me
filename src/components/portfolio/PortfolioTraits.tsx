import React from 'react';
import { getPlatformLogo } from '../PlatformLogos';

interface Trait {
  trait: string;
  score?: number;
  evidence?: string;
  source?: string;
}

interface PortfolioTraitsProps {
  traits: Trait[];
  colorScheme: { primary: string; secondary: string; accent: string };
}

const PortfolioTraits: React.FC<PortfolioTraitsProps> = ({ traits, colorScheme }) => {
  const visibleTraits = traits.slice(0, 6);

  if (visibleTraits.length === 0) return null;

  return (
    <section className="py-16 px-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        {/* Section label */}
        <p
          className="text-xs uppercase tracking-wider text-center mb-10 opacity-50"
          style={{ fontFamily: "'Inter', sans-serif", color: '#E8D5B7' }}
        >
          What Makes You, You
        </p>

        {/* Traits grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleTraits.map((trait, i) => {
            const score = typeof trait.score === 'number' ? Math.min(100, Math.max(0, trait.score)) : null;
            const SourceLogo = trait.source ? getPlatformLogo(trait.source) : null;

            return (
              <div
                key={i}
                className="space-y-2"
              >
                {/* Trait name + source icon */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
                  >
                    {trait.trait}
                  </span>
                  {SourceLogo && (
                    <span className="opacity-40">
                      <SourceLogo className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {score !== null && (
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'rgba(232, 213, 183, 0.08)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ backgroundColor: colorScheme.accent, width: `${score}%` }}
                    />
                  </div>
                )}

                {/* Evidence text */}
                {trait.evidence && (
                  <p
                    className="text-xs opacity-40 leading-relaxed"
                    style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
                  >
                    {trait.evidence}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PortfolioTraits;
