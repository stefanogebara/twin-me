import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface SoulSignature {
  archetype_name: string;
  core_traits: Array<{ trait: string; source: string }>;
  signature_quote: string;
  first_impression: string;
}

interface InterviewCompletionProps {
  enhancedSignature: SoulSignature | undefined;
  summary: string;
  onComplete: () => void;
}

const InterviewCompletion: React.FC<InterviewCompletionProps> = ({
  enhancedSignature,
  summary,
  onComplete,
}) => {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)' }}
      >
        <Sparkles className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
      </div>

      <div className="text-center">
        <p
          className="text-lg mb-1"
          style={{
            fontFamily: 'Instrument Serif, Georgia, serif',
            fontWeight: 500,
            color: 'var(--foreground)',
          }}
        >
          Interview Complete
        </p>

        {enhancedSignature?.archetype_name && (
          <p
            className="text-sm font-medium mb-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Your archetype: {enhancedSignature.archetype_name}
          </p>
        )}

        {enhancedSignature?.first_impression && (
          <p
            className="text-xs leading-relaxed max-w-sm mx-auto mb-1"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Geist', sans-serif" }}
          >
            {enhancedSignature.first_impression}
          </p>
        )}

        {enhancedSignature?.signature_quote && (
          <p
            className="text-xs leading-relaxed max-w-sm mx-auto mt-2"
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'Instrument Serif, Georgia, serif',
              fontStyle: 'italic',
              opacity: 0.8,
            }}
          >
            "{enhancedSignature.signature_quote}"
          </p>
        )}

        {!enhancedSignature && summary && (
          <p
            className="text-sm leading-relaxed max-w-sm mx-auto"
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'Instrument Serif, Georgia, serif',
              fontStyle: 'italic',
            }}
          >
            {summary}
          </p>
        )}
      </div>

      {enhancedSignature?.core_traits && enhancedSignature.core_traits.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
          {enhancedSignature.core_traits.slice(0, 5).map((t, i) => (
            <span
              key={i}
              className="px-2.5 py-1 rounded-full text-[11px]"
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-glass)',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Geist', sans-serif",
              }}
            >
              {t.trait}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full px-6 py-4 rounded-full text-sm font-normal flex items-center justify-center gap-2 transition-colors mt-2"
        style={{
          backgroundColor: 'var(--foreground)',
          color: 'var(--background)',
          fontFamily: "'Geist', sans-serif",
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          fontSize: '12px',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Enter My World
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default InterviewCompletion;
