import React from 'react';
import { motion } from 'framer-motion';

interface PortfolioNarrativeProps {
  narrative: string;
  colorScheme: { primary: string; secondary: string; accent: string };
}

const PortfolioNarrative: React.FC<PortfolioNarrativeProps> = ({ narrative, colorScheme }) => {
  if (!narrative) return null;

  return (
    <section className="py-16 px-6 flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-lg text-center"
      >
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
            fontFamily: 'var(--font-accent, Georgia, serif)',
            color: '#E8D5B7',
            fontSize: '18px',
            lineHeight: 1.7,
            opacity: 0.8,
          }}
        >
          {narrative}
        </p>
      </motion.div>
    </section>
  );
};

export default PortfolioNarrative;
