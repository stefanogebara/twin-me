import React from 'react';
import { ArrowRight } from 'lucide-react';
import SoulOrb from './SoulOrb';
import DataRevealItem from './DataRevealItem';
import CorrectionForm from './CorrectionForm';

type OrbPhase = 'dormant' | 'awakening' | 'alive';
type RevealSubView = 'data' | 'correction';

interface DataPoint {
  icon: string;
  label: string;
  value: string;
}

interface RevealPhaseProps {
  orbPhase: OrbPhase;
  userName: string;
  dataPoints: DataPoint[];
  narrative: string;
  showContinue: boolean;
  enrichError: string | null;
  identityConfirmed: boolean;
  revealSubView: RevealSubView;
  correctionName: string;
  correctionLinkedIn: string;
  isRetrying: boolean;
  retryCount: number;
  onConfirmIdentity: () => void;
  onNotMe: () => void;
  onAdvance: () => void;
  onCorrectionNameChange: (value: string) => void;
  onCorrectionLinkedInChange: (value: string) => void;
  onSearchAgain: () => void;
  onSkipEnrichment: () => void;
}

const RevealPhase: React.FC<RevealPhaseProps> = ({
  orbPhase,
  userName,
  dataPoints,
  narrative,
  showContinue,
  enrichError,
  identityConfirmed,
  revealSubView,
  correctionName,
  correctionLinkedIn,
  isRetrying,
  retryCount,
  onConfirmIdentity,
  onNotMe,
  onAdvance,
  onCorrectionNameChange,
  onCorrectionLinkedInChange,
  onSearchAgain,
  onSkipEnrichment,
}) => {
  return (
    <div className="flex flex-col items-center w-full max-w-lg transition-all duration-500">
      {/* Status text */}
      <p
        className="text-sm uppercase tracking-widest mb-8 text-center transition-all duration-300"
        style={{
          color: 'rgba(232, 213, 183, 0.5)',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.15em',
        }}
      >
        {orbPhase === 'dormant' && 'Discovering you...'}
        {orbPhase === 'awakening' && 'Piecing together your story...'}
        {orbPhase === 'alive' && (
          dataPoints.length === 0
            ? `Hello, ${userName.split(' ')[0]}`
            : `We found some info about ${userName.split(' ')[0]}`
        )}
      </p>

      {/* Soul Orb */}
      <div className="mb-8">
        <SoulOrb phase={orbPhase} dataPointCount={dataPoints.length} />
      </div>

      {/* Data points reveal (hidden during correction) */}
      {revealSubView === 'data' && dataPoints.length > 0 && (
        <div className="w-full max-w-sm mt-4 transition-all duration-300">
          {dataPoints.map((dp) => (
            <DataRevealItem
              key={dp.label}
              icon={dp.icon}
              label={dp.label}
              value={dp.value}
            />
          ))}
        </div>
      )}

      {/* Narrative (hidden during correction) */}
      {revealSubView === 'data' && narrative && (
        <p
          className="text-base leading-relaxed mt-6 text-center max-w-md transition-all duration-500"
          style={{
            color: 'rgba(232, 213, 183, 0.7)',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
          }}
        >
          {narrative.length > 500
            ? (() => {
                const chunk = narrative.slice(0, 500);
                const lastPeriod = chunk.lastIndexOf('.');
                return lastPeriod > 200 ? chunk.slice(0, lastPeriod + 1) : chunk.replace(/\s+\S*$/, '') + '...';
              })()
            : narrative}
        </p>
      )}

      {/* Error message */}
      {revealSubView === 'data' && enrichError && dataPoints.length === 0 && (
        <p
          className="text-sm text-center mt-6 max-w-sm transition-all duration-300"
          style={{
            color: 'rgba(232, 213, 183, 0.5)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {enrichError}
        </p>
      )}

      {/* Empty state */}
      {revealSubView === 'data' && orbPhase === 'alive' && dataPoints.length === 0 && !enrichError && (
        <p
          className="text-sm text-center mt-6 max-w-sm transition-all duration-300"
          style={{
            color: 'rgba(232, 213, 183, 0.5)',
            fontFamily: 'var(--font-body)',
          }}
        >
          We couldn't find much yet — no worries, let's build your profile together.
        </p>
      )}

      {/* Identity confirmation gate */}
      {revealSubView === 'data' && showContinue && dataPoints.length > 0 && !identityConfirmed && (
        <div className="w-full max-w-sm mt-8 transition-all duration-300">
          <div
            className="rounded-xl p-5 text-center"
            style={{
              background: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
            }}
          >
            <p
              className="text-sm mb-4"
              style={{ color: 'rgba(232, 213, 183, 0.8)', fontFamily: 'var(--font-body)' }}
            >
              Is this information about you?
            </p>
            <div className="flex gap-3">
              <button
                onClick={onConfirmIdentity}
                className="flex-1 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                  color: '#0C0C0C',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                }}
              >
                Yes, that's me
              </button>
              <button
                onClick={onNotMe}
                className="flex-1 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:opacity-80"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(232, 213, 183, 0.3)',
                  color: 'rgba(232, 213, 183, 0.7)',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                }}
              >
                Not me
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Continue button */}
      {revealSubView === 'data' && showContinue && (identityConfirmed || dataPoints.length === 0) && (
        <div className="flex flex-col items-center mt-8 transition-all duration-300">
          <button
            onClick={onAdvance}
            className="px-8 py-3 rounded-full text-base flex items-center gap-2 transition-all duration-200 hover:scale-[1.03]"
            style={{
              background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
              color: '#0C0C0C',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
            }}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {revealSubView === 'correction' && (
        <CorrectionForm
          name={correctionName}
          linkedIn={correctionLinkedIn}
          onNameChange={onCorrectionNameChange}
          onLinkedInChange={onCorrectionLinkedInChange}
          onSearchAgain={onSearchAgain}
          onSkip={onSkipEnrichment}
          isRetrying={isRetrying}
          retryCount={retryCount}
        />
      )}
    </div>
  );
};

export default RevealPhase;
