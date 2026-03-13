import React from 'react';

interface PortfolioNarrativeProps {
  narrative: string;
  colorScheme: { primary: string; secondary: string; accent: string };
}

const PortfolioNarrative: React.FC<PortfolioNarrativeProps> = ({ narrative, colorScheme }) => {
  if (!narrative) return null;

  return (
    <section className="py-16 px-6 flex flex-col items-center">
      <div className="w-full max-w-lg text-center">
        {/* Decorative quote mark */}
        <div
          className="text-6xl leading-none mb-4 select-none"
          style={{
            fontFamily: 'Georgia, serif',
            color: colorScheme.primary,
            opacity: 0.3,
          }}
        >
          &ldquo;
        </div>

        {/* Narrative text */}
        <p
          className="leading-relaxed"
          style={{
            fontFamily: 'Georgia, serif',
            color: '#E8D5B7',
            fontSize: '18px',
            lineHeight: 1.7,
            opacity: 0.8,
          }}
        >
          {narrative}
        </p>
      </div>
    </section>
  );
};

export default PortfolioNarrative;
