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
  allQAnswered: boolean;
  loadingQuestions: boolean;
  personalizedQuestions: PersonalizedQuestion[];
  onQuestionAnswer: (questionId: string, answer: string, domain: string) => void;
  onAllQuestionsAnswered: () => void;
  onComplete: () => void;
  onGoDeeper: () => void;
}

const DeepeningPhase: React.FC<DeepeningPhaseProps> = ({
  signature,
  generatingSignature,
  allQAnswered,
  loadingQuestions,
  personalizedQuestions,
  onQuestionAnswer,
  onAllQuestionsAnswered,
  onComplete,
  onGoDeeper,
}) => {
  return (
    <div className="w-full max-w-lg transition-all duration-500">
      {/* Heading */}
      <div className="text-center mb-8">
        <h2
          className="text-2xl md:text-3xl mb-2"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          {signature ? 'Your Soul Signature' : 'A few quick taps'}
        </h2>
        {!signature && (
          <p
            className="text-sm opacity-50"
            style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
          >
            Help your twin understand who you are
          </p>
        )}
      </div>

      {/* Personalized Questions */}
      {!allQAnswered && (
        <>
          {loadingQuestions ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8D5B7' }} />
              <span
                className="text-sm"
                style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: 'var(--font-body)' }}
              >
                Preparing your questions...
              </span>
            </div>
          ) : personalizedQuestions.length > 0 ? (
            <PersonalizedQuestions
              questions={personalizedQuestions}
              onAnswer={onQuestionAnswer}
              onAllAnswered={onAllQuestionsAnswered}
            />
          ) : null}
        </>
      )}

      {/* Generating signature spinner */}
      {generatingSignature && (
        <div className="flex items-center justify-center gap-3 py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8D5B7' }} />
          <span
            className="text-sm"
            style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: 'var(--font-body)' }}
          >
            Crafting your soul signature...
          </span>
        </div>
      )}

      {/* Soul Signature Card */}
      {signature && (
        <div
          className="rounded-2xl p-6 mb-6 transition-all duration-500"
          style={{
            backgroundColor: 'rgba(232, 213, 183, 0.06)',
            border: '1px solid rgba(232, 213, 183, 0.15)',
          }}
        >
          <p
            className="text-xs uppercase tracking-widest mb-3"
            style={{
              color: 'rgba(232, 213, 183, 0.4)',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.15em',
            }}
          >
            Your Soul Signature
          </p>
          <h3
            className="text-xl mb-2"
            style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
          >
            {signature.archetype_name}
          </h3>
          <p
            className="text-sm mb-3"
            style={{
              color: 'rgba(232, 213, 183, 0.7)',
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
            }}
          >
            "{signature.signature_quote.replace(/^["'"]+|["'"]+$/g, '')}"
          </p>
          <p
            className="text-sm leading-relaxed"
            style={{
              color: 'rgba(232, 213, 183, 0.6)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {signature.first_impression}
          </p>
        </div>
      )}

      {/* Post-signature: Go Deeper or Enter World */}
      {signature && (
        <div className="flex flex-col gap-3 mb-8 transition-all duration-300">
          <button
            onClick={onComplete}
            className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
              color: '#0C0C0C',
              fontFamily: 'var(--font-body)',
            }}
          >
            Enter My World
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onGoDeeper}
            className="w-full px-6 py-3 rounded-xl text-sm transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2"
            style={{
              background: 'transparent',
              border: '1px solid rgba(232, 213, 183, 0.2)',
              color: 'rgba(232, 213, 183, 0.7)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <Sparkles className="w-4 h-4" />
            Go Deeper — Let your twin really know you
          </button>
        </div>
      )}

      {/* Pre-signature CTA (questions done, waiting for signature) */}
      {!signature && !generatingSignature && allQAnswered && (
        <button
          onClick={onComplete}
          disabled
          className="w-full px-6 py-4 rounded-xl text-base font-medium flex items-center justify-center gap-2 mb-8 opacity-40"
          style={{
            background: 'transparent',
            color: '#E8D5B7',
            border: '1px solid rgba(232, 213, 183, 0.2)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
        </button>
      )}
    </div>
  );
};

export default DeepeningPhase;
