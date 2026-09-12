import React from 'react';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import PersonalizedQuestions from './PersonalizedQuestion';
import { PersonalizedQuestion } from '@/services/enrichmentService';

interface SoulSignature {
  archetype_name: string;
  core_traits: Array<{ trait: string; source: string }>;
  signature_quote: string;
  first_impression: string;
}

interface DeepeningPhaseProps {
  signature: SoulSignature | null;
  generatingSignature: boolean;
  signatureError: string | null;
  allQAnswered: boolean;
  loadingQuestions: boolean;
  personalizedQuestions: PersonalizedQuestion[];
  onQuestionAnswer: (questionId: string, answer: string, domain: string) => void;
  onAllQuestionsAnswered: () => void;
  onRetrySignature: () => void;
  onComplete: () => void;
  onGoDeeper: () => void;
}

const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <p className="rs-flow-line flex items-center justify-center gap-3 py-8">
    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
    {label}
  </p>
);

/** The quick questions, then the soul signature as a reading under the ink rule. */
const DeepeningPhase: React.FC<DeepeningPhaseProps> = ({
  signature,
  generatingSignature,
  signatureError,
  allQAnswered,
  loadingQuestions,
  personalizedQuestions,
  onQuestionAnswer,
  onAllQuestionsAnswered,
  onRetrySignature,
  onComplete,
  onGoDeeper,
}) => {
  const goDeeper = (
    <button type="button" onClick={onGoDeeper} className="n-btn n-btn--ghost">
      <Sparkles className="w-4 h-4" aria-hidden="true" />
      Go deeper: let your twin really know you
    </button>
  );

  return (
    <div className="rs-flow w-full max-w-lg">
      {/* Heading */}
      <div className="text-center mb-10" style={{ display: 'grid', gap: 4 }}>
        <h2 className="rs-flow-title">{signature ? 'Your soul signature' : 'A few quick taps'}</h2>
        {!signature && <p className="rs-flow-line">So your twin understands who you are</p>}
      </div>

      {/* Personalized Questions */}
      {!allQAnswered && (
        <>
          {loadingQuestions ? (
            <Spinner label="Preparing your questions" />
          ) : personalizedQuestions.length > 0 ? (
            <PersonalizedQuestions
              questions={personalizedQuestions}
              onAnswer={onQuestionAnswer}
              onAllAnswered={onAllQuestionsAnswered}
            />
          ) : (
            /* Questions unavailable (skip path or fetch failure) — never dead-end the phase (audit-2026-06-10) */
            <div className="flex flex-col items-center gap-4 mb-8">
              <p className="rs-flow-line text-center">
                We couldn't load your questions. You can go on; your twin keeps learning as you go.
              </p>
              <button type="button" onClick={onComplete} className="n-btn n-btn--primary pb-cta">
                Continue
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              {goDeeper}
            </div>
          )}
        </>
      )}

      {/* Generating signature spinner */}
      {generatingSignature && <Spinner label="Writing your soul signature" />}

      {/* Soul Signature: a reading under the ink rule, no card */}
      {signature && (
        <div
          className="mb-8"
          style={{ display: 'grid', gap: 8, padding: '20px 12px', borderTop: '1px solid var(--rg-ink)', borderBottom: '1px solid var(--rg-rule)', textAlign: 'left' }}
        >
          <h3 style={{ margin: 0 }}>{signature.archetype_name}</h3>
          <p className="rs-flow-line">
            {signature.signature_quote.replace(/^["'"]+|["'"]+$/g, '')}
          </p>
          <p className="rs-prose">{signature.first_impression}</p>
        </div>
      )}

      {/* Post-signature: Go Deeper or Enter World */}
      {signature && (
        <div className="flex flex-col items-center gap-4 mb-8">
          <button type="button" onClick={onComplete} className="n-btn n-btn--primary pb-cta">
            Enter my world
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
          {goDeeper}
        </div>
      )}

      {/* Pre-signature: questions done, generation failed or about to start (audit-2026-06-10) */}
      {!signature && !generatingSignature && allQAnswered && (
        signatureError ? (
          <div className="flex flex-col items-center gap-4 mb-8">
            <p className="rs-bad text-center" style={{ margin: 0 }}>{signatureError}</p>
            <button type="button" onClick={onRetrySignature} className="n-btn n-btn--primary pb-cta">
              Try again
            </button>
            <button type="button" onClick={onComplete} className="n-btn n-btn--ghost">
              Continue without it
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          /* Momentary: render gap between allQAnswered flipping and generateSignature starting */
          <div className="flex items-center justify-center gap-3 py-6 mb-8">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--rg-ink-2)' }} aria-label="Loading" />
          </div>
        )
      )}
    </div>
  );
};

export default DeepeningPhase;
